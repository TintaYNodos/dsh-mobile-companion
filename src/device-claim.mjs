/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { loadRegistry, saveRegistry } from "./registry.mjs";

const COOKIE = "dsh-companion-device";
/**
 * P42: cookie de canje. Se entrega a la pestana que pide acceso y es lo que
 * identifica la solicitud aprobada, en lugar de la direccion IP. Es HttpOnly
 * (no la puede leer el JS) y va acotada a /dsh-companion, asi que nunca viaja a
 * la aplicacion proxificada.
 */
const CLAIM_COOKIE = "dsh-companion-claim";
const CLAIM_COOKIE_PATH = "/dsh-companion";
const MAX_PENDING = 16;
export const DENIED_TTL_MS = 30 * 60 * 1000;

export const normalize = (addr) => String(addr || "").replace(/^::ffff:/, "");

export const isLoopback = (addr) => {
  const value = normalize(addr);
  return value.startsWith("127.") || value === "::1";
};

/**
 * H-08: un rechazo es de UNA solicitud, no de la IP entera. Antes se guardaba
 * solo la direccion y `requestAccess` bloqueaba a cualquier equipo detras del
 * mismo NAT: rechazar un telefono dejaba a todos los demas sin poder pedir
 * acceso. El rechazo se guarda por `claimToken` (la cookie de canje de la
 * solicitud concreta); para peticiones sin token (la pagina de rechazo se sirve
 * en "/" y la cookie esta acotada a /dsh-companion) se empareja IP + user-agent,
 * que distingue equipos detras de la misma IP sin bloquear la IP entera.
 * Los registros antiguos sin token/agent ya no bloquean a un telefono con UA.
 */
export const deniedMatchesRequest = (row, { address, claimToken = "", agent = "" } = {}) => {
  if (!row || typeof row !== "object") return false;
  if (claimToken) return row.claimToken === claimToken;
  if (row.claimToken) return false;
  if (normalize(row.address) !== normalize(address)) return false;
  return String(row.agent || "") === String(agent || "");
};

/**
 * Contexto de la peticion HTTP en curso.
 *
 * `bridge.mjs` envuelve `dispatchRequest` con `runWithRequestContext` y este
 * modulo lo usa para leer la cookie de canje y emitir la Set-Cookie
 * correspondiente sin tener que cambiar la firma de las rutas existentes.
 */
const requestContext = new AsyncLocalStorage();

export const runWithRequestContext = (req, res, task) => requestContext.run({ req, res }, task);

export const currentContext = () => requestContext.getStore() || null;

const cookieValue = (req, name) => {
  const header = String(req?.headers?.cookie || "");
  for (const chunk of header.split(";")) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1);
  }
  return null;
};

export const readCookie = (req) => cookieValue(req, COOKIE);

/** Token de canje presentado por la peticion (o null). Lo usan rutas y rechazos. */
export const readClaimToken = (req) => readClaimCookie(req);

const readClaimCookie = (req) => {
  const value = cookieValue(req, CLAIM_COOKIE);
  return value && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
};

const newClaimToken = () => crypto.randomBytes(18).toString("base64url");

const claimCookieHeader = (token) =>
  `${CLAIM_COOKIE}=${token}; Path=${CLAIM_COOKIE_PATH}; Max-Age=${Math.floor(config.pendingTtlMs / 1000)}; HttpOnly; SameSite=Lax`;

/** Agrega una Set-Cookie sin pisar las que la ruta pueda fijar despues. */
const appendSetCookie = (res, value) => {
  if (!res || typeof res.setHeader !== "function" || res.headersSent) return;
  const existing = typeof res.getHeader === "function" ? res.getHeader("Set-Cookie") : undefined;
  if (!existing) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, value] : [existing, value]);
};

/** Codigo de 4 digitos que se muestra en la pantalla de espera y en el panel. */
const pairCodeFromRequest = (req) => {
  if (!req) return "";
  try {
    const url = new URL(String(req.url || ""), "http://companion.invalid");
    const fromQuery = String(url.searchParams.get("code") || "").trim();
    if (/^\d{4}$/.test(fromQuery)) return fromQuery;
  } catch {
    // URL invalida: se prueba con la cabecera.
  }
  const fromHeader = String(req.headers?.["x-dsh-pair-code"] || "").trim();
  return /^\d{4}$/.test(fromHeader) ? fromHeader : "";
};

export const deviceCookieMaxAge = () => config.deviceTtlDays * 24 * 3600;

export const deviceCookieHeader = (id) =>
  `${COOKIE}=${id}; Path=/; Max-Age=${deviceCookieMaxAge()}; HttpOnly; SameSite=Lax`;

export const prune = (current, now) => {
  const beforePending = current.pending.length;
  current.pending = current.pending.filter(
    (entry) => now - Number(new Date(entry.requestedAt)) < config.pendingTtlMs
  );

  const beforeDenied = current.denied.length;
  current.denied = current.denied.filter((row) => now - Number(new Date(row.at)) < DENIED_TTL_MS);

  if (current.pending.length !== beforePending || current.denied.length !== beforeDenied) saveRegistry();
  return current;
};

/**
 * H-08: consulta de rechazo por solicitud concreta. Poda antes de contestar (un
 * rechazo de hace 31 min ya no vale, D4) y compara con deniedMatchesRequest.
 */
export const isDenied = (address, request = {}) => {
  const match = {
    address: normalize(address),
    claimToken: request.claimToken || "",
    agent: request.agent || "",
  };
  return prune(loadRegistry(), Date.now()).denied.some((row) => deniedMatchesRequest(row, match));
};

/** Borra el rechazo de ESTA solicitud (token) o, sin token, IP + user-agent. */
export function clearDenied(address, request = {}) {
  const current = loadRegistry();
  const before = current.denied.length;
  const match = {
    address: normalize(address),
    claimToken: request.claimToken || "",
    agent: request.agent || "",
  };
  current.denied = current.denied.filter((row) => !deniedMatchesRequest(row, match));
  if (current.denied.length !== before) saveRegistry();
}

export function requestAccess(remoteAddress, userAgent) {
  const now = Date.now();
  const current = prune(loadRegistry(), now);
  const address = normalize(remoteAddress || "desconocida");
  const context = currentContext();
  const req = context?.req || null;
  const res = context?.res || null;
  const presented = readClaimCookie(req);

  // H-08: solo se rechaza la solicitud concreta (por token de canje); sin token,
  // el mismo equipo por IP + user-agent. Nunca la IP entera.
  const agent = String(userAgent || "").slice(0, 120);
  if (current.denied.some((row) => deniedMatchesRequest(row, { address, claimToken: presented || "", agent }))) {
    return { entry: null, created: false, denied: true };
  }

  // P42: la solicitud es de la pestana que la pidio, no de la IP. Si el cliente
  // trae su token de canje se reutiliza aunque haya cambiado de direccion
  // (DHCP, pasar de WiFi a VPN, IPv4/IPv6). La busqueda por IP queda solo como
  // compatibilidad: registros de una version anterior (sin token) y la propia
  // computadora. Otra pestana de la red privada con la misma IP (NAT) recibe su
  // propia solicitud: nunca se le entrega el token de otro equipo.
  let existing = presented
    ? current.pending.find((entry) => entry.claimToken === presented)
    : null;
  if (!existing) {
    const sameAddress = current.pending.find((entry) => entry.address === address);
    if (sameAddress && (!sameAddress.claimToken || isLoopback(address))) existing = sameAddress;
  }
  // P57: la pantalla de espera se sirve en "/" y sondea "/dsh-companion/status".
  // La cookie de canje esta acotada a /dsh-companion, asi que las peticiones a
  // "/" llegaban sin token y creaban una solicitud nueva en cada reintento: el
  // panel acababa con decenas de "Telefono Android" imposibles de identificar.
  // Se reutiliza la solicitud del mismo equipo (misma IP y mismo user-agent).
  if (!existing && !presented) {
    const sameAgent = current.pending.find(
      (entry) => entry.address === address && entry.agent === String(userAgent || "").slice(0, 120)
    );
    if (sameAgent) existing = sameAgent;
  }

  if (existing) {
    let changed = false;
    existing.requestedAt = new Date(now).toISOString();
    changed = true;
    if (!existing.claimToken) {
      existing.claimToken = newClaimToken();
      changed = true;
    }
    if (presented && existing.claimToken === presented && existing.address !== address) {
      existing.address = address;
      existing.agent = String(userAgent || existing.agent || "").slice(0, 120);
      changed = true;
      log("pair", `Solicitud de acceso reubicada por canje: ${address}`);
    }
    if (changed) saveRegistry();
    if (existing.claimToken && readClaimCookie(req) !== existing.claimToken) {
      appendSetCookie(res, claimCookieHeader(existing.claimToken));
    }
    return { entry: existing, created: false, denied: false };
  }

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
    // La cookie del cliente es la credencial de la solicitud; el codigo de 4
    // digitos solo se muestra para que el humano lo compare con el panel.
    claimToken: presented || newClaimToken(),
  };

  current.pending.push(entry);
  while (current.pending.length > MAX_PENDING) current.pending.shift();
  saveRegistry();
  appendSetCookie(res, claimCookieHeader(entry.claimToken));

  log("pair", `Solicitud de acceso desde ${address} (codigo ${code})`);
  return { entry, created: true, denied: false };
}

/**
 * Entrega la cookie de dispositivo a un equipo recien aprobado.
 *
 * Se usa UNA sola vez por dispositivo: es el paso en el que el telefono, que
 * acaba de ser aprobado desde el panel, recibe su credencial. A partir de ahi
 * la autorizacion exige esa cookie, no la direccion IP, para que nadie que
 * herede la IP (DHCP, otra maquina de la VPN) entre sin credencial.
 *
 * P42: el canje YA NO se decide por IP. Se resuelve, en este orden, por:
 *  1. la cookie de canje emitida a la pestana que creo la solicitud
 *     (`dsh-companion-claim`), aunque haya cambiado de direccion IP;
 *  2. el codigo de 4 digitos que el usuario ve en pantalla, presentado
 *     explicitamente (`?code=1234` o cabecera `x-dsh-pair-code`), solo desde
 *     loopback (es un codigo corto y el panel vive en esa misma maquina);
 *  3. compatibilidad para la propia computadora sin cookie (pruebas locales y
 *     navegador del propio equipo): coincidencia de direccion, pero solo si es
 *     loopback. Un cliente de la red privada sin cookie no puede canjear nada.
 */
export function claimApprovedDevice(remoteAddress) {
  const current = loadRegistry();
  const address = normalize(remoteAddress);
  if (!address) return null;
  const local = isLoopback(address);
  const context = currentContext();
  const req = context?.req || null;
  const presentedToken = readClaimCookie(req);
  const presentedCode = local ? pairCodeFromRequest(req) : "";

  let device = null;
  let method = "";

  if (presentedToken) {
    // Token aleatorio de 24 bytes: identifica la solicitud aprobada.
    device = current.devices.find((entry) => entry.claimToken === presentedToken && entry.claimed !== true) || null;
    if (device) method = "cookie de canje";
  }

  if (!device && presentedCode) {
    const matches = current.devices.filter((entry) => entry.code === presentedCode && entry.claimed !== true);
    if (matches.length === 1) {
      device = matches[0];
      method = "codigo de la solicitud";
    }
  }

  if (!device && local) {
    // Solo la propia computadora: su IP no es heredable por otro equipo y el
    // panel de aprobacion se ejecuta en ella.
    device = current.devices.find((entry) => entry.claimed !== true && normalize(entry.address) === address) || null;
    if (device) method = "equipo local";
  }

  if (!device) return null;

  device.claimed = true;
  // El token de un solo uso muere al canjearse: aunque quede la cookie en el
  // navegador no sirve para reclamar otro dispositivo.
  device.claimToken = null;
  device.lastRefresh = new Date().toISOString();
  device.lastSeen = device.lastRefresh;
  saveRegistry();

  log("pair", `Dispositivo vinculado por ${method}: ${device.address}`);
  return device;
}
