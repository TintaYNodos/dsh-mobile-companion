/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael MuÃ±oz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1) / PolyForm Noncommercial 1.0.0.
 * See companion/LICENSE or LICENSE for license terms.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { readBody, sendJson } from "./http.mjs";
import { consumeAllowance } from "./ratelimit.mjs";

const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const neutralizeMarkdown = (value) => escapeHtml(value).replace(/([[\]()*_`~\\])/g, "\\$1");

const slugify = (value) => {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || "chat").slice(0, 40);
};

const uniqueBase = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const entropy = crypto.randomBytes(3).toString("hex");
  return `sync_${stamp}_${entropy}`;
};

const assertInside = (directory, candidate) => {
  const resolved = path.resolve(directory, candidate);
  const prefix = directory.endsWith(path.sep) ? directory : directory + path.sep;
  if (!resolved.startsWith(prefix)) throw new Error("Ruta fuera del directorio de sincronizacion");
  return resolved;
};

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

const renderMarkdown = (title, isoDate, messages) => {
  const parts = [`# Sesion sincronizada: ${escapeHtml(title)}\n\n- Fecha: ${isoDate}\n- Mensajes: ${messages.length}\n\n---\n`];
  for (const m of messages) {
    parts.push(`### ${m.role === "assistant" ? "Asistente" : "Usuario"}\n\n${neutralizeMarkdown(m.content)}\n\n---\n`);
  }
  return parts.join("\n");
};

const writeAtomic = async (filePath, contents) => {
  const temporary = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.promises.writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await fs.promises.rename(temporary, filePath);
};

async function persistConversation(payload) {
  const { title, messages, now } = validatePayload(payload);
  await fs.promises.mkdir(config.syncDir, { recursive: true });

  const base = `${uniqueBase()}_${slugify(title)}`;
  const jsonPath = assertInside(config.syncDir, `${base}.json`);
  const markdownPath = assertInside(config.syncDir, `${base}.md`);
  const indexPath = assertInside(config.syncDir, "index.jsonl");

  const isoDate = new Date(now).toISOString();
  const document = {
    id: base,
    sessionTitle: escapeHtml(title),
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
    title: escapeHtml(title),
    messageCount: messages.length,
    json: `${base}.json`,
    markdown: `${base}.md`,
  });
  await fs.promises.appendFile(indexPath, `${indexEntry}\n`, "utf8");

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
    console.error(`[sync] Fallo${id ? ` en ${id}` : ""}: ${error.message}`);
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

export async function listSyncedChats() {
  await fs.promises.mkdir(config.syncDir, { recursive: true });
  const entries = await fs.promises.readdir(config.syncDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((d) => d.isFile() && d.name.endsWith(".json") && d.name !== "index.jsonl" && !d.name.includes(".tmp"))
    .map((d) => d.name);

  const chats = [];
  for (const filename of jsonFiles) {
    try {
      const fullPath = assertInside(config.syncDir, filename);
      const raw = await fs.promises.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw);
      const id = parsed.id || path.basename(filename, ".json");
      chats.push({
        id,
        title: parsed.sessionTitle || id,
        syncedAt: parsed.syncedAt || new Date(parsed.syncedTimestamp || 0).toISOString(),
        savedAt: parsed.syncedTimestamp || 0,
        messageCount: Number.isInteger(parsed.messageCount)
          ? parsed.messageCount
          : (Array.isArray(parsed.messages) ? parsed.messages.length : 0),
        markdownFile: `${id}.md`,
        jsonFile: `${id}.json`,
      });
    } catch {}
  }

  chats.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return chats;
}

export async function getSyncedChat(id, format = "json") {
  if (!id || !SAFE_ID_RE.test(id)) {
    throw Object.assign(new Error("Identificador invalido"), { statusCode: 400 });
  }

  const jsonPath = assertInside(config.syncDir, `${id}.json`);
  const mdPath = assertInside(config.syncDir, `${id}.md`);

  let jsonRaw;
  try {
    jsonRaw = await fs.promises.readFile(jsonPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error("Conversacion no encontrada"), { statusCode: 404 });
    }
    throw error;
  }

  if (format === "md" || format === "markdown") {
    try {
      const mdRaw = await fs.promises.readFile(mdPath, "utf8");
      return { type: "markdown", content: mdRaw };
    } catch {
      const parsed = JSON.parse(jsonRaw);
      const md = renderMarkdown(parsed.sessionTitle, parsed.syncedAt, parsed.messages || []);
      return { type: "markdown", content: md };
    }
  }

  const chat = JSON.parse(jsonRaw);
  try {
    chat.markdown = await fs.promises.readFile(mdPath, "utf8");
  } catch {
    chat.markdown = renderMarkdown(chat.sessionTitle, chat.syncedAt, chat.messages || []);
  }

  return { type: "json", chat };
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
    console.error(`[sync] Fallo al listar conversaciones: ${error.message}`);
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
