/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Rutas HTTP de las notas del telefono. La validacion, el front matter, la
 * bandeja y el indice id -> archivo viven en notes-store.mjs; aqui solo se
 * autentica, se lee el cuerpo y se responde.
 *
 *   POST /dsh-companion/notes  escribe la nota. Requiere dispositivo emparejado
 *                              con rol `full` o clave de acceso; un `viewer`
 *                              recibe 403 de solo lectura y sin credencial la
 *                              respuesta es 403. Cuerpo maximo 64 KB (413) y
 *                              Content-Type application/json (415). Acepta un
 *                              `id` opcional para idempotencia: reenviar el
 *                              mismo id actualiza el mismo archivo y la
 *                              respuesta trae `updated: true`. Los perfiles son
 *                              los siete del README y `dueDate` es una fecha
 *                              AAAA-MM-DD opcional. Tras guardar se acota la
 *                              bandeja a las ultimas 500 lineas aunque no haya
 *                              syncs de chats.
 *   GET  /dsh-companion/notes  lista las notas recibidas (sin cuerpos), con el
 *                              `id` estable para correlacionar. Los metadatos
 *                              son privados: solo un dispositivo de rol `full`
 *                              o la clave de acceso los lee; un `viewer` recibe
 *                              403 de solo lectura y sin credencial tambien 403.
 */
import { createHash } from "node:crypto";
import { hasValidAccessKey } from "./crypto.mjs";
import { isViewer, logReadOnlyRejection, sendReadOnly, touchDevice } from "./devices.mjs";
import { isJsonRequest, readBody, sendJson } from "./http.mjs";
import { sanitizeLogMessage } from "./log.mjs";
import { NOTES_MAX_BYTES, listInboxNotes, saveNote } from "./notes-store.mjs";
import { validateNotePayload } from "./notes-format.mjs";
import { resolveDevice } from "./routes-pairing.mjs";
import { config } from "./config.mjs";
import { consumeAllowanceDetailed } from "./ratelimit.mjs";

const NOTES_PATH = "/dsh-companion/notes";

/**
 * Clave del cubo de fichas (5.3.4): IP + credencial. Asi una rafaga de un
 * telefono no agota el cupo de otro equipo/token, pero SI se frena el mismo
 * cliente en bucle (antes 40 POST seguidos entraban todos). La credencial se
 * resume con sha256: el material de la clave nunca se guarda en el mapa.
 */
const notesRateKey = (req, remoteAddress, noteDevice, isRead) => {
  const authorization = String(req.headers.authorization || "");
  const token = noteDevice?.id
    ? `device:${noteDevice.id}`
    : authorization
      ? `key:${createHash("sha256").update(authorization).digest("hex").slice(0, 16)}`
      : "anon";
  return `notes:${isRead ? "read" : "write"}:${String(remoteAddress || "desconocida")}:${token}`;
};

/** Consume una ficha; si el cubo esta agotado responde 429 con Retry-After. */
const rejectIfRateLimited = (req, res, { remoteAddress, noteDevice, isRead }) => {
  const { allowed, retryAfterSeconds } = consumeAllowanceDetailed(
    notesRateKey(req, remoteAddress, noteDevice, isRead),
    isRead
      ? { capacity: config.notesRate.readCapacity, refillPerSecond: config.notesRate.readRefillPerSecond }
      : { capacity: config.notesRate.writeCapacity, refillPerSecond: config.notesRate.writeRefillPerSecond }
  );
  if (allowed) return false;
  req.resume();
  sendJson(res, 429, { error: "Demasiadas peticiones de notas" }, { "Retry-After": String(retryAfterSeconds) });
  return true;
};

/** Atiende POST /dsh-companion/notes una vez autenticada la peticion. */
const handleCreateNote = async (req, res) => {
  const declared = Number.parseInt(String(req.headers["content-length"] || "0"), 10);
  if (Number.isFinite(declared) && declared > NOTES_MAX_BYTES) {
    sendJson(res, 413, { error: "El contenido excede el limite de 64 KB" });
    req.resume();
    return;
  }

  req.setTimeout(20_000, () => {
    if (res.headersSent || res.writableEnded || res.destroyed) return;
    sendJson(res, 408, { error: "Tiempo de espera agotado" });
    req.destroy();
  });

  let raw;
  try {
    raw = await readBody(req, NOTES_MAX_BYTES);
  } catch (error) {
    const status = error.statusCode === 413 ? 413 : 400;
    sendJson(res, status, {
      error: status === 413 ? "El contenido excede el limite de 64 KB" : "Conexion interrumpida",
    });
    return;
  }

  if (raw.length === 0) {
    sendJson(res, 400, { error: "Cuerpo vacio" });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "JSON invalido" });
    return;
  }

  try {
    const note = validateNotePayload(parsed);
    // H-20: `saveNote` incluye la poda rapida de la bandeja DENTRO de la cola de
    // escritura (notes-store.mjs). Antes se llamaba aqui, fuera de `serialize`:
    // dos POST concurrentes reescribian inbox.jsonl a la vez (EPERM + .tmp).
    const { file, updated } = await saveNote(note);
    // Solo se responde 200 cuando el archivo ya esta escrito: no hay exito sin efecto.
    sendJson(res, 200, { ok: true, file, updated });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error(sanitizeLogMessage(`[notes] Fallo al guardar la nota: ${error.message}`));
    sendJson(res, status, { error: status >= 500 ? "No se pudo guardar la nota" : error.message });
  }
};

/**
 * Atiende GET /dsh-companion/notes. Ya autenticado: devuelve solo metadatos de
 * la bandeja (nunca los cuerpos), ordenados por `receivedAt` descendente.
 */
const handleListNotes = (res) => {
  try {
    sendJson(res, 200, { notes: listInboxNotes() });
  } catch (error) {
    console.error(sanitizeLogMessage(`[notes] Fallo al listar las notas: ${error.message}`));
    sendJson(res, 500, { error: "No se pudieron listar las notas" });
  }
};

/**
 * Despacho de `/dsh-companion/notes`: metodo, credenciales, Content-Type y
 * lectura/escritura. Devuelve true si atendio la peticion; routes-data.mjs sigue
 * con el resto del despacho cuando devuelve false.
 */
export async function handleNotesRoutes(req, res, { pathname, remoteAddress }) {
  if (pathname !== NOTES_PATH) return false;

  const isRead = req.method === "GET" || req.method === "HEAD";
  if (!isRead && req.method !== "POST") {
    req.resume();
    sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD, POST" });
    return true;
  }

  const noteDevice = resolveDevice(req, res, remoteAddress);

  if (isRead) {
    if (!noteDevice && !hasValidAccessKey(req)) {
      req.resume();
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return true;
    }
    // Privacidad de metadatos: los metadatos de las notas son datos privados
    // (titulo, proyecto, personaje, fechas...). Un `viewer` solo tiene lectura
    // del proxy de DSH, no de la bandeja del telefono: recibe el mismo 403 de
    // solo lectura que en las escrituras. La clave de acceso de la PC y los
    // dispositivos `full` si pueden leerlos (el panel los muestra).
    if (noteDevice && isViewer(noteDevice)) {
      req.resume();
      sendReadOnly(res);
      return true;
    }
    if (rejectIfRateLimited(req, res, { remoteAddress, noteDevice, isRead })) return true;
    if (noteDevice) touchDevice(noteDevice);
    handleListNotes(res);
    return true;
  }

  if (noteDevice && isViewer(noteDevice)) {
    req.resume();
    logReadOnlyRejection(noteDevice, req.method, pathname);
    sendReadOnly(res);
    return true;
  }
  if (!noteDevice && !hasValidAccessKey(req)) {
    req.resume();
    sendJson(res, 403, { error: "Acceso no autorizado" });
    return true;
  }
  if (rejectIfRateLimited(req, res, { remoteAddress, noteDevice, isRead })) return true;
  if (!isJsonRequest(req)) {
    sendJson(res, 415, { error: "Se requiere Content-Type application/json" });
    req.resume();
    return true;
  }

  if (noteDevice) touchDevice(noteDevice);
  await handleCreateNote(req, res);
  return true;
}
