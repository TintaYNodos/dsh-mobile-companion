import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { config } from "./config.mjs";
import { log } from "./log.mjs";

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

const subscribers = new Set();
let timer = null;
let watching = false;

// ruta -> { offset }
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
    return { records: [], next: { offset: 0 } };
  }
  if (stat.size === previous.offset) return { records: [], next: previous };

  let chunk;
  try {
    const fd = fs.openSync(file, "r");
    chunk = Buffer.alloc(stat.size - previous.offset);
    fs.readSync(fd, chunk, 0, chunk.length, previous.offset);
    fs.closeSync(fd);
  } catch {
    return { records: [], next: previous };
  }

  const buffer = chunk;
  const offsets = [];
  for (let i = 0; i + 4 <= buffer.length; i++) {
    if (buffer[i] === FRAME_MAGIC[0] && buffer[i + 1] === FRAME_MAGIC[1]
      && buffer[i + 2] === FRAME_MAGIC[2] && buffer[i + 3] === FRAME_MAGIC[3]) {
      offsets.push(i);
    }
  }

  if (offsets.length === 0) {
    return { records: [], next: previous };
  }

  const records = [];
  let consumed = 0;
  for (let n = 0; n < offsets.length; n++) {
    const start = offsets[n];
    const end = n + 1 < offsets.length ? offsets[n + 1] : buffer.length;
    const slice = buffer.subarray(start, end);
    try {
      const text = zlib.zstdDecompressSync(slice).toString("utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          records.push(JSON.parse(trimmed));
        } catch {}
      }
      consumed = end;
    } catch {
      // Frame a medio escribir: se conserva desde aqui para el siguiente turno.
      break;
    }
  }

  // El offset avanza hasta el ultimo frame descomprimido completo: si el ultimo
  // esta a medias, se re-lee desde ahi en la siguiente pasada.
  return { records, next: { offset: previous.offset + consumed } };
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
      state.set(current.file, { offset: current.size });
      continue;
    }

    const { records, next } = readNewRecords(current.file, previous);
    state.set(current.file, next);
    if (records.length === 0) continue;

    for (const record of records) {
      if (record.type !== "turn/end") continue;
      log("pc", `Turno ${record.data?.turn ?? "?"} terminado en ${current.space}/${current.session}`);
      broadcast({
        type: "response-finished",
        session: current.session,
        space: current.space,
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

export const stopWatching = () => {
  watching = false;
  if (timer) clearInterval(timer);
  timer = null;
};

export const emitTestEvent = () => {
  broadcast({
    type: "response-finished",
    session: "prueba",
    space: "Prueba manual",
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

export const pcEventsSubscribers = () => subscribers.size;
