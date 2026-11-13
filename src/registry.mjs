/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { log } from "./log.mjs";

const MAX_HISTORY = 40;
const registryPath = path.join(config.dshHome, "companion-devices.json");

let registry = null;
let loadedMtime = -1;
let readOnly = false;
let warnedReadOnly = false;

const empty = () => ({ devices: [], pending: [], history: [], denied: [] });

const warnReadOnly = (reason) => {
  readOnly = true;
  if (warnedReadOnly) return;
  warnedReadOnly = true;
  log("pair", `Registro de dispositivos ilegible (${reason}). No se escribira.`);
};

export const registryFile = () => registryPath;

export const loadRegistry = () => {
  let stat;
  try {
    stat = fs.statSync(registryPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      readOnly = false;
      warnedReadOnly = false;
      registry = empty();
      loadedMtime = -1;
      return registry;
    }
    warnReadOnly(error.code || error.message);
    return registry || empty();
  }

  const signal = `${stat.mtimeMs}:${stat.size}`;
  if (registry && signal === loadedMtime) return registry;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (error) {
    try {
      fs.copyFileSync(registryPath, `${registryPath}.corrupt`);
    } catch {}
    warnReadOnly(error.code || "contenido invalido");
    return registry || empty();
  }

  registry = {
    devices: Array.isArray(parsed.devices) ? parsed.devices : [],
    pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
    denied: Array.isArray(parsed.denied) ? parsed.denied : [],
  };
  loadedMtime = signal;
  readOnly = false;
  warnedReadOnly = false;
  return registry;
};

export const saveRegistry = () => {
  const current = registry;
  if (!current) return false;
  if (readOnly) {
    warnReadOnly("escritura bloqueada");
    return false;
  }

  const temporary = `${registryPath}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  let handle = null;
  try {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    handle = fs.openSync(temporary, "w", 0o600);
    fs.writeFileSync(handle, JSON.stringify(current, null, 2), "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    fs.renameSync(temporary, registryPath);

    const stat = fs.statSync(registryPath);
    loadedMtime = `${stat.mtimeMs}:${stat.size}`;
    return true;
  } catch (error) {
    log("pair", `No se pudo guardar el registro: ${error.message}`);
    return false;
  } finally {
    if (handle !== null) {
      try { fs.closeSync(handle); } catch {}
    }
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {}
  }
};

export function recordEvent(type, detail) {
  const current = loadRegistry();
  current.history.unshift({ type, detail: String(detail || ""), at: new Date().toISOString() });
  while (current.history.length > MAX_HISTORY) current.history.pop();
  return saveRegistry();
}
