/**
 * DSH Mobile Companion Bridge
 * Arquitectura Segura, Asincrona y Optimizada (ESM Node.js 20+)
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log, probePort, findVpnIp, isClientAuthorized, scanActiveDshPort } from "./src/network.mjs";
import { handleSync } from "./src/sync.mjs";
import { handleHttpProxy, handleWsProxy } from "./src/proxy.mjs";
import { getAuthority, verifyCompanionToken } from "./src/crypto.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_HOST = "127.0.0.1";
let TARGET_PORT = parseInt(process.env.DSH_TARGET_PORT || "52710", 10);
const LISTEN_PORT = parseInt(process.env.DSH_LISTEN_PORT || "57420", 10);

const { ip: BIND_IP, iface } = findVpnIp();
const FINAL_BIND_HOST = process.env.DSH_BIND_HOST || BIND_IP;

if (FINAL_BIND_HOST === "0.0.0.0") {
  console.error("[Ciberseguridad] Escucha en 0.0.0.0 prohibida por diseno.");
  process.exit(1);
}

const STATIC_FILES = {
  "/m": "m.html",
  "/offline": "m.html",
  "/sw.js": "sw.js",
  "/manifest.webmanifest": "manifest.webmanifest",
  "/icon.svg": "icon.svg",
};

const CONTENT_TYPES = {
  "m.html": "text/html; charset=utf-8",
  "sw.js": "application/javascript; charset=utf-8",
  "manifest.webmanifest": "application/manifest+json; charset=utf-8",
  "icon.svg": "image/svg+xml",
};

async function ensureActiveDshPort() {
  const resolved = await scanActiveDshPort(TARGET_PORT);
  if (resolved && resolved !== TARGET_PORT) {
    TARGET_PORT = resolved;
  }
  return TARGET_PORT;
}

const server = http.createServer(async (clientReq, clientRes) => {
  if (!isClientAuthorized(clientReq.socket.remoteAddress, FINAL_BIND_HOST)) {
    clientRes.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    clientRes.end("Acceso denegado: IP de cliente no autorizada.");
    return;
  }

  await ensureActiveDshPort();

  const reqUrl = new URL(clientReq.url, `http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  const pathname = reqUrl.pathname;

  // Healthcheck y estado de enlace multi-bunker
  if (pathname === "/dsh-companion/status" && clientReq.method === "GET") {
    const isOnline = await probePort(TARGET_PORT, TARGET_HOST, 400);
    clientRes.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    clientRes.end(JSON.stringify({
      status: "online",
      dshOnline: isOnline,
      dshTargetPort: TARGET_PORT,
      hostname: os.hostname(),
      platform: os.platform(),
      bunkerIp: FINAL_BIND_HOST,
      time: Date.now(),
    }));
    return;
  }

  // Sincronizacion de chats satelite
  if (pathname === "/dsh-companion/sync" && clientReq.method === "POST") {
    if (!verifyCompanionToken(clientReq)) {
      clientRes.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      clientRes.end(JSON.stringify({ error: "Token de autorizacion invalido o ausente" }));
      return;
    }
    return handleSync(clientReq, clientRes);
  }

  // Despacho de activos estaticos PWA satelite (/m, /offline, sw.js, etc.)
  if (STATIC_FILES[pathname]) {
    const filename = STATIC_FILES[pathname];
    const filepath = path.join(__dirname, filename);
    if (fs.existsSync(filepath)) {
      const headers = {
        "Content-Type": CONTENT_TYPES[filename],
        "X-Content-Type-Options": "nosniff",
      };
      if (filename === "m.html") headers["Cache-Control"] = "no-cache";
      if (filename === "sw.js") headers["Service-Worker-Allowed"] = "/";

      clientRes.writeHead(200, headers);
      fs.createReadStream(filepath).pipe(clientRes);
      return;
    }
  }

  // Por defecto: proxy directo e integro a la Web GUI oficial de DeepSeek Harness (con inyeccion HMAC transparente)
  handleHttpProxy(clientReq, clientRes, TARGET_HOST, TARGET_PORT);
});

server.on("upgrade", async (clientReq, clientSocket, clientHead) => {
  if (!isClientAuthorized(clientSocket.remoteAddress, FINAL_BIND_HOST)) {
    clientSocket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    clientSocket.destroy();
    return;
  }
  await ensureActiveDshPort();
  handleWsProxy(clientReq, clientSocket, clientHead, TARGET_HOST, TARGET_PORT);
});

server.listen(LISTEN_PORT, FINAL_BIND_HOST, () => {
  log(`DSH Mobile Companion ACTIVO (Edicion Endurecida y Modular)`);
  log(`Interfaz VPN detectada: ${iface} (${BIND_IP})`);
  log(`Socket enlazado estrictamente: http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  log(`Destino DSH backend: http://${getAuthority(TARGET_HOST, TARGET_PORT)}`);
});

server.on("error", (err) => {
  console.error(`[Error Fatal] No se pudo enlazar socket en ${FINAL_BIND_HOST}:${LISTEN_PORT}:`, err.message);
  process.exit(1);
});
