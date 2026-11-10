/**
 * DSH Mobile Companion Bridge - EDICION OPTIMIZADA Y MODULAR
 */

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log, probePort, findVpnIp } from "./src/network.mjs";
import { handleSync } from "./src/sync.mjs";
import { handleHttpProxy, handleWsProxy } from "./src/proxy.mjs";
import { getAuthority } from "./src/crypto.mjs";

const TARGET_HOST = "127.0.0.1";
let TARGET_PORT = parseInt(process.env.DSH_TARGET_PORT || "52710", 10);
const LISTEN_PORT = parseInt(process.env.DSH_LISTEN_PORT || "57420", 10);

const { ip: BIND_IP, iface } = findVpnIp();
const FINAL_BIND_HOST = process.env.DSH_BIND_HOST || (BIND_IP !== "127.0.0.1" ? BIND_IP : "127.0.0.1");

const server = http.createServer(async (clientReq, clientRes) => {
  const reqUrl = new URL(clientReq.url, `http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  const pathname = reqUrl.pathname;

  if (pathname === "/dsh-companion/status" && clientReq.method === "GET") {
    let isDshActive = await probePort(TARGET_PORT, TARGET_HOST, 1000);
    if (!isDshActive) {
      const candidatePorts = [52710, 52711, 52712, 57421];
      for (const p of candidatePorts) {
        if (p !== TARGET_PORT && (await probePort(p, TARGET_HOST, 400))) {
          TARGET_PORT = p;
          log(`Puerto de destino actualizado hacia: ${TARGET_PORT}`);
          isDshActive = true;
          break;
        }
      }
    }

    clientRes.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    clientRes.end(JSON.stringify({
      status: "online",
      dshOnline: isDshActive,
      dshTargetPort: TARGET_PORT,
      hostname: os.hostname(),
      platform: os.platform(),
      bunkerIp: FINAL_BIND_HOST,
      time: Date.now(),
    }));
    return;
  }

  if (pathname === "/dsh-companion/sync" && clientReq.method === "POST") {
    return handleSync(clientReq, clientRes);
  }

  const staticFiles = {
    "/m": "m.html",
    "/offline": "m.html",
    "/sw.js": "sw.js",
    "/manifest.webmanifest": "manifest.webmanifest",
    "/icon.svg": "icon.svg"
  };

  const contentTypes = {
    "m.html": "text/html; charset=utf-8",
    "sw.js": "application/javascript; charset=utf-8",
    "manifest.webmanifest": "application/manifest+json; charset=utf-8",
    "icon.svg": "image/svg+xml"
  };

  if (staticFiles[pathname]) {
    const filename = staticFiles[pathname];
    const filepath = path.join(process.cwd(), filename);
    if (fs.existsSync(filepath)) {
      const headers = { "Content-Type": contentTypes[filename] };
      if (filename === "m.html") headers["Cache-Control"] = "no-cache";
      if (filename === "sw.js") headers["Service-Worker-Allowed"] = "/";
      
      clientRes.writeHead(200, headers);
      fs.createReadStream(filepath).pipe(clientRes);
      return;
    }
  }


  handleHttpProxy(clientReq, clientRes, TARGET_HOST, TARGET_PORT);
});

server.on("upgrade", (clientReq, clientSocket, clientHead) => {
  handleWsProxy(clientReq, clientSocket, clientHead, TARGET_HOST, TARGET_PORT);
});

server.listen(LISTEN_PORT, FINAL_BIND_HOST, () => {
  log(`Tinta y Nodos - DSH Mobile Companion ACTIVO (Edicion Modular y Optimizada)`);
  log(`Interfaz VPN detectada: ${iface} (${BIND_IP})`);
  log(`Escuchando estrictamente en: http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  log(`Redirigiendo de forma segura hacia: http://${getAuthority(TARGET_HOST, TARGET_PORT)}`);
});

server.on("error", (err) => {
  console.error(`[Error Fatal] No se pudo levantar el puerto ${FINAL_BIND_HOST}:${LISTEN_PORT}:`, err.message);
  process.exit(1);
});
