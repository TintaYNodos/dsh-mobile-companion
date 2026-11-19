/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Persistencia de las notas del telefono.
 *
 * La validacion y el render del Markdown viven en notes-format.mjs; aqui queda
 * el estado en disco: el archivo .md, la bandeja `inbox.jsonl` y el indice
 * `ids.json` de idempotencia. Se extrae de routes-notes.mjs (que se queda con el
 * HTTP) para no mezclar la escritura con el despacho de rutas y para respetar el
 * tope de 400 lineas por archivo.
 *
 * Cada nota produce dos efectos:
 *
 *   1. `synced_chats/notes/AAAA-MM-DD-HHMMSS-<slug>.md` con front matter YAML,
 *      despues `# titulo` y el cuerpo neutralizado.
 *   2. Una linea JSON en `synced_chats/notes/inbox.jsonl` con los metadatos que
 *      consume la PC (el endpoint GET /dsh-companion/notes la lee).
 *
 * Idempotencia: el telefono puede enviar un `id` estable. `ids.json` guarda el
 * mapa id -> nombre de archivo con escritura atomica; si el id ya existe se
 * reemplaza el contenido del MISMO archivo (nunca se crea un duplicado) y la
 * respuesta incluye `updated: true`. Las notas sin id siguen creando un archivo
 * nuevo. Las escrituras se serializan para que dos reintentos simultaneos del
 * mismo id no reserven dos nombres. Las entradas del indice cuyo archivo ya no
 * existe se descartan (saneado), la retencion no poda `ids.json` y se mantiene
 * el indice legible `notes/INDICE.md` (se rehace al guardar, al podar y al arrancar).
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { stripControlChars } from "./http.mjs";
import { sanitizeLogMessage } from "./log.mjs";
import { NOTE_ID_RE, noteBaseName, renderNote } from "./notes-format.mjs";
import { assertInside, writeAtomic } from "./sync-index.mjs";
import { INBOX_MAX_LINES, NOTES_INDEX_FILE, ORPHAN_MIN_AGE_MS, capNotesInboxSafe, cleanupNotesTempFiles, queueInboxWrite, refreshNotesIndexSafe, sanitizeNotesStore } from "./sync-retention.mjs";

/** POST /dsh-companion/notes: cuerpo maximo permitido, en bytes. */
export const NOTES_MAX_BYTES = 64 * 1024;
/** Subcarpeta de synced_chats/ donde viven las notas escritas desde el telefono. */
export const NOTES_DIR_NAME = "notes";
/** Bandeja que consume el lado PC: una linea JSON por nota. */
export const INBOX_FILE_NAME = "inbox.jsonl";
/** Indice id -> archivo para que reenviar la misma nota no cree duplicados. */
export const IDS_FILE_NAME = "ids.json";
/** Tope duro de cada linea de la bandeja, en bytes. */
const INBOX_LINE_MAX_BYTES = 2 * 1024;
const TAGS_MAX = 10;

export const notesDirectory = () => path.join(config.syncDir, NOTES_DIR_NAME);
const idsPath = () => assertInside(notesDirectory(), IDS_FILE_NAME);
const inboxPath = () => assertInside(notesDirectory(), INBOX_FILE_NAME);

/** Nombre de archivo de nota aceptado por el indice y por la bandeja. */
const isNoteFileName = (name) =>
  typeof name === "string" &&
  name.length > 3 &&
  name.endsWith(".md") &&
  name !== NOTES_INDEX_FILE &&
  !name.includes("/") &&
  !name.includes("\\") &&
  !name.includes("..") &&
  !/[\u0000-\u001f\u007f]/.test(name);

/**
 * Indice id -> archivo. Un JSON corrupto o con entradas invalidas no rompe la
 * escritura: se parte de un mapa vacio y se reconstruye a medida que se guardan
 * notas. Las entradas cuyo archivo ya no existe se descartan (saneado).
 */
const loadIndex = () => {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(idsPath(), "utf8"));
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const index = {};
  for (const [id, file] of Object.entries(parsed)) {
    if (NOTE_ID_RE.test(id) && isNoteFileName(file)) index[id] = file;
  }
  return index;
};

const pruneIndex = (index) => {
  let changed = false;
  for (const [id, file] of Object.entries(index)) {
    if (fs.existsSync(assertInside(notesDirectory(), file))) continue;
    delete index[id];
    changed = true;
  }
  return changed;
};

const persistIndex = async (index) => {
  const contents = Object.keys(index).length === 0 ? "{}\n" : `${JSON.stringify(index, null, 2)}\n`;
  await writeAtomic(idsPath(), contents);
};

/** createdAt de una nota ya escrita, para conservarla al actualizar por id. */
const readExistingCreatedAt = (filePath) => {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const match = /^createdAt: ("(?:[^"\\]|\\.)*")$/m.exec(text);
    if (!match) return "";
    const parsed = JSON.parse(match[1]);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
};

/** Sanea un valor para una linea JSON: sin saltos ni caracteres de control. */
const inboxText = (value) => stripControlChars(String(value ?? "")).trim();

/** Registro de la bandeja: exactamente los metadatos que consume la PC. */
const buildInboxRecord = (note, file, now) => ({
  file,
  id: note.id || "",
  title: inboxText(note.title),
  profile: note.profile,
  type: inboxText(note.type),
  project: inboxText(note.project),
  subject: inboxText(note.subject),
  tags: note.tags.map(inboxText),
  status: inboxText(note.status),
  priority: note.priority,
  dueDate: inboxText(note.dueDate),
  createdAt: inboxText(note.createdAt),
  receivedAt: now.toISOString(),
  updatedAt: now.toISOString(),
});

/**
 * Serializa el registro como UNA linea JSON de como maximo 2 KB. Los topes de
 * la ruta ya lo dejan por debajo en el caso normal; si el escapado de comillas
 * y barras engorda la linea, se recortan los textos mas largos en vez de partir
 * el JSON.
 */
const fitInboxLine = (record) => {
  let serialized = JSON.stringify(record);
  const shrink = () => {
    for (const key of ["title", "subject", "project", "type", "status"]) {
      if (record[key]) {
        record[key] = record[key].slice(0, Math.floor(record[key].length / 2));
        return true;
      }
    }
    if (record.tags.length > 0) {
      record.tags = record.tags.slice(0, -1);
      return true;
    }
    return false;
  };
  while (Buffer.byteLength(serialized, "utf8") > INBOX_LINE_MAX_BYTES && shrink()) {
    serialized = JSON.stringify(record);
  }
  return serialized;
};

const readInboxRaw = () => {
  try {
    return fs.readFileSync(inboxPath(), "utf8");
  } catch {
    return null;
  }
};

/**
 * Escribe (o reemplaza) la linea de la nota en `inbox.jsonl` con escritura
 * atomica; la actualizada queda al final, que es de donde lee el lado PC. Todo
 * el ciclo leer-modificar-escribir va en la cola de la bandeja que comparte con
 * la poda del sync (H-20) y se recorta aqui al tope (antes: `stat` por linea).
 */
const upsertInboxLine = (line, file) =>
  queueInboxWrite(async () => {
    const raw = readInboxRaw();
    const lines = raw === null ? [] : raw.split("\n").filter((entry) => entry.trim() !== "");
    const kept = lines.filter((entry) => {
      try {
        return JSON.parse(entry).file !== file;
      } catch {
        return true;
      }
    });
    kept.push(line);
    await writeAtomic(inboxPath(), `${kept.slice(-INBOX_MAX_LINES).join("\n")}\n`);
  });

/** Agrega la linea de la nota a la bandeja sin tumbar la escritura si falla. */
const syncInbox = async (note, file, now) => {
  try {
    await upsertInboxLine(fitInboxLine(buildInboxRecord(note, file, now)), file);
  } catch (error) {
    // La nota ya esta en disco: se responde 200 y se deja rastro de la bandeja
    // degradada, para no duplicar el .md si el cliente reintenta.
    console.error(sanitizeLogMessage(`[notes] No se pudo anotar la nota en ${INBOX_FILE_NAME}: ${error.message}`));
  }
};

/** Marca de reserva atomica: el .md solo aparece completo (rename), nunca a 0 bytes. */
const RESERVE_SUFFIX = ".reserve";

/**
 * H-18: reserva un nombre unico con `wx` sobre un sidecar `.reserve` en vez de
 * crear el .md definitivo. El .md se escribe despues con temporal + rename, de
 * modo que un SIGKILL deja a lo sumo un temporal/reserva (que el saneado borra),
 * nunca un .md de 0 bytes. La reserva `wx` conserva la exclusion entre notas y
 * sigue saltando nombres ocupados (-2, -3, ...).
 */
const reserveNoteName = async (directory, note, now) => {
  const base = noteBaseName(note, now);
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const candidate = attempt === 1 ? `${base}.md` : `${base}-${attempt}.md`;
    // Un .md ya presente ocupa el nombre (la reserva wx sobre el sidecar solo
    // detecta otra reserva en vuelo, no un archivo ya escrito).
    if (fs.existsSync(assertInside(directory, candidate))) continue;
    const reservation = assertInside(directory, `${candidate}${RESERVE_SUFFIX}`);
    try {
      const handle = await fs.promises.open(reservation, "wx", 0o600);
      await handle.close();
      return { file: candidate, reservation };
    } catch (error) {
      if (error.code === "EEXIST") continue;
      throw error;
    }
  }
  throw Object.assign(new Error("No se pudo reservar un nombre unico para la nota"), { statusCode: 500 });
};

const releaseReservation = async (reservation) => {
  try {
    await fs.promises.rm(reservation, { force: true });
  } catch {
    // El saneado de arranque la borra si no se pudo aqui.
  }
};

/** Contenido del .md con escritura atomica sobre el nombre ya reservado. */
const commitNoteFile = (directory, file, contents) => writeAtomic(assertInside(directory, file), contents);

const logIndexFailure = (error) =>
  console.error(sanitizeLogMessage(`[notes] No se pudo actualizar ${IDS_FILE_NAME}: ${error.message}`));

// H-19: saneado al arrancar. Borra temporales/reservas de un corte y los .md de
// 0 bytes de una reserva incompleta. Las entradas del indice cuyo archivo ya no
// existe se descartan al guardar; reenviar el mismo id recrea el archivo.
try {
  sanitizeNotesStore();
} catch {
  // Un saneado incompleto no impide arrancar: se reintenta en cada guardado.
}

/** Escritura de una nota ya validada, sin serializar. Devuelve {file, updated}. */
const saveNoteUnlocked = async (note) => {
  const directory = notesDirectory();
  await fs.promises.mkdir(directory, { recursive: true });

  const now = new Date();
  const index = note.id ? loadIndex() : null;
  if (index) pruneIndex(index);

  const createdAt = note.createdAt || now.toISOString();

  // Idempotencia: si el id ya apunta a un archivo que existe, se reemplaza el
  // contenido de ESE archivo (mismo nombre, sin duplicado).
  const existing = note.id ? index[note.id] : "";
  if (existing) {
    const filePath = assertInside(directory, existing);
    const updatedNote = { ...note, createdAt: note.createdAt || readExistingCreatedAt(filePath) || createdAt };
    await writeAtomic(filePath, renderNote(updatedNote, now));
    await syncInbox(updatedNote, existing, now);
    return { file: existing, updated: true };
  }

  const fresh = { ...note, createdAt };
  const contents = renderNote(fresh, now);
  const { file, reservation } = await reserveNoteName(directory, fresh, now);
  let indexed = false;
  try {
    // H-19: el nombre se reserva en ids.json ANTES de escribir el contenido. Si
    // el proceso muere entre ambos pasos, el indice apunta a un archivo que no
    // existe y el saneado descarta esa entrada: NUNCA queda un archivo sin
    // indice (que es lo que hacia que reenviar el mismo id duplicara la nota).
    if (note.id) {
      index[note.id] = file;
      indexed = true;
      try {
        await persistIndex(index);
      } catch (error) {
        logIndexFailure(error);
        throw Object.assign(new Error("No se pudo reservar el id de la nota"), { statusCode: 500 });
      }
    }
    await commitNoteFile(directory, file, contents);
  } catch (error) {
    if (indexed) {
      delete index[note.id];
      try {
        await persistIndex(index);
      } catch {
        // Si tampoco se puede reescribir, el saneado lo descartara al faltar el .md.
      }
    }
    throw error;
  } finally {
    await releaseReservation(reservation);
  }
  await syncInbox(fresh, file, now);
  return { file, updated: false };
};

/**
 * Serializa las escrituras de notas: dos reintentos simultaneos del mismo id no
 * pueden ver el indice vacio a la vez y reservar dos nombres distintos.
 */
let writeQueue = Promise.resolve();
const serialize = (task) => {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

/**
 * Guarda una nota (crear o actualizar por id); devuelve {file, updated}.
 *
 * H-20: la poda rapida de la bandeja corre DENTRO de la misma cola. Antes
 * `capNotesInboxSafe()` se ejecutaba fuera de `serialize` y dos POST
 * concurrentes reescribian `inbox.jsonl` a la vez: EPERM en Windows y `.tmp`
 * huerfanos. Los temporales de un proceso muerto se limpian al arrancar y en
 * cada guardado.
 */
export const saveNote = (note) =>
  serialize(async () => {
    cleanupNotesTempFiles({ maxAgeMs: ORPHAN_MIN_AGE_MS });
    const result = await saveNoteUnlocked(note);
    await capNotesInboxSafe();
    await refreshNotesIndexSafe();
    return result;
  });
// Arranque: si notes/ ya existe se rehace el indice en la misma cola (nada viejo).
if (fs.existsSync(notesDirectory())) void serialize(refreshNotesIndexSafe);
/** Convierte el valor textual de una fecha en milisegundos (0 si no se puede). */
const stampMs = (value) => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Lista las notas recibidas para GET /dsh-companion/notes: lee las ultimas
 * `INBOX_MAX_LINES` (500, el mismo tope que retiene la poda; H-13) lineas de la
 * bandeja, tolera lineas corruptas, deduplica por archivo (gana la linea mas
 * reciente) y ordena por `receivedAt` descendente. Nunca expone el cuerpo. Incluye el `id` estable del telefono ("" si la nota no lo trae) para
 * que la PC pueda correlacionar y deduplicar sin depender solo del nombre de
 * archivo, igual que hacen el front matter y la propia bandeja.
 */
export const listInboxNotes = () => {
  const raw = readInboxRaw();
  if (raw === null) return [];
  const lines = raw.split("\n").filter((entry) => entry.trim() !== "").slice(-INBOX_MAX_LINES);
  const byFile = new Map();
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue; // linea corrupta o de otro productor: se ignora
    }
    if (record === null || typeof record !== "object" || Array.isArray(record)) continue;
    const file = inboxText(record.file);
    if (!isNoteFileName(file)) continue;
    byFile.set(file, record);
  }
  const notes = [...byFile.values()].map((record) => ({
    file: inboxText(record.file),
    id: inboxText(record.id),
    title: inboxText(record.title),
    profile: inboxText(record.profile),
    type: inboxText(record.type),
    project: inboxText(record.project),
    subject: inboxText(record.subject),
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag) => typeof tag === "string").map(inboxText).slice(0, TAGS_MAX)
      : [],
    status: inboxText(record.status),
    priority: inboxText(record.priority),
    dueDate: inboxText(record.dueDate),
    createdAt: inboxText(record.createdAt),
    receivedAt: inboxText(record.receivedAt),
  }));
  notes.sort((left, right) => stampMs(right.receivedAt) - stampMs(left.receivedAt));
  return notes;
};
