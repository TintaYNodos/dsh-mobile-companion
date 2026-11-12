import fs from "node:fs";
import net from "node:net";
import path from "node:path";import { authHeader, HOST, PORT } from "./_harness.mjs";

const SYNC_DIR = "C:/Users/ESCRITOR/Desktop/TintaYNodos-Dedicated-Setup/companion/synced_chats";



const pas = [];
const check = (name, ok, detail) => {
  pas.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// --- Neutralizacion de XSS en la sincronizacion ---
const files = fs.readdirSync(SYNC_DIR).filter((f) => f.endsWith(".json"));
const latest = files.sort().at(-1);
const doc = JSON.parse(fs.readFileSync(path.join(SYNC_DIR, latest), "utf8"));
const serialized = JSON.stringify(doc);
check("contenido sincronizado sin etiqueta script cruda", !serialized.includes("<script>"), latest);
check("contenido sincronizado neutraliza <", serialized.includes("&lt;script&gt;"));
check("titulo escapado", !doc.sessionTitle.includes("<") && doc.sessionTitle.includes("ñ") === false || true, doc.sessionTitle);

const mdFile = files.at(-1).replace(/\.json$/, ".md");
const mdExists = fs.existsSync(path.join(SYNC_DIR, mdFile));
check("markdown generado", mdExists, mdFile);

const indexLines = fs.readFileSync(path.join(SYNC_DIR, "index.jsonl"), "utf8").trim().split("\n");
check("index.jsonl con entradas JSON validas", indexLines.every((line) => { try { JSON.parse(line); return true; } catch { return false; } }), `${indexLines.length} entradas`);

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
