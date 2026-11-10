import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNC_DIR = path.resolve(__dirname, "..", "synced_chats");
const MAX_SYNC_BODY = 4 * 1024 * 1024; // 4 MB limite seguro

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeMarkdownText(str) {
  return escapeHtml(str).replace(/([\[\]\(\)\*\_\`\~])/g, "\\$1");
}

async function persistSyncData({ sessionTitle, messages }) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 1000) {
    throw new Error("Coleccion de mensajes invalida (debe contener entre 1 y 1000 mensajes)");
  }

  await fs.promises.mkdir(SYNC_DIR, { recursive: true });

  const now = Date.now();
  const dateIso = new Date(now).toISOString();
  const rawTitle = String(sessionTitle || "chat-movil").trim();
  const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_").slice(0, 32);
  const fileBase = `sync_${dateIso.replace(/[:.]/g, "-")}_${safeTitle}`;
  const mdFile = `${fileBase}.md`;
  const jsonFile = `${fileBase}.json`;

  const cleanTitle = escapeHtml(rawTitle);
  const cleanMessages = messages.map((m) => {
    const rawContent = String(m.content || "").slice(0, 200_000);
    return {
      role: m.role === "assistant" ? "assistant" : "user",
      content: rawContent,
      cleanContent: sanitizeMarkdownText(rawContent),
      timestamp: Number(m.timestamp) || now,
    };
  });

  const jsonPayload = {
    id: fileBase,
    sessionTitle: cleanTitle,
    syncedAt: dateIso,
    syncedTimestamp: now,
    messageCount: cleanMessages.length,
    messages: cleanMessages.map((m) => ({
      role: m.role,
      content: m.cleanContent,
      timestamp: m.timestamp,
    })),
  };

  const mdLines = [
    `# Sesion Sincronizada: ${cleanTitle}\n\n`,
    `- **Fecha:** ${dateIso}\n`,
    `- **Mensajes:** ${cleanMessages.length}\n\n---\n\n`,
  ];
  for (const msg of cleanMessages) {
    const roleLabel = msg.role === "user" ? "### 👤 Usuario" : "### 🤖 Asistente";
    mdLines.push(`${roleLabel}\n\n${msg.cleanContent}\n\n---\n\n`);
  }

  // Escrituras concurrentes en disco
  await Promise.all([
    fs.promises.writeFile(path.join(SYNC_DIR, jsonFile), JSON.stringify(jsonPayload, null, 2), "utf8"),
    fs.promises.writeFile(path.join(SYNC_DIR, mdFile), mdLines.join(""), "utf8"),
    fs.promises.appendFile(
      path.join(SYNC_DIR, "index.jsonl"),
      JSON.stringify({ id: fileBase, savedAt: now, title: cleanTitle, mdFile, jsonFile }) + "\n",
      "utf8"
    ),
  ]);

  return { ok: true, syncedCount: cleanMessages.length, file: mdFile };
}

export async function handleSync(req, res) {
  const declaredLen = parseInt(req.headers["content-length"] || "0", 10);
  if (declaredLen > MAX_SYNC_BODY) {
    res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Payload excede el limite de 4 MB" }));
    req.resume();
    return;
  }

  req.setTimeout(20_000, () => {
    if (!res.headersSent) {
      res.writeHead(408, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Tiempo de espera de subida agotado" }));
    }
    req.destroy();
  });

  const chunks = [];
  let size = 0;
  let aborted = false;

  req.on("data", (chunk) => {
    if (aborted) return;
    size += chunk.length;
    if (size > MAX_SYNC_BODY) {
      aborted = true;
      if (!res.headersSent) {
        res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Payload excede el limite de 4 MB" }));
      }
      req.pause();
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", async () => {
    if (aborted || res.headersSent) return;
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const result = await persistSyncData(data);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: err.message || "Estructura de datos invalida" }));
      }
    }
  });
}
