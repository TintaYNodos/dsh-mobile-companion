/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { loadRegistry, saveRegistry, recordEvent, registryFile } from "./registry.mjs";

const COOKIE = "dsh-companion-device";
const MAX_DEVICES = 8;
const MAX_PENDING = 16;
const DENIED_TTL_MS = 30 * 60 * 1000;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;

const normalize = (addr) => String(addr || "").replace(/^::ffff:/, "");

export const readCookie = (req) => {
  const header = String(req?.headers?.cookie || "");
  for (const chunk of header.split(";")) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith(`${COOKIE}=`)) return trimmed.slice(COOKIE.length + 1);
  }
  return null;
};

export const deviceCookieName = () => COOKIE;
export const deviceCookieMaxAge = () => config.deviceTtlDays * 24 * 3600;
export const devicesFile = registryFile;

export const deviceCookieHeader = (id) =>
  `${COOKIE}=${id}; Path=/; Max-Age=${deviceCookieMaxAge()}; HttpOnly; SameSite=Lax`;

export const findPairedDeviceByAddress = (remoteAddress) => {
  const address = normalize(remoteAddress);
  if (!address || address.startsWith("127.")) return null;
  return loadRegistry().devices.find((device) => device.address === address) || null;
};

export const findPairedDevice = (req) => {
  const id = readCookie(req);
  if (id) {
    const matched = loadRegistry().devices.find((device) => device.id === id);
    if (matched) return matched;
  }
  const remoteAddress = req?.socket?.remoteAddress;
  return findPairedDeviceByAddress(remoteAddress);
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

const prune = (current, now) => {
  const beforePending = current.pending.length;
  current.pending = current.pending.filter(
    (entry) => now - Number(new Date(entry.requestedAt)) < config.pendingTtlMs
  );

  const beforeDenied = current.denied.length;
  current.denied = current.denied.filter((row) => now - Number(new Date(row.at)) < DENIED_TTL_MS);

  if (current.pending.length !== beforePending || current.denied.length !== beforeDenied) saveRegistry();
  return current;
};

export const isDenied = (address) =>
  loadRegistry().denied.some((row) => row.address === normalize(address));

export function clearDenied(address) {
  const current = loadRegistry();
  const before = current.denied.length;
  const target = normalize(address);
  current.denied = current.denied.filter((row) => row.address !== target);
  if (current.denied.length !== before) saveRegistry();
}

export function requestAccess(remoteAddress, userAgent) {
  const now = Date.now();
  const current = prune(loadRegistry(), now);
  const address = normalize(remoteAddress || "desconocida");

  if (current.denied.some((row) => row.address === address)) {
    return { entry: null, created: false, denied: true };
  }

  const alreadyApproved = current.devices.find((d) => d.address === address);
  if (alreadyApproved) {
    return { entry: null, created: false, denied: false, approved: true };
  }

  const existing = current.pending.find((entry) => entry.address === address);
  if (existing) return { entry: existing, created: false, denied: false };

  const taken = new Set(current.pending.map((item) => item.code).filter(Boolean));
  let code = "";
  for (let attempt = 0; attempt < 40 && (!code || taken.has(code)); attempt += 1) {
    code = String(crypto.randomInt(1000, 10000));
  }

  const entry = {
    id: crypto.randomBytes(9).toString("base64url"),
    code,
    address,
    agent: String(userAgent || "").slice(0, 120),
    requestedAt: new Date(now).toISOString(),
  };

  current.pending.push(entry);
  while (current.pending.length > MAX_PENDING) current.pending.shift();
  saveRegistry();

  log("pair", `Solicitud de acceso desde ${address} (codigo ${code})`);
  return { entry, created: true, denied: false };
}

export const pendingRequests = () => {
  prune(loadRegistry(), Date.now());
  return loadRegistry().pending.map((entry) => ({ ...entry }));
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
  const persisted = saveRegistry();
  if (persisted) recordEvent("revoke-all", `${removed} dispositivo${removed === 1 ? "" : "s"}`);
  return persisted ? removed : -1;
}

export function claimApprovedDevice(remoteAddress) {
  const current = loadRegistry();
  const address = normalize(remoteAddress);
  const device = current.devices.find((entry) => entry.address === address);
  if (!device) return null;

  device.claimed = true;
  device.lastRefresh = new Date().toISOString();
  device.lastSeen = device.lastRefresh;
  saveRegistry();

  log("pair", `Dispositivo vinculado: ${address}`);
  return device;
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
