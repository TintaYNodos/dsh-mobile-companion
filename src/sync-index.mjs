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

/**
 * H-20: codigos TRANSITORIOS al reemplazar un archivo en Windows. El `rename`
 * sobre un destino que antivirus, el indice de busqueda u otro proceso tiene
 * abierto un instante falla asi y no es un error de logica: se reintenta.
 */
const TRANSIENT_WRITE_CODES = new Set(["EPERM", "EACCES", "EBUSY", "EEXIST", "ENOENT", "EAGAIN"]);

/**
 * Escritura atomica con reintento: temporal unico + rename. Sin reintento, un
 * EPERM/EACCES/EBUSY transitorio de Windows hacia fallar el POST (500) y dejaba
 * el `.tmp` huerfano (H-20: `tmp=1`). Se reintenta SOLO esos codigos, con
 * backoff corto, y el temporal se borra en cada fallo; el destino no se toca
 * hasta que el rename funciona, asi que nunca queda medio escrito.
 */
export const writeAtomic = async (filePath, contents) => {
  const temporary = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.promises.writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
      await fs.promises.rename(temporary, filePath);
      return;
    } catch (error) {
      try {
        // Limpieza del temporal: en cada fallo, reintente o no, no queda huerfano.
        await fs.promises.rm(temporary, { force: true });
      } catch {
        // Otro proceso/saneado ya lo borro: el estado deseado es el mismo.
      }
      if (!TRANSIENT_WRITE_CODES.has(error.code) || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** (attempt - 1)));
    }
  }
};

export const readDirSafe = async (directory) => {
  try {
    return await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
};

/**
 * H3: leer un chat no puede sacar contenido de fuera de synced_chats/.
 *
 * Se comprueba el directorio y cada archivo con `lstat` (que no sigue enlaces):
 * un symlink no es un archivo normal y se rechaza. Despues `realpath` confirma
 * que el archivo resuelto sigue dentro del directorio (por si hubiera enlaces
 * intermedios). Un hardlink a un archivo del host se rechaza por `nlink > 1`:
 * los chats se escriben con rename atomico y siempre tienen un solo enlace.
 */
const chatNotFound = () => Object.assign(new Error("Conversacion no encontrada"), { statusCode: 404 });

const safeSyncDirRealPath = async () => {
  let stat;
  try {
    stat = await fs.promises.lstat(config.syncDir);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw chatNotFound();
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw chatNotFound();
  return fs.promises.realpath(config.syncDir);
};

/** Valida un archivo de chat; `allowMissing` solo para el .md opcional. */
export const assertSafeChatFile = async (filePath, { allowMissing = false } = {}) => {
  let stat;
  try {
    stat = await fs.promises.lstat(filePath);
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return null;
    throw chatNotFound();
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1) throw chatNotFound();
  const base = await safeSyncDirRealPath();
  if (!base) throw chatNotFound();
  let resolved;
  try {
    resolved = await fs.promises.realpath(filePath);
  } catch {
    throw chatNotFound();
  }
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw chatNotFound();
  return stat;
};

/** Reescribe index.jsonl a partir de los .json que existen en disco. */
export const rebuildIndex = async () => {
  const chats = [];
  for (const entry of await readDirSafe(config.syncDir)) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "index.jsonl" || entry.name.includes(".tmp")) continue;
    try {
      const fullPath = assertInside(config.syncDir, entry.name);
      // H3: no reconstruir el indice leyendo un enlace a un archivo del host.
      await assertSafeChatFile(fullPath);
      const parsed = JSON.parse(await fs.promises.readFile(fullPath, "utf8"));
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
  // H3: si el propio synced_chats/ es un enlace, no se lista nada.
  const base = await safeSyncDirRealPath();
  if (!base) return [];
  const entries = await fs.promises.readdir(config.syncDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((d) => d.isFile() && d.name.endsWith(".json") && d.name !== "index.jsonl" && !d.name.includes(".tmp"))
    .map((d) => d.name);

  const chats = [];
  for (const filename of jsonFiles) {
    try {
      const fullPath = assertInside(config.syncDir, filename);
      // H3: symlinks/hardlinks a archivos del host no se leen ni se listan.
      await assertSafeChatFile(fullPath);
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

  // H3: el documento tiene que ser un archivo normal DENTRO de synced_chats/.
  // `lstat` + `realpath` + `nlink` cortan symlinks y hardlinks a archivos del
  // host antes de leer un solo byte.
  await assertSafeChatFile(jsonPath);

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
    // El .md es opcional (se puede reconstruir desde el JSON), pero si existe
    // como symlink/hardlink se descarta igual en vez de servirlo.
    const mdStat = await assertSafeChatFile(mdPath, { allowMissing: true }).catch(() => null);
    try {
      if (!mdStat) throw new Error("sin markdown en disco");
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
    const mdStat = await assertSafeChatFile(mdPath, { allowMissing: true }).catch(() => null);
    if (!mdStat) throw new Error("sin markdown en disco");
    chat.markdown = await fs.promises.readFile(mdPath, "utf8");
  } catch {
    chat.markdown = renderStoredMarkdown(chat.sessionTitle, chat.syncedAt, chat.messages || []);
  }

  return { type: "json", chat };
}
