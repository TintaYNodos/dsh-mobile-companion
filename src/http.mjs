/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const FORWARDED = new Set(["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip"]);

/**
 * Cabeceras que autentican al cliente ante el puente y que NUNCA deben llegar
 * al backend: la clave de acceso viaja en `Authorization` y el token en
 * `X-DSH-Companion-Token`. El backend recibe su propia cookie de sesión.
 */
const CLIENT_AUTH = new Set(["authorization", "proxy-authorization", "x-dsh-companion-token"]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export const stripControlChars = (value) => String(value ?? "").replace(CONTROL_CHARS, "");

/**
 * Normaliza cabeceras para el salto al backend: elimina salto de linea,
 * descarta cabeceras hop-by-hop y cualquier rastro de proxy previo.
 */
export function scrubHeaders(headers) {
  const outgoing = {};

  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = stripControlChars(rawKey).trim().toLowerCase();
    if (!key || HOP_BY_HOP.has(key) || FORWARDED.has(key) || CLIENT_AUTH.has(key)) continue;

    if (Array.isArray(rawValue)) {
      outgoing[key] = rawValue.map((entry) => stripControlChars(entry));
    } else if (rawValue !== undefined) {
      outgoing[key] = stripControlChars(rawValue);
    }
  }

  return outgoing;
}

export function hasAmbiguousFraming(headers) {
  const hasLength = headers["content-length"] !== undefined;
  const hasEncoding = headers["transfer-encoding"] !== undefined;
  return hasLength && hasEncoding;
}

export function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(body);
}

export function sendText(res, statusCode, message, extraHeaders = {}) {
  const body = Buffer.from(message, "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(body);
}

export const originOf = (value) => {
  try {
    const parsed = new URL(String(value));
    return parsed.origin;
  } catch {
    return null;
  }
};

/**
 * Frontera de origen con criterio cerrado.
 *
 * Reglas, en orden:
 *  1. El Host debe ser uno de los esperados. Esto corta el DNS rebinding: un
 *     dominio del atacante resuelto a la IP privada llega con su propio Host.
 *  2. `Sec-Fetch-Site` debe ser del propio sitio, navegación directa o ausente
 *     (los clientes que no son navegadores no lo envían).
 *  3. Si hay Origin, debe ser exactamente uno de los permitidos. `null` y la
 *     cadena vacía se rechazan: es la firma de un iframe en sandbox.
 *  4. Si no hay Origin pero sí Referer, se valida el origen del Referer.
 */
export function isSameOriginRequest(req, allowedOrigins, allowedHosts) {
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!host || !allowedHosts.has(host)) return false;

  const site = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();
  if (site && site !== "same-origin" && site !== "none") return false;

  const origin = req.headers.origin;
  if (origin !== undefined) {
    const value = String(origin).trim().toLowerCase();
    if (!value || value === "null") return false;
    return allowedOrigins.has(value);
  }

  const referer = req.headers.referer;
  if (referer) {
    const parsed = originOf(referer);
    return parsed ? allowedOrigins.has(parsed.toLowerCase()) : false;
  }

  // Sin Origin ni Referer: navegación directa o cliente sin navegador.
  return true;
}

export const isJsonRequest = (req) => {
  const type = String(req.headers["content-type"] || "").toLowerCase();
  return type.startsWith("application/json");
};

/**
 * Lee el cuerpo con tope. Al pasarse NO destruye la peticion: deja de acumular,
 * drena el resto y devuelve 413, para que el cliente reciba la respuesta en vez
 * de un ECONNRESET.
 */
export function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("aborted", onAborted);
      req.removeListener("error", onError);
    };

    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        req.resume();
        reject(error);
        return;
      }
      resolve(value);
    };

    const onData = (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limitBytes) {
        settle(Object.assign(new Error("Cuerpo de peticion demasiado grande"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => settle(null, Buffer.concat(chunks));
    const onAborted = () => settle(Object.assign(new Error("Conexion interrumpida"), { statusCode: 400 }));
    const onError = (error) => settle(error);

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("aborted", onAborted);
    req.on("error", onError);
  });
}

/** Comparacion de cadenas sin filtrar longitud ni prefijo. */
export function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const isDocumentRequest = (req) => {
  const destination = String(req.headers["sec-fetch-dest"] || "");
  if (destination === "document" || destination === "iframe") return true;
  return String(req.headers.accept || "").includes("text/html");
};

export const isMobileClient = (req) => {
  if (String(req.headers["sec-ch-ua-mobile"] || "") === "?1") return true;
  return /android|iphone|ipad|ipod|mobile|harmonyos/i.test(String(req.headers["user-agent"] || ""));
};
