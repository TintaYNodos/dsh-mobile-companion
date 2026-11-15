/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
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

export const DEVICE_ROLES = Object.freeze(["full", "viewer"]);
export const DEFAULT_DEVICE_ROLE = "full";

const empty = () => ({ devices: [], pending: [], history: [], denied: [] });

/**
 * Normaliza el rol de un dispositivo.
 *
 * Un registro anterior a los perfiles no trae `role`: se lee como `full`, de
 * modo que actualizar el puente nunca degrada por sorpresa a un telefono ya
 * emparejado. Cualquier valor desconocido tambien cae en `full`; `viewer` solo
 * se aplica cuando esta escrito exactamente asi.
 */
export const normalizeDeviceRole = (value) => (value === "viewer" ? "viewer" : DEFAULT_DEVICE_ROLE);

/**
 * Normaliza el puerto destino de un dispositivo.
 *
 * `null` significa "usa el backend por defecto del puente", igual que antes de
 * existir los perfiles. Un valor no numerico o fuera de rango se trata como
 * `null` en vez de romper la lectura del registro.
 */
export const normalizeTargetPort = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
};

/** Aplica los valores por defecto del esquema a un dispositivo en memoria. */
export const withDeviceDefaults = (device) => {
  if (!device || typeof device !== "object") return device;
  device.role = normalizeDeviceRole(device.role);
  device.targetPort = normalizeTargetPort(device.targetPort);
  return device;
};

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
    // Un BOM al inicio (al guardar el archivo con Notepad o PowerShell) hacia
    // fallar JSON.parse: el registro quedaba ilegible, se perdian todos los
    // dispositivos emparejados y no se podia volver a escribir.
    const raw = fs.readFileSync(registryPath, "utf8").replace(/^\uFEFF/, "");
    parsed = JSON.parse(raw);
  } catch (error) {
    try {
      fs.copyFileSync(registryPath, `${registryPath}.corrupt`);
    } catch {}
    warnReadOnly(error.code || "contenido invalido");
    return registry || empty();
  }

  registry = {
    devices: (Array.isArray(parsed.devices) ? parsed.devices : []).map(withDeviceDefaults),
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
