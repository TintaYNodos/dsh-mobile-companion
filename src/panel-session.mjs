/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

/**
 * Credenciales del panel local: boleto de un solo uso, cookie de sesion en
 * memoria y archivo de arranque. Separado de panel.mjs, que solo atiende HTTP.
 */
const tokenPath = path.join(config.dshHome, "companion-panel-token");
const urlFile = path.join(config.dshHome, "companion-panel-url.txt");
export const PANEL_COOKIE = "dsh-panel";

/**
 * Credencial propia del panel.
 *
 * Ya no hay un token maestro que viaje en la URL: la entrada al panel es un
 * boleto de un solo uso que caduca y muere al canjearse, y se entrega una
 * cookie de sesion HttpOnly con un identificador aleatorio que solo existe en
 * memoria. El archivo `companion-panel-token` (permisos de propietario) guarda
 * el boleto de arranque para que panel.bat pueda abrir el panel; tambien es de
 * un solo uso: al canjearse se reescribe con uno nuevo.
 */
export const TICKET_TTL_MS = 2 * 60 * 1000;
const BOOTSTRAP_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const tickets = new Map();
const sessions = new Map();
let bootstrapToken = "";
let bootstrapExpiresAt = 0;

const pruneExpired = (map, now) => {
  for (const [key, expiresAt] of map) {
    if (expiresAt <= now) map.delete(key);
  }
};

const randomToken = () => crypto.randomBytes(24).toString("base64url");

export const issueTicket = (ttlMs) => {
  const now = Date.now();
  pruneExpired(tickets, now);
  const ticket = randomToken();
  tickets.set(ticket, now + ttlMs);
  return ticket;
};

const writeBootstrapFile = () => {
  try {
    fs.mkdirSync(config.dshHome, { recursive: true });
    fs.writeFileSync(tokenPath, `${bootstrapToken}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Sin persistencia, el panel se abre desde el puente (openPanelWindow).
  }
};

const rotateBootstrapToken = () => {
  bootstrapToken = issueTicket(BOOTSTRAP_TTL_MS);
  bootstrapExpiresAt = tickets.get(bootstrapToken) || Date.now() + BOOTSTRAP_TTL_MS;
  writeBootstrapFile();
};

/**
 * Canjea un boleto: si es valido se destruye y devuelve "ok". El boleto de
 * arranque se regenera siempre (haya caducado o no) para que el archivo quede
 * con una credencial viva de un solo uso.
 */
export const redeemTicket = (value) => {
  if (typeof value !== "string" || value.length < 16) return "invalid";
  const now = Date.now();

  if (value === bootstrapToken) {
    const expired = now > bootstrapExpiresAt;
    tickets.delete(value);
    rotateBootstrapToken();
    return expired ? "expired" : "ok";
  }

  const expiresAt = tickets.get(value);
  if (expiresAt === undefined) return "invalid";
  tickets.delete(value);
  return expiresAt > now ? "ok" : "expired";
};

export const createSession = () => {
  const now = Date.now();
  pruneExpired(sessions, now);
  const id = randomToken();
  sessions.set(id, now + SESSION_TTL_MS);
  return id;
};

export const sessionValid = (id) => {
  if (!id) return false;
  const expiresAt = sessions.get(id);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(id);
    return false;
  }
  return true;
};

// Boleto de arranque: DSH_PANEL_TOKEN (si existe) se adopta como boleto
// inicial de un solo uso; en cualquier caso se escribe en el archivo 0600.
export const armBootstrapToken = () => {
  const fromEnv = String(process.env.DSH_PANEL_TOKEN || "").trim();
  if (fromEnv.length >= 16) {
    bootstrapToken = fromEnv;
    bootstrapExpiresAt = Date.now() + BOOTSTRAP_TTL_MS;
    tickets.set(bootstrapToken, bootstrapExpiresAt);
  } else {
    rotateBootstrapToken();
    return;
  }
  writeBootstrapFile();
};

armBootstrapToken();

export const discardPublishedUrl = () => {
  try {
    if (fs.existsSync(urlFile)) fs.unlinkSync(urlFile);
  } catch {
    // Si no se puede borrar, el token ya no es valido de todas formas.
  }
};
