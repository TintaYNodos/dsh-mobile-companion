/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { loadRegistry, saveRegistry, recordEvent } from "./registry.mjs";
import { normalize, prune, readCookie } from "./device-claim.mjs";

// El canje por token/cookie vive en device-claim.mjs; se reexporta aqui para
// conservar la API publica que usan routes-pairing.mjs y bridge.mjs.
export {
  claimApprovedDevice,
  deviceCookieHeader,
  deviceCookieMaxAge,
  readCookie,
  requestAccess,
  runWithRequestContext,
} from "./device-claim.mjs";

const MAX_DEVICES = 8;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

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

export const isDenied = (address) =>
  loadRegistry().denied.some((row) => row.address === normalize(address));

export function clearDenied(address) {
  const current = loadRegistry();
  const before = current.denied.length;
  const target = normalize(address);
  current.denied = current.denied.filter((row) => row.address !== target);
  if (current.denied.length !== before) saveRegistry();
}

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

export function approveRequest(id) {
  const current = prune(loadRegistry(), Date.now());
  const index = current.pending.findIndex((entry) => entry.id === id);
  if (index === -1) return null;

  const [entry] = current.pending.splice(index, 1);
  current.denied = current.denied.filter((row) => row.address !== entry.address);
  current.devices = current.devices.filter((device) => device.address !== entry.address);

  const device = {
    id: crypto.randomBytes(24).toString("base64url"),
    name: "",
    address: entry.address,
    agent: entry.agent,
    approvedAt: new Date().toISOString(),
    lastSeen: null,
    lastRefresh: null,
    claimed: false,
    // P42: el canje se resuelve con estas credenciales de la solicitud, no con
    // la IP. `claimToken` viaja en la cookie de canje y `code` es el que el
    // usuario ve en la pantalla de espera.
    claimToken: entry.claimToken || null,
    code: entry.code || "",
  };
  current.devices.push(device);
  while (current.devices.length > MAX_DEVICES) current.devices.shift();

  log("pair", `Acceso aprobado para ${entry.address}`);
  const persisted = saveRegistry();
  recordEvent("approve", entry.address);
  notifyApprovalListeners();
  return persisted ? device : null;
}

export function rejectRequest(id) {
  const now = Date.now();
  const current = prune(loadRegistry(), now);
  const index = current.pending.findIndex((entry) => entry.id === id);
  if (index === -1) return false;

  const [entry] = current.pending.splice(index, 1);
  current.denied.push({ address: entry.address, at: new Date(now).toISOString() });
  const persisted = saveRegistry();

  log("pair", `Acceso rechazado para ${entry.address}`);
  if (persisted) recordEvent("reject", entry.address);
  return persisted;
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

export function removeDevice(id) {
  const current = loadRegistry();
  const index = current.devices.findIndex((device) => device.id === id);
  if (index === -1) return false;
  const [device] = current.devices.splice(index, 1);
  current.devices = current.devices.filter((entry) => entry.address !== device.address);
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
    approvedAt: device.approvedAt,
    lastSeen: device.lastSeen,
    online: Boolean(device.lastSeen) && Date.now() - new Date(device.lastSeen).getTime() < ONLINE_WINDOW_MS,
  }));
