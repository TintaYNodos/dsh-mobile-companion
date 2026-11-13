/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

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
 * Sin token configurado el control de acceso queda delegado a la red privada.
 */
export function isCompanionRequestTrusted(req) {
  if (!config.companionToken) return true;

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

const BASIC_HEADER = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i;

/**
 * Verifica la clave de acceso compartida enviada por HTTP Basic.
 * El usuario es irrelevante; solo se compara la contraseña en tiempo constante.
 */
export function hasValidAccessKey(req) {
  const key = resolveAccessKey();
  if (!key) return true;

  const match = BASIC_HEADER.exec(String(req.headers.authorization || ""));
  if (!match) return false;

  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  return timingSafeEqual(decoded.slice(separator + 1), key);
}
