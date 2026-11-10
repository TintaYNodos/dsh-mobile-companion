import fs from "node:fs";
import path from "node:path";

const SYNC_DIR = path.join(process.cwd(), "synced_chats");

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function handleSync(req, res) {
  const MAX_SYNC_BODY = 10 * 1024 * 1024;
  const declaredLen = parseInt(req.headers["content-length"] || "0", 10);

  if (declaredLen > MAX_SYNC_BODY) {
    res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Payload excede el limite de 10 MB" }));
    req.resume();
    return;
  }

  let body = "";
  let bodySize = 0;
  let aborted = false;

  req.on("data", (chunk) => {
    if (aborted) return;
    bodySize += chunk.length;
    if (bodySize > MAX_SYNC_BODY) {
      aborted = true;
      if (!res.headersSent) {
        res.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Payload excede el limite de 10 MB" }));
      }
      req.pause();
      req.destroy();
      return;
    }
    body += chunk;
  });

  req.on("end", async () => {
    if (aborted || res.headersSent) return;
    try {
      const data = JSON.parse(body);
      const { sessionTitle, messages } = data;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Array de mensajes requerido" }));
        return;
      }

      await fs.promises.mkdir(SYNC_DIR, { recursive: true });

      const now = Date.now();
      const dateIso = new Date(now).toISOString();
      const rawTitle = String(sessionTitle || "chat-movil");
      const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_").slice(0, 40);
      const fileBase = `sync_${dateIso.replace(/[:.]/g, "-")}_${safeTitle}`;
      const mdFile = `${fileBase}.md`;
      const jsonFile = `${fileBase}.json`;

      const cleanTitle = escapeHtml(rawTitle);
      const cleanMessages = messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
        cleanContent: escapeHtml(String(m.content || "")),
        timestamp: m.timestamp || now,
      }));

      const jsonPayload = {
        id: fileBase,
        sessionTitle: cleanTitle,
        syncedAt: dateIso,
        syncedTimestamp: now,
        messageCount: cleanMessages.length,
        messages: cleanMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      };

      await fs.promises.writeFile(
        path.join(SYNC_DIR, jsonFile),
        JSON.stringify(jsonPayload, null, 2),
        "utf8"
      );

      const mdLines = [
        `# Sesion Sincronizada: ${cleanTitle}\n\n`,
        `- **Fecha:** ${dateIso}\n`,
        `- **Mensajes:** ${cleanMessages.length}\n\n---\n\n`,
      ];
      for (const msg of cleanMessages) {
        const roleLabel = msg.role === "user" ? "### 👤 Usuario" : "### 🤖 Asistente";
        mdLines.push(`${roleLabel}\n\n${msg.cleanContent}\n\n---\n\n`);
      }

      await fs.promises.writeFile(path.join(SYNC_DIR, mdFile), mdLines.join(""), "utf8");
      await fs.promises.appendFile(
        path.join(SYNC_DIR, "index.jsonl"),
        JSON.stringify({ id: fileBase, savedAt: now, title: cleanTitle, mdFile, jsonFile }) + "\n",
        "utf8"
      );

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, syncedCount: cleanMessages.length, file: mdFile }));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Formato de datos invalido" }));
      }
    }
  });
}
