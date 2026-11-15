/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1) / PolyForm Noncommercial 1.0.0.
 * See companion/LICENSE or LICENSE for license terms.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { assertInside, readDirSafe, rebuildIndex } from "./sync-index.mjs";

/* ------------------------------------------------------------------------- *
 * P9: retencion de synced_chats/.
 *
 * Los chats sincronizados y las notas satelite crecian sin limite. Ahora se
 * podan los mas antiguos (por fecha de modificacion del par .json/.md) cuando
 * se supera cualquiera de los topes configurables, y se reconstruye
 * index.jsonl si falta. Topes: DSH_SYNC_MAX_FILES (200) y
 * DSH_SYNC_MAX_TOTAL_MB (200).
 * ------------------------------------------------------------------------- */

const DEFAULT_SYNC_MAX_FILES = 200;
const DEFAULT_SYNC_MAX_TOTAL_MB = 200;

/** Lee un tope entero positivo de una variable de entorno, con valor por defecto. */
const envPositiveInt = (name, fallback) => {
  const parsed = Number.parseInt(String(process.env[name] ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Agrupa `<id>.json` + `<id>.md` de una carpeta en unidades podables, para no
 * dejar un .json sin su .md al aplicar la retencion.
 */
const collectChatUnits = async (directory) => {
  const units = new Map();
  for (const entry of await readDirSafe(directory)) {
    if (!entry.isFile()) continue;
    if (entry.name === "index.jsonl" || entry.name.includes(".tmp")) continue;
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
 * P9: poda los chats y notas mas antiguos si se superan los topes. Devuelve
 * cuantas unidades elimino. Incluye satellite_notes/ para que el tope de MB
 * cubra toda la carpeta, no solo la conversacion.
 */
export const pruneSyncedChats = async () => {
  const maxFiles = envPositiveInt("DSH_SYNC_MAX_FILES", DEFAULT_SYNC_MAX_FILES);
  const maxTotalBytes = envPositiveInt("DSH_SYNC_MAX_TOTAL_MB", DEFAULT_SYNC_MAX_TOTAL_MB) * 1024 * 1024;

  const units = [
    ...(await collectChatUnits(config.syncDir)),
    ...(await collectChatUnits(path.join(config.syncDir, "satellite_notes"))),
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
