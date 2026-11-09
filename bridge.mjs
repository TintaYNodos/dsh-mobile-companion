/**
 * DSH Mobile Companion Bridge - EDICIÓN BLINDADA
 * Elaborado por: Ismael Muñoz Reyes
 * Proyecto: DSH Mobile Companion / Tinta y Nodos
 */

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TARGET_HOST = "127.0.0.1";
const LISTEN_PORT = parseInt(process.env.DSH_LISTEN_PORT || "57420", 10);

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[DSH-Bridge ${ts}] ${msg}`);
}

function probePort(port, host = TARGET_HOST, timeout = 1000) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: host, port, method: "GET", path: "/", timeout },
      (res) => {
        if ([200, 301, 302, 401, 403].includes(res.statusCode)) {
          resolve(true);
        } else {
          resolve(false);
        }
        res.resume();
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function detectTargetPort() {
  if (process.env.DSH_TARGET_PORT) {
    const envPort = parseInt(process.env.DSH_TARGET_PORT, 10);
    if (!isNaN(envPort) && envPort > 0) return envPort;
  }
  // Se excluye 57420 para evitar colisiones con LISTEN_PORT
  const candidatePorts = [52710, 52711, 52712, 57421];
  for (const port of candidatePorts) {
    if (await probePort(port)) {
      log(`Detectado Web GUI de DSH en puerto: ${port}`);
      return port;
    }
  }
  return 52710;
}

function findVpnIp() {
  if (process.env.DSH_VPN_IP) {
    return { ip: process.env.DSH_VPN_IP, iface: "env" };
  }
  const ifaces = os.networkInterfaces();
  const isIpv4 = (a) => (a.family === "IPv4" || a.family === 4) && !a.internal && !a.address.startsWith("169.254.");

  // 1. Interfaces explícitas VPN (ZeroTier, Tailscale, WireGuard, TUN/TAP)
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/zerotier|tailscale|^zt|^ts|wireguard|^wg|openvpn/i.test(name) && addrs) {
      for (const a of addrs) {
        if (isIpv4(a)) return { ip: a.address, iface: name };
      }
    }
  }
  // 2. Tailscale CGNAT (100.64.0.0/10)
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs) {
      for (const a of addrs) {
        if (isIpv4(a) && a.address.startsWith("100.")) {
          const second = Number(a.address.split(".")[1]);
          if (second >= 64 && second <= 127) return { ip: a.address, iface: name };
        }
      }
    }
  }
  // 3. Subred ZeroTier típica (10.x.x.x) si no tiene nombre reconocible
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs) {
      for (const a of addrs) {
        if (isIpv4(a) && a.address.startsWith("10.")) {
          return { ip: a.address, iface: name };
        }
      }
    }
  }

  return { ip: "127.0.0.1", iface: "loopback" };
}

function loadSecret() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const credPath = path.join(dshHome, ".credentials.yaml");
  if (!fs.existsSync(credPath)) {
    throw new Error(`No se encontró el archivo de credenciales en ${credPath}`);
  }
  const content = fs.readFileSync(credPath, "utf8");
  const match = content.match(/client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]+)/);
  if (!match || !match[1]) {
    throw new Error("No se pudo extraer el secreto browser-session de .credentials.yaml");
  }
  return match[1].trim();
}

const TARGET_PORT = await detectTargetPort();
const rawSecret = loadSecret();
const secret = Buffer.from(rawSecret, "base64url");
const authority = `${TARGET_HOST}:${TARGET_PORT}`;
const cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
const cookieName = `dsh-auth-${cookieHash}`;

let cachedCookie = "";
let cookieExpiresAt = 0;

function getValidCookie() {
  const now = Date.now();
  if (cachedCookie && now < cookieExpiresAt) {
    return cachedCookie;
  }
  const issuedAt = now;
  const expiresAt = issuedAt + 7 * 24 * 3600 * 1000;
  const payload = { version: 1, authority, issuedAt, expiresAt };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest().toString("base64url");
  cachedCookie = `${cookieName}=v1.${body}.${sig}`;
  cookieExpiresAt = expiresAt - 3600 * 1000;
  return cachedCookie;
}

function injectAuthHeaders(headers) {
  const newHeaders = { ...headers };
  newHeaders["host"] = authority;
  if (newHeaders["origin"]) newHeaders["origin"] = `http://${authority}`;
  if (newHeaders["referer"]) newHeaders["referer"] = `http://${authority}/`;

  const authCookie = getValidCookie();
  if (newHeaders["cookie"]) {
    const cookies = newHeaders["cookie"]
      .split(";")
      .map((c) => c.trim())
      .filter((c) => !c.startsWith(`${cookieName}=`));
    cookies.push(authCookie);
    newHeaders["cookie"] = cookies.join("; ");
  } else {
    newHeaders["cookie"] = authCookie;
  }
  return newHeaders;
}

const { ip: BIND_IP, iface } = findVpnIp();
// AMARRE ESTRICTO (Parche VULN-01): Solo escucha en la IP de la VPN. Si no hay VPN, se recluye en loopback.
const FINAL_BIND_HOST = process.env.DSH_BIND_HOST || (BIND_IP !== "127.0.0.1" ? BIND_IP : "127.0.0.1");

const server = http.createServer((clientReq, clientRes) => {
  const targetHeaders = injectAuthHeaders(clientReq.headers);

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: targetHeaders,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    // Parche VULN-03: Solo escribe encabezados si no han sido enviados para evitar DoS por ERR_HTTP_HEADERS_SENT
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      clientRes.end(`[DSH Bridge] Error al conectar con el backend (${TARGET_HOST}:${TARGET_PORT}): ${err.message}`);
    } else {
      clientRes.destroy();
    }
  });

  clientReq.pipe(proxyReq, { end: true });
  clientReq.on("error", () => proxyReq.destroy());
});

server.on("upgrade", (clientReq, clientSocket, clientHead) => {
  clientSocket.pause();
  const targetHeaders = injectAuthHeaders(clientReq.headers);

  const targetSocket = net.connect(TARGET_PORT, TARGET_HOST, () => {
    let reqRaw = `${clientReq.method} ${clientReq.url} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(targetHeaders)) {
      // Parche VULN-02: Sanitización contra CRLF Injection en WebSocket handshake
      const sanitizedKey = String(key).replace(/[\r\n]/g, "");
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (v !== undefined) {
          const sanitizedVal = String(v).replace(/[\r\n]/g, "");
          reqRaw += `${sanitizedKey}: ${sanitizedVal}\r\n`;
        }
      }
    }
    reqRaw += "\r\n";

    targetSocket.write(reqRaw);
    if (clientHead && clientHead.length) {
      targetSocket.write(clientHead);
    }

    clientSocket.pipe(targetSocket);
    targetSocket.pipe(clientSocket);
    clientSocket.resume();
  });

  targetSocket.on("error", (err) => {
    log(`Error en túnel WebSocket: ${err.message}`);
    if (clientSocket.writable) {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
    clientSocket.destroy();
  });

  clientSocket.on("error", () => targetSocket.destroy());
});

server.listen(LISTEN_PORT, FINAL_BIND_HOST, () => {
  log(`Tinta y Nodos - DSH Mobile Companion ACTIVO`);
  log(`Interfaz detectada: ${iface} (${BIND_IP})`);
  log(`Escuchando estrictamente en: http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  log(`Redirigiendo de forma segura hacia: http://${authority}`);
});

server.on("error", (err) => {
  console.error(`[Error Fatal] No se pudo levantar el puerto ${FINAL_BIND_HOST}:${LISTEN_PORT}:`, err.message);
  process.exit(1);
});
