/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (Business Source License 1.1) / Business Source License 1.1.
 * See companion/LICENSE or LICENSE for license terms.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { readBody, sendJson } from "./http.mjs";
import { sanitizeLogMessage } from "./log.mjs";
import { consumeAllowance } from "./ratelimit.mjs";
import { neutralizeMarkdown, renderMarkdown, slugify, uniqueBase } from "./sync-format.mjs";
import { SAFE_ID_RE, assertInside, ensureIndex, getSyncedChat, listSyncedChats, writeAtomic } from "./sync-index.mjs";
import { pruneSyncedChatsSafe } from "./sync-retention.mjs";

// La API de lectura sigue viviendo en sync.mjs para no romper a sus consumidores.
export { getSyncedChat, listSyncedChats } from "./sync-index.mjs";

const validatePayload = (payload) => {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("Se esperaba un objeto JSON"), { statusCode: 400 });
  }
  const { sessionTitle, messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw Object.assign(new Error("Se requiere un arreglo de mensajes no vacio"), { statusCode: 400 });
  }
  if (messages.length > config.maxSyncMessages) {
    throw Object.assign(new Error(`Maximo ${config.maxSyncMessages} mensajes por sincronizacion`), { statusCode: 413 });
  }

  const now = Date.now();
  const normalized = messages.map((entry) => ({
    role: entry?.role === "assistant" ? "assistant" : "user",
    content: String(entry?.content ?? "").slice(0, config.maxMessageChars),
    timestamp: Number.isFinite(Number(entry?.timestamp)) && Number(entry?.timestamp) > 0 ? Number(entry?.timestamp) : now,
  }));

  return { title: String(sessionTitle ?? "chat-movil").slice(0, 120), messages: normalized, now };
};

async function persistConversation(payload) {
  const { title, messages, now } = validatePayload(payload);
  await fs.promises.mkdir(config.syncDir, { recursive: true });
  // P9: si index.jsonl desaparecio, se reconstruye antes de anadir la entrada
  // nueva para no dejarlo incompleto.
  await ensureIndex();

  const base = `${uniqueBase()}_${slugify(title)}`;
  const jsonPath = assertInside(config.syncDir, `${base}.json`);
  const markdownPath = assertInside(config.syncDir, `${base}.md`);
  const indexPath = assertInside(config.syncDir, "index.jsonl");

  const isoDate = new Date(now).toISOString();
  const document = {
    id: base,
    sessionTitle: neutralizeMarkdown(title),
    syncedAt: isoDate,
    syncedTimestamp: now,
    messageCount: messages.length,
    messages: messages.map((message) => ({
      role: message.role,
      content: neutralizeMarkdown(message.content),
      timestamp: message.timestamp,
    })),
  };

  await Promise.all([
    writeAtomic(jsonPath, JSON.stringify(document, null, 2)),
    writeAtomic(markdownPath, renderMarkdown(title, isoDate, messages)),
  ]);

  const indexEntry = JSON.stringify({
    id: base,
    savedAt: now,
    title: neutralizeMarkdown(title),
    messageCount: messages.length,
    json: `${base}.json`,
    markdown: `${base}.md`,
  });
  await fs.promises.appendFile(indexPath, `${indexEntry}\n`, "utf8");

  // P9: aplica la retencion despues de guardar, nunca antes (si no, el chat
  // recien sincronizado podria ser el primero en caer con topes pequenos).
  await pruneSyncedChatsSafe();

  return { ok: true, syncedCount: messages.length, id: base };
}

const sendOnce = (res, statusCode, payload) => {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  sendJson(res, statusCode, payload);
};

const sendError = (res, error, id = "") => {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) {
    // H5: el mensaje de un error puede reflejar el JSON crudo del cliente
    // (JSON.parse lo incluye). Se sanea antes de loguear: sin CR/LF, sin
    // caracteres de control y recortado a 200.
    console.error(sanitizeLogMessage(`[sync] Fallo${id ? ` en ${id}` : ""}: ${error.message}`));
    sendOnce(res, status, { error: "No se pudo procesar la conversacion" });
    return;
  }
  sendOnce(res, status, { error: error.message });
};

export async function handleSync(req, res, remoteAddress) {
  if (!consumeAllowance(`sync:${remoteAddress}`, { capacity: 12, refillPerSecond: 0.25 })) {
    sendOnce(res, 429, { error: "Demasiadas sincronizaciones. Reintente en unos segundos." });
    req.resume();
    return;
  }

  const declared = Number.parseInt(String(req.headers["content-length"] || "0"), 10);
  if (Number.isFinite(declared) && declared > config.maxSyncBytes) {
    sendOnce(res, 413, { error: "El contenido excede el limite permitido" });
    req.resume();
    return;
  }

  req.setTimeout(20_000, () => {
    sendOnce(res, 408, { error: "Tiempo de espera agotado" });
    req.destroy();
  });

  try {
    const raw = await readBody(req, config.maxSyncBytes);
    if (raw.length === 0) {
      sendOnce(res, 400, { error: "Cuerpo vacio" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      sendOnce(res, 400, { error: "JSON invalido" });
      return;
    }

    const result = await persistConversation(parsed);
    sendOnce(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
}

export async function handleListChats(req, res, remoteAddress) {
  if (!consumeAllowance(`chats:${remoteAddress}`, { capacity: 60, refillPerSecond: 1 })) {
    sendOnce(res, 429, { error: "Demasiadas consultas de conversaciones" });
    return;
  }
  try {
    const chats = await listSyncedChats();
    sendOnce(res, 200, { ok: true, chats, total: chats.length });
  } catch (error) {
    console.error(sanitizeLogMessage(`[sync] Fallo al listar conversaciones: ${error.message}`));
    sendOnce(res, 500, { error: "No se pudieron obtener las conversaciones" });
  }
}

export async function handleGetChat(req, res, id, remoteAddress, format = "json") {
  if (!consumeAllowance(`chat:${remoteAddress}`, { capacity: 120, refillPerSecond: 2 })) {
    sendOnce(res, 429, { error: "Demasiadas consultas" });
    return;
  }
  try {
    if (!id || !SAFE_ID_RE.test(id)) {
      sendOnce(res, 400, { error: "Identificador de conversacion invalido" });
      return;
    }
    const result = await getSyncedChat(id, format);
    if (result.type === "markdown") {
      const body = Buffer.from(result.content, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
      });
      res.end(body);
      return;
    }
    sendOnce(res, 200, { ok: true, chat: result.chat });
  } catch (error) {
    sendError(res, error, id);
  }
}

export async function persistSatelliteNote(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw Object.assign(new Error("Se esperaba un objeto JSON"), { statusCode: 400 });
  }

  const rawId = String(payload.satelliteId || "").trim();
  const safeId = (rawId ? rawId.replace(/[^a-zA-Z0-9_-]/g, "_") : `sat_${Date.now()}`).slice(0, 80);
  const title = String(payload.title || "nota-satelite").trim().slice(0, 120);
  const slug = slugify(title);
  const base = `${safeId}_${slug}`;

  const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const now = Date.now();
  const isoDate = new Date(now).toISOString();

  const messages = rawMessages.map((entry) => ({
    role: entry?.role === "assistant" ? "assistant" : "user",
    content: String(entry?.content ?? "").slice(0, config.maxMessageChars),
    timestamp: Number.isFinite(Number(entry?.timestamp)) && Number(entry?.timestamp) > 0 ? Number(entry?.timestamp) : now,
  }));

  const satelliteDir = path.join(config.syncDir, "satellite_notes");
  await fs.promises.mkdir(satelliteDir, { recursive: true });

  const jsonPath = assertInside(satelliteDir, `${base}.json`);
  const mdPath = assertInside(satelliteDir, `${base}.md`);

  const document = {
    absorbedId: base,
    satelliteId: safeId,
    title: neutralizeMarkdown(title),
    summary: neutralizeMarkdown(summary),
    absorbedAt: isoDate,
    absorbedTimestamp: now,
    messageCount: messages.length,
    messages: messages.map((m) => ({
      role: m.role,
      content: neutralizeMarkdown(m.content),
      timestamp: m.timestamp,
    })),
  };

  const mdParts = [
    `# Nota Satélite: ${neutralizeMarkdown(title)}\n`,
    `- ID Satélite: ${safeId}`,
    `- Fecha de absorción: ${isoDate}`,
    `- Mensajes: ${messages.length}\n`,
  ];
  if (summary) {
    mdParts.push(`## Resumen\n\n${neutralizeMarkdown(summary)}\n`);
  }
  mdParts.push("---\n");
  for (const m of messages) {
    mdParts.push(`### ${m.role === "assistant" ? "Asistente" : "Usuario"}\n\n${neutralizeMarkdown(m.content)}\n\n---\n`);
  }

  await Promise.all([
    writeAtomic(jsonPath, JSON.stringify(document, null, 2)),
    writeAtomic(mdPath, mdParts.join("\n")),
  ]);

  // P9: las notas satelite tambien entran en la retencion de synced_chats/.
  await pruneSyncedChatsSafe();

  return { ok: true, absorbedId: base };
}

export async function handleAbsorbSatellite(req, res, remoteAddress) {
  if (!consumeAllowance(`absorb:${remoteAddress}`, { capacity: 20, refillPerSecond: 0.5 })) {
    sendOnce(res, 429, { error: "Demasiadas peticiones. Reintente en unos segundos." });
    req.resume();
    return;
  }

  req.setTimeout(20_000, () => {
    sendOnce(res, 408, { error: "Tiempo de espera agotado" });
    req.destroy();
  });

  try {
    const raw = await readBody(req, config.maxSyncBytes);
    if (raw.length === 0) {
      sendOnce(res, 400, { error: "Cuerpo vacio" });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      sendOnce(res, 400, { error: "JSON invalido" });
      return;
    }

    const result = await persistSatelliteNote(parsed);
    sendOnce(res, 200, result);
  } catch (error) {
    sendError(res, error);
  }
}
