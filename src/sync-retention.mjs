/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (Business Source License 1.1) / Business Source License 1.1.
 * See companion/LICENSE or LICENSE for license terms.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { assertInside, readDirSafe, rebuildIndex, writeAtomic } from "./sync-index.mjs";

/* ------------------------------------------------------------------------- *
 * P9: retencion de synced_chats/.
 *
 * Los chats sincronizados y las notas del telefono crecian sin limite. Ahora se
 * podan los mas antiguos (por fecha de modificacion del par .json/.md) cuando
 * se supera cualquiera de los topes configurables, y se reconstruye
 * index.jsonl si falta. Topes: DSH_SYNC_MAX_FILES (200) y
 * DSH_SYNC_MAX_TOTAL_MB (200).
 *
 * La bandeja de notas `notes/inbox.jsonl` guarda metadatos en claro para la PC,
 * asi que tambien se acota: se conservan como maximo las ultimas 500 lineas y
 * se descartan las no correlacionables (JSON roto o sin `file` valido) y las que
 * apuntan a un .md que ya no existe (huerfanas de la poda o de un borrado
 * manual). La poda completa corre en cada sync de chats; ademas, tras escribir
 * una nota se aplica un modo rapido que solo mira el tope (routes-notes.mjs),
 * para que usar solo notas tampoco haga crecer la bandeja sin limite.
 * `notes/ids.json` no se poda nunca.
 * ------------------------------------------------------------------------- */

const DEFAULT_SYNC_MAX_FILES = 200;
const DEFAULT_SYNC_MAX_TOTAL_MB = 200;
/** Indice id -> archivo de notes/ (mismo nombre que IDS_FILE_NAME en notes-store.mjs). */
const NOTES_IDS_FILE = "ids.json";
/** Subcarpeta de synced_chats/ con las notas del telefono. */
const NOTES_DIR_NAME = "notes";
/** Bandeja de metadatos de las notas (mismo nombre que INBOX_FILE_NAME en notes-store.mjs). */
const NOTES_INBOX_FILE = "inbox.jsonl";
/**
 * Tope de lineas de la bandeja que se conservan (las mas recientes). Tambien es
 * el tope que lee GET /dsh-companion/notes (H-13): antes leia 200 mientras la
 * bandeja retenia 500, asi que las 300 mas antiguas eran invisibles.
 */
export const INBOX_MAX_LINES = 500;
/** Marca de reserva atomica de nombre de nota (misma que notes-store.mjs). */
const RESERVE_SUFFIX = ".reserve";
/**
 * Antiguedad a partir de la cual un `.tmp`/`.reserve` se considera huerfano de
 * un proceso muerto. Por debajo de eso puede ser una escritura en curso de otra
 * ruta (sync de chats) y no se toca.
 */
export const ORPHAN_MIN_AGE_MS = 60_000;

/**
 * H-20: limpia temporales de escritura atomica (`.tmp`) y reservas de nombre
 * (`.reserve`) que dejo un corte a mitad de escritura. `maxAgeMs = 0` los borra
 * todos (saneado de arranque, sin escritores vivos); con edad minima se puede
 * llamar en cada poda sin pisar una escritura en curso.
 */
export const cleanupNotesTempFiles = ({ maxAgeMs = 0, now = Date.now() } = {}) => {
  const directory = path.join(config.syncDir, NOTES_DIR_NAME);
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return 0; // sin notes/: nada que limpiar
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.includes(".tmp") && !entry.name.endsWith(RESERVE_SUFFIX)) continue;
    const fullPath = path.join(directory, entry.name);
    try {
      if (maxAgeMs > 0 && now - fs.statSync(fullPath).mtimeMs < maxAgeMs) continue;
      fs.rmSync(fullPath, { force: true });
      removed += 1;
    } catch {
      // Otro proceso ya lo borro: el estado deseado es el mismo.
    }
  }
  return removed;
};

/**
 * H-18/H-19: saneado de arranque del almacen de notas. Borra los temporales y
 * reservas de un corte y los `.md` de 0 bytes (reserva incompleta de una version
 * anterior). Nunca borra una nota completa: el .md se escribe con temp+rename,
 * asi que solo puede existir a 0 bytes si quedo a medias.
 */
export const sanitizeNotesStore = () => {
  const removed = cleanupNotesTempFiles();
  const directory = path.join(config.syncDir, NOTES_DIR_NAME);
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return removed;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !isNoteFileName(entry.name)) continue;
    try {
      const fullPath = path.join(directory, entry.name);
      if (fs.statSync(fullPath).size === 0) fs.rmSync(fullPath, { force: true });
    } catch {
      // Ya no existe: nada que sanear.
    }
  }
  return removed;
};

/** Lee un tope entero positivo de una variable de entorno, con valor por defecto. */
const envPositiveInt = (name, fallback) => {
  const parsed = Number.parseInt(String(process.env[name] ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Agrupa `<id>.json` + `<id>.md` de una carpeta en unidades podables, para no
 * dejar un .json sin su .md al aplicar la retencion. `skipFiles` protege
 * archivos que no forman parte del par podable (en notes/ se salta ids.json,
 * el indice id -> archivo de la idempotencia de notas: si se podara, reenviar
 * una nota desde el telefono crearia un duplicado).
 */
const collectChatUnits = async (directory, skipFiles = null) => {
  const units = new Map();
  for (const entry of await readDirSafe(directory)) {
    if (!entry.isFile()) continue;
    if (entry.name === "index.jsonl" || entry.name.includes(".tmp")) continue;
    if (skipFiles && skipFiles.has(entry.name)) continue;
    const match = /^(.+?)\.(json|md)$/.exec(entry.name);
    if (!match) continue;
    const id = match[1];
    let stat;
    try {
      stat = await fs.promises.stat(assertInside(directory, entry.name));
    } catch {
      continue;
    }
    const unit = units.get(id) ?? { id, files: [], bytes: 0, mtimeMs: 0 };
    unit.files.push(path.join(directory, entry.name));
    unit.bytes += stat.size;
    unit.mtimeMs = Math.max(unit.mtimeMs, stat.mtimeMs);
    units.set(id, unit);
  }
  return [...units.values()];
};

/**
 * Nombre de nota aceptado por la bandeja (mismo criterio que notes-store.mjs):
 * un .md suelto dentro de notes/, sin rutas ni saltos.
 */
const isNoteFileName = (name) =>
  typeof name === "string" &&
  name.length > 3 &&
  name.endsWith(".md") &&
  !name.includes("/") &&
  !name.includes("\\") &&
  !name.includes("..") &&
  !/[\u0000-\u001f\u007f]/.test(name);

/**
 * Poda la bandeja de notas. Se queda con las lineas correlacionables (JSON con
 * un `file` que sigue existiendo) y como maximo las ultimas INBOX_MAX_LINES:
 * asi los metadatos en claro no se guardan para siempre y la poda de un .md no
 * deja su linea huerfana. Nunca toca `ids.json`. Devuelve cuantas lineas quito.
 *
 * `quick` es el camino que se ejecuta tras cada nota: si la bandeja no supera
 * el tope termina sin recorrer el disco (la limpieza de huerfanas queda para la
 * poda completa de `pruneSyncedChats`). Con mas de 500 lineas hace la poda
 * completa igualmente, para no dejar crecer la bandeja si no hay syncs.
 */
const pruneNotesInbox = async (directory, { quick = false } = {}) => {
  // H-20: en cada poda se limpian los temporales huerfanos (con edad minima para
  // no pisar una escritura en curso de la cola de notas).
  cleanupNotesTempFiles({ maxAgeMs: ORPHAN_MIN_AGE_MS });
  let raw;
  try {
    raw = await fs.promises.readFile(assertInside(directory, NOTES_INBOX_FILE), "utf8");
  } catch {
    return 0; // sin bandeja (o sin notes/): no hay nada que podar
  }
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  if (quick && lines.length <= INBOX_MAX_LINES) return 0;
  const alive = [];
  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue; // linea corrupta: no es correlacionable ni se puede validar
    }
    if (record === null || typeof record !== "object" || Array.isArray(record)) continue;
    if (!isNoteFileName(record.file)) continue;
    let exists = false;
    try {
      exists = (await fs.promises.stat(assertInside(directory, record.file))).isFile();
    } catch {
      exists = false;
    }
    if (exists) alive.push(line);
  }
  const kept = alive.slice(-INBOX_MAX_LINES);
  const contents = kept.length === 0 ? "" : `${kept.join("\n")}\n`;
  if (contents !== raw) await writeAtomic(assertInside(directory, NOTES_INBOX_FILE), contents);
  return lines.length - kept.length;
};

/**
 * P9: poda los chats y notas mas antiguos si se superan los topes. Devuelve
 * cuantas unidades elimino. Incluye synced_chats/notes/ para que los topes de
 * archivos y de MB cubran tambien las notas escritas desde el telefono. Al
 * final poda siempre la bandeja de notas (independiente de los topes): es la
 * unica copia de metadatos en claro y no debe crecer sin limite.
 */
export const pruneSyncedChats = async () => {
  const maxFiles = envPositiveInt("DSH_SYNC_MAX_FILES", DEFAULT_SYNC_MAX_FILES);
  const maxTotalBytes = envPositiveInt("DSH_SYNC_MAX_TOTAL_MB", DEFAULT_SYNC_MAX_TOTAL_MB) * 1024 * 1024;

  const notesDir = path.join(config.syncDir, NOTES_DIR_NAME);
  const units = [
    ...(await collectChatUnits(config.syncDir)),
    ...(await collectChatUnits(notesDir, new Set([NOTES_IDS_FILE]))),
  ];
  units.sort((a, b) => a.mtimeMs - b.mtimeMs || a.id.localeCompare(b.id));

  let totalBytes = units.reduce((sum, unit) => sum + unit.bytes, 0);
  let remaining = units.length;
  let removed = 0;

  for (const unit of units) {
    if (remaining <= maxFiles && totalBytes <= maxTotalBytes) break;
    // Nunca vaciar la carpeta: el chat recien guardado (el mas nuevo) se queda.
    if (remaining <= 1) break;
    let deleted = false;
    for (const file of unit.files) {
      try {
        await fs.promises.unlink(file);
        deleted = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (!deleted) continue;
    remaining -= 1;
    totalBytes -= unit.bytes;
    removed += 1;
  }

  if (removed > 0) await rebuildIndex();
  await pruneNotesInbox(notesDir);
  return removed;
};

/** Aplica la retencion sin tumbar la sincronizacion si algo falla. */
export const pruneSyncedChatsSafe = async () => {
  try {
    await pruneSyncedChats();
  } catch (error) {
    console.error(`[sync] No se pudo aplicar la retencion de synced_chats: ${error.message}`);
  }
};

/**
 * Se llama tras escribir una nota (routes-notes.mjs): mantiene acotada la
 * bandeja aunque no haya syncs de chats, sin tumbar la escritura ya hecha.
 */
export const capNotesInboxSafe = async () => {
  try {
    await pruneNotesInbox(path.join(config.syncDir, NOTES_DIR_NAME), { quick: true });
  } catch (error) {
    console.error(`[notes] No se pudo acotar ${NOTES_INBOX_FILE}: ${error.message}`);
  }
};
