/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authHeader, HOST, PORT } from "./_harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SYNC_DIR = path.resolve(process.env.DSH_SYNC_DIR || path.join(here, "..", "synced_chats"));

const pas = [];
const check = (name, ok, detail) => {
  pas.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

function request(requestPath, { method = "GET", headers = {}, body = null, withAuth = true } = {}) {
  if (withAuth) headers = { ...authHeader(), ...headers };
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: requestPath, method, headers, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers || {}, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, body: "", error: "timeout" }); });
    req.on("error", (error) => resolve({ status: 0, headers: {}, body: "", error: error.code || error.message }));
    if (body) req.write(body);
    req.end();
  });
}

// --- P8: neutralizacion en la sincronizacion ---
// El criterio vigente solo neutraliza `&` y `<`: el Markdown del usuario
// (asteriscos, backticks, `#`, enlaces, citas) se guarda byte a byte, y `>` no
// se escapa para no romper las citas. Estas pruebas hablan con el puente vivo,
// no con el contenido que dejaron corridas anteriores.
const NOW = Date.now();
const XSS = "Hola <script>alert(1)</script> y *mk* y `code`";
const MARKDOWN = "# Titulo\n- lista\n*enfasis* y `code` y [enlace](https://example.com) y > cita";
const AMPERSAND = "Tom & Jerry &amp; ya escapado";
const syncPayload = {
  sessionTitle: "Prueba P8 *titulo* & notas",
  messages: [
    { role: "user", content: XSS, timestamp: NOW },
    { role: "assistant", content: MARKDOWN, timestamp: NOW + 1 },
    { role: "user", content: AMPERSAND, timestamp: NOW + 2 },
  ],
};
const sync = await request("/dsh-companion/sync", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(syncPayload),
});
let syncJson = {};
try { syncJson = JSON.parse(sync.body); } catch {}
check("sync acepta el documento", sync.status === 200 && syncJson.ok === true && Boolean(syncJson.id), `status=${sync.status}`);
const id = String(syncJson.id || "");

const saved = await request(`/dsh-companion/chat/${id}`);
let savedJson = {};
try { savedJson = JSON.parse(saved.body); } catch {}
const savedContent = String(savedJson.chat?.messages?.[0]?.content ?? "");
check(
  "JSON guardado neutraliza < sin tocar Markdown",
  savedContent === "Hola &lt;script>alert(1)&lt;/script> y *mk* y `code`",
  savedContent
);
check("JSON guardado no deja etiqueta cruda", !saved.body.includes("<script>"));
check("JSON guardado no doble-escapa", !saved.body.includes("&amp;lt;") && !saved.body.includes("&amp;amp;lt;"));
check("titulo conserva Markdown y neutraliza &", String(savedJson.chat?.sessionTitle || "") === "Prueba P8 *titulo* &amp; notas", String(savedJson.chat?.sessionTitle || ""));

const markdown = await request(`/dsh-companion/chat/${id}?format=md`);
check("markdown servido 200 text/markdown", markdown.status === 200 && String(markdown.headers["content-type"] || "").includes("text/markdown"), `status=${markdown.status}`);
check("markdown neutraliza < sin &gt;", markdown.body.includes("&lt;script>alert(1)&lt;/script>"), "");
check("markdown sin etiqueta script cruda", !markdown.body.includes("<script>"));
check("markdown sin doble escapado", !markdown.body.includes("&amp;lt;") && !markdown.body.includes("\\*") && !markdown.body.includes("\\`"));
check("markdown conserva *mk* y `code`", markdown.body.includes("*mk*") && markdown.body.includes("`code`"));
check("markdown normal es byte a byte igual al original", markdown.body.includes(MARKDOWN), "");
check("& se escapa una sola vez", markdown.body.includes("Tom &amp; Jerry &amp;amp; ya escapado") && !markdown.body.includes("&amp;amp;amp;"));

const mdOnDisk = path.join(SYNC_DIR, `${id}.md`);
const mdDiskExists = fs.existsSync(mdOnDisk);
check("markdown escrito en disco", mdDiskExists, `${id}.md`);
if (mdDiskExists) {
  const disk = fs.readFileSync(mdOnDisk, "utf8");
  check("markdown en disco neutraliza < sin &gt;", disk.includes("&lt;script>alert(1)&lt;/script>"));
  check("markdown en disco conserva el Markdown del usuario", disk.includes(MARKDOWN));
}

const indexLines = fs.readFileSync(path.join(SYNC_DIR, "index.jsonl"), "utf8").trim().split("\n").filter(Boolean);
check(
  "index.jsonl con entradas JSON validas",
  indexLines.every((line) => { try { JSON.parse(line); return true; } catch { return false; } }),
  `${indexLines.length} entradas`
);

// --- Handshake WebSocket ---
const wsHandshake = (extraHeaders = []) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    let buffer = "";
    const timer = setTimeout(() => { socket.destroy(); resolve("TIMEOUT"); }, 6000);

    socket.on("connect", () => {
      const lines = [
        "GET /ws HTTP/1.1",
        `Host: ${HOST}:${PORT}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        ...Object.entries(authHeader()).map(([name, value]) => `${name}: ${value}`),
        ...extraHeaders,
        "",
        "",
      ];
      socket.write(lines.join("\r\n"));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      if (buffer.includes("\r\n")) {
        clearTimeout(timer);
        socket.destroy();
        resolve(buffer.split("\r\n")[0]);
      }
    });

    socket.on("error", (error) => { clearTimeout(timer); resolve("ERR:" + (error.code || error.message)); });
  });

const wsSame = await wsHandshake([`Origin: http://${HOST}:${PORT}`]);
check("websocket propio aceptado (no 401 ni 403)", !wsSame.includes("401") && !wsSame.includes("403"), wsSame);

const wsBad = await wsHandshake(["Origin: https://evil.example"]);
check("websocket origen cruzado rechazado", wsBad.includes("403"), wsBad);

const wsNull = await wsHandshake(["Origin: null"]);
check("websocket con Origin nulo rechazado", wsNull.includes("403"), wsNull);

console.log(`\nRESULTADO: ${pas.filter(Boolean).length}/${pas.length} pruebas correctas`);
if (pas.some((ok) => !ok)) process.exitCode = 1;
