/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Perfiles por dispositivo: `full` es el comportamiento de siempre; `viewer`
 * deja al dispositivo en solo lectura (el APK no cambia, el rol es del
 * servidor): el puente rechaza sus escrituras HTTP, la API de mutacion del
 * puente y las aprobaciones de herramientas.
 *
 * Vive aparte de devices.mjs para que ese modulo (registro y emparejamiento)
 * quede por debajo del limite de 400 lineas del proyecto.
 */
import { normalizeDeviceRole } from "./registry.mjs";
import { log } from "./log.mjs";
import { sendJson } from "./http.mjs";

export const READ_ONLY_ERROR = "dispositivo en solo lectura";

export const isViewer = (device) => normalizeDeviceRole(device?.role) === "viewer";

export const deviceLabel = (device) => String(device?.name || device?.address || "dispositivo");

export const sendReadOnly = (res) => sendJson(res, 403, { error: READ_ONLY_ERROR });

/**
 * POST que un `viewer` puede seguir haciendo: lecturas que DSH transporta como
 * `POST /api/<namespace>/<metodo>` (toda llamada Remote unaria). Es el
 * subconjunto de solo lectura que el propio DSH clasifica como
 * `reader-global-read` / `reader-session-read` en su politica de LiveShare
 * (dsh-experimental-liveshare, endpoint-classification.ts). Se excluye
 * `fileUploads/upload` (escribe adjuntos) y todo lo `owner-only`; cualquier otro
 * mutante se rechaza, incluido `POST /api/$events/result`, por donde el
 * navegador responde aprobaciones de herramientas y preguntas del agente.
 */
export const VIEWER_POST_ALLOWLIST = Object.freeze([
  "/api/commands/list",
  "/api/goals/get",
  "/api/llm/listConfigurableProviders",
  "/api/llm/listProviders",
  "/api/session/attachment",
  "/api/session/canOpenWorkspacePath",
  "/api/session/list",
  "/api/session/modelCatalog",
  "/api/session/page",
  "/api/session/projections",
  "/api/session/state",
  "/api/session/wait",
  "/api/skills/list",
]);

const READ_ONLY_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Metodo mutante que un `viewer` tiene prohibido (allowlist aparte). */
export const isReadOnlyWriteBlocked = (device, method, pathname) => {
  if (!isViewer(device)) return false;
  if (!READ_ONLY_WRITE_METHODS.has(String(method || "").toUpperCase())) return false;
  return !VIEWER_POST_ALLOWLIST.includes(String(pathname || ""));
};

/** Registra el rechazo (sin secretos) sin inundar el log por cada asset. */
const readOnlyLogAt = new Map();
export const logReadOnlyRejection = (device, method, pathname) => {
  const key = `${device?.id || "?"}|${method}|${pathname}`;
  const now = Date.now();
  if (now - (readOnlyLogAt.get(key) || 0) < 10_000) return;
  readOnlyLogAt.set(key, now);
  log("proxy", `Escritura rechazada para ${deviceLabel(device)} (solo lectura): ${method} ${pathname}`);
};
