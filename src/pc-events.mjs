import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { config } from "./config.mjs";
import { log, warn } from "./log.mjs";

/**
 * Aviso de "respuesta terminada" leyendo el registro de la sesion.
 *
 * El registro (`session.v4.jsonl.zstd`) es una secuencia de frames zstd y anota
 * `turn/start` y `turn/end`. El aviso se emite cuando aparece un `turn/end`
 * nuevo: es la senal real de que la respuesta termino.
 *
 * Antes se usaba "el archivo lleva N segundos sin crecer", y eso avisaba en cada
 * pausa del modelo o de una herramienta: varias notificaciones por respuesta.
 *
 * Solo se descomprimen los frames nuevos, asi que vigilar sesiones grandes no
 * cuesta mas que vigilar pequenas.
 */

const SESSION_ROOT = path.join(config.dshHome, "sessions");
const POLL_MS = 2000;
const MAX_TRACKED = 5;
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

// P46: topes de memoria. Un frame zstd puede estar a medio escribir mientras el
// modelo responde, asi que no se puede reservar "todo lo nuevo" en cada sondeo
// (una respuesta larga hacia crecer el buffer sin limite). Se lee como maximo
// MAX_READ_BYTES por pasada y se retiene como pendiente el frame incompleto
// hasta MAX_PENDING_BYTES; un frame mayor se descarta con aviso en el log.
const MAX_READ_BYTES = 1024 * 1024;
const MAX_PENDING_BYTES = 2 * 1024 * 1024;
const EMPTY_BUFFER = Buffer.alloc(0);

const subscribers = new Set();
let timer = null;
let watching = false;

// ruta -> { offset, pending }
// `offset` es la posicion absoluta del primer byte de `pending`; `pending`
// guarda el frame incompleto que se reintentara en el siguiente sondeo.
const state = new Map();

const broadcast = (event) => {
  const payload = JSON.stringify(event);
  for (const res of subscribers) {
    try {
      if (!res.writableEnded) res.write(`data: ${payload}\n\n`);
    } catch {}
  }
};

/** Registros nuevos desde la ultima lectura, sin re-descomprimir lo ya visto. */
const readNewRecords = (file, previous) => {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { records: [], next: previous };
  }

  // Archivo truncado o reemplazado: se vuelve a empezar sin avisar del pasado.
  if (stat.size < previous.offset) {
    return { records: [], next: { offset: 0, pending: EMPTY_BUFFER } };
  }

  const pendingBytes = previous.pending ? previous.pending.length : 0;
  const available = stat.size - previous.offset - pendingBytes;
  if (available <= 0 && pendingBytes === 0) return { records: [], next: previous };

  // P46: lectura acotada por pasada; el resto se procesa en los siguientes
  // sondeos. Asi el vigilante nunca reserva de golpe un archivo grande.
  let fresh = EMPTY_BUFFER;
  if (available > 0) {
    const toRead = Math.min(available, MAX_READ_BYTES);
    try {
      const fd = fs.openSync(file, "r");
      try {
        const allocation = Buffer.allocUnsafe(toRead);
        const read = fs.readSync(fd, allocation, 0, toRead, previous.offset + pendingBytes);
        fresh = read === toRead ? allocation : allocation.subarray(0, read);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return { records: [], next: previous };
    }
  }

  const buffer = pendingBytes > 0 && fresh.length > 0
    ? Buffer.concat([previous.pending, fresh], pendingBytes + fresh.length)
    : (pendingBytes > 0 ? previous.pending : fresh);

  const offsets = [];
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    if (buffer[i] === FRAME_MAGIC[0] && buffer[i + 1] === FRAME_MAGIC[1]
      && buffer[i + 2] === FRAME_MAGIC[2] && buffer[i + 3] === FRAME_MAGIC[3]) {
      offsets.push(i);
    }
  }

  const records = [];
  const decode = (start, end) => {
    const text = zlib.zstdDecompressSync(buffer.subarray(start, end)).toString("utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {}
    }
  };

  // P46: cada frame se decodifica desde su magic hasta el siguiente. Si el
  // limite "magico" cae dentro del propio frame (falso positivo del patron) el
  // trozo queda partido y la descompresion falla; en vez de atascarse para
  // siempre, se prueba con el limite posterior. Solo se para al llegar a un
  // frame incompleto al final (el que se reintenta desde su offset).
  let consumed = 0;
  let nextFrame = 0;
  while (nextFrame < offsets.length) {
    const start = offsets[nextFrame];
    let decodedEnd = -1;
    for (let endIndex = nextFrame + 1; endIndex <= offsets.length; endIndex += 1) {
      const end = endIndex < offsets.length ? offsets[endIndex] : buffer.length;
      try {
        decode(start, end);
        decodedEnd = end;
        nextFrame = endIndex;
        break;
      } catch {}
    }
    if (decodedEnd < 0) break;
    consumed = decodedEnd;
    if (nextFrame >= offsets.length) break;
  }

  // `offset` apunta al inicio del frame incompleto (o al final ya consumido) y
  // `pending` conserva solo esos bytes: en el siguiente sondeo se reintenta
  // unicamente desde ahi. Los bytes basura previos al primer magic se saltan.
  let offset = previous.offset + consumed;
  let pending = buffer.subarray(consumed);

  // P46: si un frame incompleto excede el tope, se descarta para no crecer sin
  // limite ni quedarse clavado; se avanza al siguiente magic si existe.
  if (pending.length > MAX_PENDING_BYTES) {
    let nextMagic = -1;
    for (let i = 4; i + 4 <= pending.length; i += 1) {
      if (pending[i] === FRAME_MAGIC[0] && pending[i + 1] === FRAME_MAGIC[1]
        && pending[i + 2] === FRAME_MAGIC[2] && pending[i + 3] === FRAME_MAGIC[3]) {
        nextMagic = i;
        break;
      }
    }
    warn("pc", `Frame zstd incompleto de mas de ${MAX_PENDING_BYTES} bytes en ${file}; se descarta`);
    if (nextMagic > 0) {
      offset += nextMagic;
      pending = pending.subarray(nextMagic);
    } else {
      offset += pending.length;
      pending = EMPTY_BUFFER;
    }
  }

  return { records, next: { offset, pending } };
};

const recentSessionFiles = () => {
  const found = [];
  let spaces;
  try {
    spaces = fs.readdirSync(SESSION_ROOT, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const space of spaces) {
    if (!space.isDirectory()) continue;
    const spaceDir = path.join(SESSION_ROOT, space.name);
    let sessions;
    try {
      sessions = fs.readdirSync(spaceDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const file = path.join(spaceDir, session.name, "session.v4.jsonl.zstd");
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      found.push({ file, size: stat.size, mtimeMs: stat.mtimeMs, session: session.name, space: space.name });
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, MAX_TRACKED);
};

const tick = () => {
  const recent = recentSessionFiles();

  for (const current of recent) {
    const previous = state.get(current.file);
    if (!previous) {
      // Primera observacion: se toma el archivo como ya leido.
      state.set(current.file, { offset: current.size, pending: EMPTY_BUFFER });
      continue;
    }

    const { records, next } = readNewRecords(current.file, previous);
    state.set(current.file, next);
    if (records.length === 0) continue;

    for (const record of records) {
      if (record.type !== "turn/end") continue;
      // P45: el nombre del espacio/sesion solo queda en el log local. En el
      // evento SSE viajaba a TODOS los suscriptores (cada dispositivo
      // emparejado), filtrando en que conversaciones trabaja el equipo.
      log("pc", `Turno ${record.data?.turn ?? "?"} terminado en ${current.space}/${current.session}`);
      broadcast({
        type: "response-finished",
        turn: record.data?.turn ?? null,
        at: new Date().toISOString(),
      });
    }
  }

  const alive = new Set(recent.map((item) => item.file));
  for (const key of state.keys()) {
    if (!alive.has(key)) state.delete(key);
  }
};

export const startPcWatcher = () => {
  if (watching) return;
  watching = true;
  timer = setInterval(tick, POLL_MS);
  if (timer.unref) timer.unref();
  log("pc", "Vigilando turnos de sesion para avisar al telefono");
};

export const emitTestEvent = () => {
  // P45: el evento de prueba tampoco incluye nombres de espacio/sesion.
  broadcast({
    type: "response-finished",
    turn: null,
    test: true,
    at: new Date().toISOString(),
  });
  return subscribers.size;
};

export const handlePcEvents = (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify({ type: "hello", at: new Date().toISOString() })}\n\n`);
  subscribers.add(res);
  startPcWatcher();

  const keepAlive = setInterval(() => {
    try {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    } catch {}
  }, 25000);

  const cleanup = () => {
    clearInterval(keepAlive);
    subscribers.delete(res);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);
};

