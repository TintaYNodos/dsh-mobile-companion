/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { renderStoredMarkdown } from "./sync-format.mjs";

export const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;

export const assertInside = (directory, candidate) => {
  const resolved = path.resolve(directory, candidate);
  const prefix = directory.endsWith(path.sep) ? directory : directory + path.sep;
  if (!resolved.startsWith(prefix)) throw new Error("Ruta fuera del directorio de sincronizacion");
  return resolved;
};

export const writeAtomic = async (filePath, contents) => {
  const temporary = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.promises.writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await fs.promises.rename(temporary, filePath);
};

export const readDirSafe = async (directory) => {
  try {
    return await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
};

/** Reescribe index.jsonl a partir de los .json que existen en disco. */
export const rebuildIndex = async () => {
  const chats = [];
  for (const entry of await readDirSafe(config.syncDir)) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "index.jsonl" || entry.name.includes(".tmp")) continue;
    try {
      const parsed = JSON.parse(await fs.promises.readFile(assertInside(config.syncDir, entry.name), "utf8"));
      const id = parsed.id || path.basename(entry.name, ".json");
      chats.push({
        id,
        savedAt: Number(parsed.syncedTimestamp) || 0,
        title: parsed.sessionTitle || id,
        messageCount: Number.isInteger(parsed.messageCount)
          ? parsed.messageCount
          : (Array.isArray(parsed.messages) ? parsed.messages.length : 0),
        json: entry.name,
        markdown: `${id}.md`,
      });
    } catch {}
  }
  chats.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  const contents = chats.map((chat) => JSON.stringify(chat)).join("\n");
  await writeAtomic(assertInside(config.syncDir, "index.jsonl"), contents ? `${contents}\n` : "");
};

/** P9: reconstruye index.jsonl si falta (borrado a mano, disco lleno, etc.). */
export const ensureIndex = async () => {
  try {
    if ((await fs.promises.stat(assertInside(config.syncDir, "index.jsonl"))).isFile()) return;
  } catch {}
  await rebuildIndex();
};

export async function listSyncedChats() {
  await fs.promises.mkdir(config.syncDir, { recursive: true });
  // P9: al listar se repara index.jsonl si falta; el listado en si se calcula
  // leyendo los .json, asi que un indice roto no oculta conversaciones.
  await ensureIndex();
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
      const md = renderStoredMarkdown(parsed.sessionTitle, parsed.syncedAt, parsed.messages || []);
      return { type: "markdown", content: md };
    }
  }

  const chat = JSON.parse(jsonRaw);
  try {
    chat.markdown = await fs.promises.readFile(mdPath, "utf8");
  } catch {
    chat.markdown = renderStoredMarkdown(chat.sessionTitle, chat.syncedAt, chat.messages || []);
  }

  return { type: "json", chat };
}
