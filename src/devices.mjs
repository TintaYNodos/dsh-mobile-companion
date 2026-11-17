/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { log } from "./log.mjs";
import {
  loadRegistry,
  saveRegistry,
  recordEvent,
  normalizeDeviceRole,
  normalizeTargetPort,
} from "./registry.mjs";
import { normalize, prune, readCookie } from "./device-claim.mjs";
import { probeDshPort, resolveTargetPort } from "./network.mjs";
import { sendJson } from "./http.mjs";

// El canje y los rechazos por solicitud viven en device-claim.mjs.
export {
  claimApprovedDevice,
  clearDenied,
  deviceCookieHeader,
  deviceCookieMaxAge,
  isDenied,
  readClaimToken,
  readCookie,
  requestAccess,
  runWithRequestContext,
} from "./device-claim.mjs";

const MAX_DEVICES = 8;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/**
 * Perfiles por dispositivo. `full` es el comportamiento de siempre; `viewer`
 * deja al dispositivo en solo lectura (el APK no cambia, el rol es del
 * servidor): el puente rechaza sus escrituras HTTP, la API de mutacion del
 * puente y las aprobaciones de herramientas.
 */
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

/**
 * Un dispositivo caduca si lleva mas de `deviceTtlDays` sin aparecer. Antes el
 * TTL solo alimentaba el Max-Age de la cookie: el servidor aceptaba para
 * siempre a un dispositivo de hace meses porque solo comparaba el id.
 */
export const isDeviceExpired = (device) => {
  if (!device) return true;
  const stamp = device.lastSeen || device.lastRefresh || device.approvedAt;
  const seen = stamp ? new Date(stamp).getTime() : 0;
  if (!seen) return true;
  const ttlMs = config.deviceTtlDays * 24 * 60 * 60 * 1000;
  return Date.now() - seen > ttlMs;
};

export const findPairedDevice = (req) => {
  // Solo la cookie identifica al dispositivo. Emparejar por direccion IP dejaba
  // la sesion abierta a cualquiera que heredara esa IP (DHCP, otra maquina de
  // la VPN) y anulaba la puerta de la clave de acceso: con una clave
  // incorrecta, una IP ya aprobada seguia entrando.
  const id = readCookie(req);
  if (!id) return null;
  const matched = loadRegistry().devices.find((device) => device.id === id);
  if (!matched) return null;

  if (isDeviceExpired(matched)) {
    // Caducado: se descarta del registro para que no vuelva a autorizar.
    const current = loadRegistry();
    const before = current.devices.length;
    current.devices = current.devices.filter((device) => device.id !== matched.id);
    if (current.devices.length !== before) {
      saveRegistry();
      log("pair", `Dispositivo caducado y eliminado: ${matched.address}`);
    }
    return null;
  }

  return matched;
};

export const recentEvents = () => loadRegistry().history.slice(0, 20);

export function clearHistory() {
  loadRegistry().history = [];
  saveRegistry();
}

export function touchDevice(device) {
  if (!device) return false;
  const now = Date.now();
  const previous = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
  device.lastSeen = new Date(now).toISOString();

  const refreshedAt = device.lastRefresh ? new Date(device.lastRefresh).getTime() : 0;
  const needsRefresh = now - refreshedAt >= config.deviceRefreshMs;

  if (needsRefresh) device.lastRefresh = device.lastSeen;
  if (needsRefresh || now - previous > 60_000) saveRegistry();

  return needsRefresh;
}

// D4: el rechazo y su TTL los poda device-claim.mjs (prune). H-08: la consulta y
// el borrado son por solicitud concreta (claimToken, o IP + user-agent sin
// token), nunca por la IP sola: otros equipos tras el mismo NAT conservan acceso.

export const pendingRequests = () => {
  const current = prune(loadRegistry(), Date.now());
  // P57: una sola tarjeta por equipo. Si quedan solicitudes repetidas de la
  // misma IP y user-agent (versiones anteriores al arreglo), se muestra la mas
  // reciente; las demas siguen en el registro hasta caducar y se pueden aprobar
  // por su id, pero dejan de llenar la pantalla.
  const dedupePending = (list) => {
    const byDevice = new Map();
    for (const entry of list) {
      const key = entry.address + "|" + (entry.agent || "");
      const previous = byDevice.get(key);
      const stamp = Date.parse(entry.requestedAt || 0) || 0;
      const previousStamp = previous ? (Date.parse(previous.requestedAt || 0) || 0) : -1;
      if (!previous || stamp >= previousStamp) byDevice.set(key, entry);
    }
    return [...byDevice.values()];
  };
  return dedupePending(current.pending).map((entry) => ({ ...entry }));
};

const approvalListeners = new Set();

export function onDeviceApproved(listener) {
  approvalListeners.add(listener);
  return () => approvalListeners.delete(listener);
}

export function notifyApprovalListeners() {
  for (const listener of approvalListeners) {
    try {
      listener();
    } catch {}
  }
}

/** H-10: {ok, reason} distingue `missing` (no existe) de `failed` (no se pudo guardar). */
export function approveRequest(id) {
  const current = prune(loadRegistry(), Date.now());
  const index = current.pending.findIndex((entry) => entry.id === id);
  if (index === -1) return { ok: false, reason: "missing", device: null };

  const [entry] = current.pending.splice(index, 1);
  current.denied = current.denied.filter((row) => row.address !== entry.address);

  const device = {
    id: crypto.randomBytes(24).toString("base64url"),
    name: "",
    address: entry.address,
    agent: entry.agent,
    approvedAt: new Date().toISOString(),
    lastSeen: null,
    lastRefresh: null,
    claimed: false,
    // Perfiles: todo dispositivo nuevo arranca con control total y el backend
    // por defecto, que es el comportamiento anterior a los perfiles.
    role: "full",
    targetPort: null,
    // P42: el canje se resuelve con estas credenciales de la solicitud, no con
    // la IP. `claimToken` viaja en la cookie de canje y `code` es el que el
    // usuario ve en la pantalla de espera.
    claimToken: entry.claimToken || null,
    code: entry.code || "",
  };
  // D3: no se borra por IP (varios equipos comparten NAT/proxy); solo se anade.
  current.devices.push(device);
  while (current.devices.length > MAX_DEVICES) current.devices.shift();

  log("pair", `Acceso aprobado para ${entry.address}`);
  const persisted = saveRegistry();
  if (persisted) recordEvent("approve", entry.address);
  notifyApprovalListeners();
  return persisted ? { ok: true, reason: null, device } : { ok: false, reason: "failed", device: null };
}

/** H-10: igual que approveRequest. */
export function rejectRequest(id) {
  const now = Date.now();
  const current = prune(loadRegistry(), now);
  const index = current.pending.findIndex((entry) => entry.id === id);
  if (index === -1) return { ok: false, reason: "missing" };

  const [entry] = current.pending.splice(index, 1);
  // H-08: rechazo por solicitud (token + agente), no por IP entera.
  current.denied.push({ address: entry.address, agent: entry.agent || "", claimToken: entry.claimToken || "", at: new Date(now).toISOString() });
  const persisted = saveRegistry();

  log("pair", `Acceso rechazado para ${entry.address}`);
  if (persisted) recordEvent("reject", entry.address);
  return persisted ? { ok: true, reason: null } : { ok: false, reason: "failed" };
}

export function renameDevice(id, name) {
  const current = loadRegistry();
  const device = current.devices.find((entry) => entry.id === id);
  if (!device) return false;
  device.name = String(name || "").trim().slice(0, 40);
  const persisted = saveRegistry();
  if (persisted) recordEvent("rename", device.name || device.address);
  return persisted;
}

/** Valida un puerto destino fijo: alto y distinto de los puertos del puente. */
export const isValidDeviceTargetPort = (port) =>
  Number.isInteger(port) &&
  port >= 1024 &&
  port <= 65535 &&
  port !== config.listenPort &&
  port !== config.panelPort;

export function setDeviceRole(id, role) {
  const current = loadRegistry();
  const device = current.devices.find((entry) => entry.id === id);
  if (!device) return false;
  device.role = normalizeDeviceRole(role);
  const persisted = saveRegistry();
  if (persisted) {
    recordEvent("role", `${device.name || device.address}: ${device.role}`);
    log("pair", `Rol ${device.role} guardado para ${device.address}`);
  }
  return persisted;
}

/** Fija (o borra con `null`) el backend: `{ ok, reason?, port? }` para el panel. */
export function setDeviceTarget(id, rawPort) {
  const current = loadRegistry();
  const device = current.devices.find((entry) => entry.id === id);
  if (!device) return { ok: false, reason: "missing" };

  if (rawPort === null || rawPort === undefined || String(rawPort).trim() === "") {
    device.targetPort = null;
    const persisted = saveRegistry();
    if (persisted) {
      recordEvent("target", `${device.name || device.address}: por defecto`);
      log("pair", `Puerto destino borrado para ${device.address}: backend por defecto`);
    }
    return { ok: persisted, reason: persisted ? undefined : "failed", port: null };
  }

  const text = String(rawPort).trim();
  if (!/^\d{1,5}$/.test(text)) return { ok: false, reason: "invalid" };
  const port = Number.parseInt(text, 10);
  if (!isValidDeviceTargetPort(port)) return { ok: false, reason: "invalid" };

  device.targetPort = port;
  targetProbes.delete(port);
  const persisted = saveRegistry();
  if (persisted) {
    recordEvent("target", `${device.name || device.address}: ${port}`);
    log("pair", `Puerto destino ${port} guardado para ${device.address}`);
  }
  return { ok: persisted, reason: persisted ? undefined : "failed", port };
}

/**
 * Resolucion POR PETICION: sin `targetPort` => comportamiento de siempre;
 * puerto fijo sondable => ese puerto; puerto fijo muerto => backend por defecto
 * y fallo registrado (limitado en frecuencia). Sonda cacheada 15 s; una caida
 * posterior la detecta el proxy (ECONNREFUSED).
 */
const TARGET_PROBE_TTL_MS = 15_000;
const TARGET_FALLBACK_LOG_MS = 60_000;
const targetProbes = new Map();
const targetFallbackLogAt = new Map();

const noteTargetFallback = (device, port) => {
  const key = `${device?.id || "?"}:${port}`;
  const now = Date.now();
  if (now - (targetFallbackLogAt.get(key) || 0) < TARGET_FALLBACK_LOG_MS) return;
  targetFallbackLogAt.set(key, now);
  log(
    "network",
    `El puerto ${port} de ${deviceLabel(device)} no responde como DeepSeek Harness; ` +
      "se usa el backend por defecto del puente"
  );
};

export async function resolveTargetPortForDevice(device, { force = false } = {}) {
  const fixed = normalizeTargetPort(device?.targetPort);
  if (fixed === null) return resolveTargetPort(force);

  const cached = targetProbes.get(fixed);
  if (!force && cached && Date.now() - cached.at < TARGET_PROBE_TTL_MS) {
    if (cached.ok) return fixed;
    noteTargetFallback(device, fixed);
    return resolveTargetPort(false);
  }

  let alive = false;
  try {
    alive = await probeDshPort(fixed, config.targetHost, 400);
  } catch {
    alive = false;
  }
  targetProbes.set(fixed, { ok: alive, at: Date.now() });
  if (alive) return fixed;

  noteTargetFallback(device, fixed);
  return resolveTargetPort(force);
}

/** Descarta la cache de sondas (pruebas y cambios de perfil). */
export const clearTargetProbeCache = () => targetProbes.clear();

export function removeDevice(id) {
  const current = loadRegistry();
  const index = current.devices.findIndex((device) => device.id === id);
  if (index === -1) return false;
  // D3: se revoca SOLO ese id; otros equipos con la misma IP (NAT/proxy) siguen.
  const [device] = current.devices.splice(index, 1);
  const persisted = saveRegistry();
  log("pair", `Dispositivo revocado: ${device.address}`);
  if (persisted) recordEvent("revoke", device.name || device.address);
  return persisted;
}

export function revokeAll() {
  const current = loadRegistry();
  const removed = current.devices.length;
  current.devices = [];
  current.pending = [];
  const persisted = saveRegistry();
  if (persisted) recordEvent("revoke-all", `${removed} dispositivo${removed === 1 ? "" : "s"}`);
  return persisted ? removed : -1;
}

export const deviceSummary = () =>
  loadRegistry().devices.map((device) => ({
    id: device.id,
    name: device.name || "",
    address: device.address,
    agent: device.agent,
    role: normalizeDeviceRole(device.role),
    targetPort: normalizeTargetPort(device.targetPort),
    approvedAt: device.approvedAt,
    lastSeen: device.lastSeen,
    online: Boolean(device.lastSeen) && Date.now() - new Date(device.lastSeen).getTime() < ONLINE_WINDOW_MS,
  }));
