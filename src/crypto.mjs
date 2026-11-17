/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { findVpnAddress } from "./network.mjs";
import { log } from "./log.mjs";

const cookies = new Map();
let secretCache = null;
let accessKeyCache = null;

export const timingSafeEqual = (left, right) => {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

/**
 * Extrae el secreto de sesion del bloque `client-connection/browser-session`
 * sin depender de un regex codicioso sobre todo el documento.
 */
const readSecretFromYaml = (content) => {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes("client-connection/browser-session:"));
  if (start === -1) return null;

  const baseIndent = lines[start].search(/\S/);

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const indent = line.search(/\S/);
    if (indent <= baseIndent && !line.trim().startsWith("-")) break;

    const match = line.match(/^\s*secret:\s*([A-Za-z0-9_-]{16,})\s*$/);
    if (match) return match[1];
  }

  return null;
};

export function loadSecret() {
  if (secretCache) return secretCache;

  const override = String(process.env.DSH_BROWSER_SECRET || "").trim();
  if (override) {
    if (override.length < 16) throw new Error("DSH_BROWSER_SECRET es demasiado corto");
    secretCache = Buffer.from(override, "base64url");
    return secretCache;
  }

  const credentialsPath = path.join(config.dshHome, ".credentials.yaml");
  let content;
  try {
    content = fs.readFileSync(credentialsPath, "utf8");
  } catch {
    throw new Error(`No se pudo leer ${credentialsPath}. Defina DSH_HOME o DSH_BROWSER_SECRET.`);
  }

  const raw = readSecretFromYaml(content);
  if (!raw) {
    throw new Error("No se encontro el secreto client-connection/browser-session en .credentials.yaml");
  }

  secretCache = Buffer.from(raw, "base64url");
  return secretCache;
}

export const getAuthority = (host, port) => `${host}:${port}`;

/**
 * Descarta el secreto y las cookies memorizadas. Se invoca cuando el backend
 * responde 401: indica que `.credentials.yaml` cambio o que la sesion expiro.
 */
export function invalidateSession() {
  secretCache = null;
  cookies.clear();
}

const cookieNameFor = (authority) =>
  `dsh-auth-${crypto.createHash("sha256").update(authority).digest("base64url")}`;

/**
 * Genera la cookie de sesion HMAC-SHA256 version 1 compatible con DeepSeek Harness.
 * Se cachea por autoridad y se renueva con margen previo al vencimiento.
 */
export function createSessionCookie(authority) {
  const cached = cookies.get(authority);
  const now = Date.now();

  if (cached && now < cached.expiresAt - config.cookieRefreshWindowMs) {
    return cached.value;
  }

  const issuedAt = now;
  const expiresAt = issuedAt + config.sessionTtlMs;
  const payload = JSON.stringify({ version: 1, authority, issuedAt, expiresAt });
  const body = Buffer.from(payload, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", loadSecret()).update(body).digest("base64url");
  const value = `${cookieNameFor(authority)}=v1.${body}.${signature}`;

  cookies.set(authority, { value, expiresAt });
  return value;
}

export function injectSessionHeaders(headers, authority) {
  const outgoing = { ...headers };
  outgoing.host = authority;

  if (outgoing.origin) outgoing.origin = `http://${authority}`;
  if (outgoing.referer) outgoing.referer = `http://${authority}/`;

  const name = cookieNameFor(authority);
  const sessionCookie = createSessionCookie(authority);

  const existing = String(outgoing.cookie || "")
    .split(";")
    .map((entry) => entry.trim())
    // Se descarta la cookie propia del puente y cualquier sesion previa homonima:
    // el backend solo debe recibir la cookie que firmamos aqui.
    .filter((entry) => entry && !entry.startsWith(`${name}=`) && !entry.startsWith("dsh-companion-device="));

  existing.push(sessionCookie);
  outgoing.cookie = existing.join("; ");
  return outgoing;
}

/**
 * Comparacion en tiempo constante contra el token compartido opcional.
 *
 * Fail-closed: sin `DSH_COMPANION_TOKEN` configurado NINGUNA peticion es "de
 * confianza" por el solo hecho de venir de la red privada. Las rutas que usan
 * esta funcion aceptan tambien la clave de acceso o la cookie de dispositivo,
 * que son credenciales verificables; la pertenencia a la VPN no lo es.
 */
export function isCompanionRequestTrusted(req) {
  if (!config.companionToken) return false;

  const header = String(req.headers.authorization || "");
  const provided = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : String(req.headers["x-dsh-companion-token"] || "").trim();

  return provided.length > 0 && timingSafeEqual(provided, config.companionToken);
}

/**
 * Clave de acceso efectiva.
 *
 * Orden: variable de entorno, archivo persistido, generación automática.
 * Una red privada solo controla la pertenencia, no la identidad: sin clave,
 * cualquier miembro de la VPN hereda esta sesión. Por eso la clave se genera
 * sola la primera vez y se guarda con permisos de propietario.
 *
 * `DSH_ACCESS_DISABLE=1` la desactiva de forma explícita y consciente.
 */
export function resolveAccessKey() {
  if (accessKeyCache !== null) return accessKeyCache;

  if (config.accessKey) {
    accessKeyCache = config.accessKey;
    return accessKeyCache;
  }

  if (config.accessKeyDisabled) {
    // El README promete que desactivar la clave solo vale junto al equipo
    // (loopback). Antes se apagaba la credencial en cualquier interfaz y la
    // LAN/VPN quedaba sin ninguna puerta. Se exige enlace local.
    const binding = findVpnAddress();
    const local = String(binding?.address || "").startsWith("127.");
    if (!local) {
      throw new Error(
        "DSH_ACCESS_DISABLE=1 solo se permite con el puente enlazado a 127.0.0.1"
      );
    }
    accessKeyCache = "";
    return accessKeyCache;
  }

  const keyFile = path.join(config.dshHome, "companion-access-key");
  try {
    const stored = fs.readFileSync(keyFile, "utf8").trim();
    if (stored.length >= 16) {
      accessKeyCache = stored;
      return accessKeyCache;
    }
  } catch {
    // Archivo ausente: se genera a continuación.
  }

  const generated = crypto.randomBytes(18).toString("base64url");
  try {
    fs.mkdirSync(config.dshHome, { recursive: true });
    fs.writeFileSync(keyFile, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Si no se puede persistir, se usa igual para esta ejecución.
  }

  accessKeyCache = generated;
  return accessKeyCache;
}

export const accessKeyEnabled = () => resolveAccessKey().length > 0;

/**
 * Rota la clave de acceso persistida en disco: borra la clave y genera otra.
 *
 * H-01: antes SIEMPRE se borraba el archivo y se volvia a `resolveAccessKey()`,
 * pero si la clave viene de `DSH_ACCESS_KEY` (entorno) esa funcion devuelve el
 * mismo valor: fingia rotar y el kill switch seguia dejando viva la credencial
 * maestra. Ahora el resultado es explicito:
 *
 *   { rotated: true,  reason: null }       la clave de archivo se roto de verdad
 *   { rotated: false, reason: "env" }      DSH_ACCESS_KEY manda; no se puede rotar
 *   { rotated: false, reason: "disabled" } DSH_ACCESS_DISABLE=1: no hay clave
 *
 * El kill switch refleja ese resultado en su respuesta y en el log. Los
 * dispositivos emparejados se identifican por cookie y el kill switch los
 * revoca aparte: quien quiera volver a entrar debe emparejarse.
 */
export function rotateAccessKey() {
  if (config.accessKey) {
    log("bridge", "Clave de acceso no rotada: la fija DSH_ACCESS_KEY (entorno)");
    return { rotated: false, reason: "env" };
  }
  if (config.accessKeyDisabled) {
    log("bridge", "Clave de acceso no rotada: desactivada por DSH_ACCESS_DISABLE=1");
    return { rotated: false, reason: "disabled" };
  }

  const keyFile = path.join(config.dshHome, "companion-access-key");
  try {
    if (fs.existsSync(keyFile)) fs.unlinkSync(keyFile);
  } catch {
    // Si no se puede borrar, igual se invalida la copia en memoria.
  }
  accessKeyCache = null;
  const fresh = resolveAccessKey();
  invalidateSession();
  log("bridge", `Clave de acceso rotada (****${fresh.slice(-4)})`);
  return { rotated: true, reason: null };
}

const BASIC_HEADER = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i;

/**
 * Verifica la clave de acceso compartida enviada por HTTP Basic.
 * El usuario es irrelevante; solo se compara la contraseña en tiempo constante.
 */
// Limite de intentos fallidos por IP: la clave es larga y aleatoria, pero sin
// freno cualquiera en la red privada podia lanzar miles de Basic auth por
// segundo y hacer trabajar al HMAC. Al superar el umbral se responde 401 sin
// comparar la clave durante el resto de la ventana.
const authFailures = new Map();
const AUTH_WINDOW_MS = 5 * 60 * 1000;
const AUTH_MAX_FAILURES = 30;

const clientIp = (req) => String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "desconocida").replace(/^::ffff:/, "");
const isLoopbackIp = (ip) => ip.startsWith("127.") || ip === "::1";

export function authThrottled(req) {
  const ip = clientIp(req);
  if (isLoopbackIp(ip)) return false;
  const entry = authFailures.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.until) {
    authFailures.delete(ip);
    return false;
  }
  return entry.count >= AUTH_MAX_FAILURES;
}

const noteAuthFailure = (req) => {
  const ip = clientIp(req);
  if (isLoopbackIp(ip)) return;
  const now = Date.now();
  for (const [key, value] of authFailures) if (now > value.until) authFailures.delete(key);
  const entry = authFailures.get(ip);
  if (!entry) authFailures.set(ip, { count: 1, until: now + AUTH_WINDOW_MS });
  else entry.count += 1;
};

export function hasValidAccessKey(req) {
  // Sin cabecera Authorization no hay intento de clave: el telefono usa la cookie
  // de dispositivo y el panel su propia sesion. Contarlos como fallo bloqueaba a
  // los clientes legitimos.
  if (!String(req?.headers?.authorization || "").trim()) return false;
  if (authThrottled(req)) return false;
  const key = resolveAccessKey();
  // H-09: con la clave vacia (DSH_ACCESS_DISABLE=1) esta funcion devolvia true
  // con CUALQUIER Authorization: marcaba como "autenticado por clave" a un
  // cliente que no presento ninguna. La puerta abierta del modo desactivado la
  // mantiene el gate explicitamente (accessKeyEnabled() === false), no esta
  // comprobacion. Sin clave que comparar, no hay autenticacion por clave.
  if (!key) return false;

  const match = BASIC_HEADER.exec(String(req.headers.authorization || ""));
  if (!match) { noteAuthFailure(req); return false; }

  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) { noteAuthFailure(req); return false; }

  const valid = timingSafeEqual(decoded.slice(separator + 1), key);
  if (!valid) noteAuthFailure(req);
  return valid;
}
