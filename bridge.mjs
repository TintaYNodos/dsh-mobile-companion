/**
 * DSH Mobile Companion Bridge - EDICIÓN BLINDADA CON MODO SATÉLITE HÍBRIDO
 * Elaborado por: Ismael Muñoz Reyes
 * Proyecto: DSH Mobile Companion / Tinta y Nodos
 */

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYNC_DIR = path.join(__dirname, "synced_chats");

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

let TARGET_PORT = await detectTargetPort();
const rawSecret = loadSecret();
const secret = Buffer.from(rawSecret, "base64url");
let authority = `${TARGET_HOST}:${TARGET_PORT}`;
let cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
let cookieName = `dsh-auth-${cookieHash}`;

let cachedCookie = "";
let cookieExpiresAt = 0;

function updateTargetPort(newPort) {
  if (newPort && newPort !== TARGET_PORT) {
    TARGET_PORT = newPort;
    authority = `${TARGET_HOST}:${TARGET_PORT}`;
    cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
    cookieName = `dsh-auth-${cookieHash}`;
    cachedCookie = "";
    cookieExpiresAt = 0;
    log(`Actualizado puerto objetivo de DSH: ${TARGET_PORT}`);
  }
}

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
// AMARRE ESTRICTO: Solo escucha en la IP de la VPN. Si no hay VPN, se recluye en loopback.
const FINAL_BIND_HOST = process.env.DSH_BIND_HOST || (BIND_IP !== "127.0.0.1" ? BIND_IP : "127.0.0.1");

const server = http.createServer(async (clientReq, clientRes) => {
  const parsedUrl = new URL(clientReq.url, `http://${clientReq.headers.host || "127.0.0.1"}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

  // Preflight CORS para rutas satélite
  if (clientReq.method === "OPTIONS" && pathname.startsWith("/dsh-companion/")) {
    clientRes.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    clientRes.end();
    return;
  }

  // 1. Estado de conectividad para el cliente móvil
  if (pathname === "/dsh-companion/status" && clientReq.method === "GET") {
    let isDshActive = await probePort(TARGET_PORT, TARGET_HOST, 400);
    if (!isDshActive) {
      const candidatePorts = [52710, 52711, 52712, 57421];
      for (const p of candidatePorts) {
        if (p !== TARGET_PORT && (await probePort(p, TARGET_HOST, 250))) {
          updateTargetPort(p);
          isDshActive = true;
          break;
        }
      }
    }

    clientRes.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    clientRes.end(
      JSON.stringify({
        status: "online",
        dshOnline: isDshActive,
        dshTargetPort: TARGET_PORT,
        hostname: os.hostname(),
        platform: os.platform(),
        bunkerIp: FINAL_BIND_HOST,
        time: Date.now(),
      })
    );
    return;
  }

  // 2. Sincronización directa de conversaciones desde el móvil
  if (pathname === "/dsh-companion/sync" && clientReq.method === "POST") {
    let body = "";
    let bodySize = 0;
    const MAX_SYNC_BODY = 10 * 1024 * 1024; // Límite defensivo de 10MB

    clientReq.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_SYNC_BODY) {
        clientReq.destroy();
        if (!clientRes.headersSent) {
          clientRes.writeHead(413, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          clientRes.end(JSON.stringify({ error: "Payload demasiado grande" }));
        }
      } else {
        body += chunk;
      }
    });

    clientReq.on("end", () => {
      if (clientRes.headersSent) return;
      try {
        const data = JSON.parse(body);
        const { sessionTitle, messages } = data;
        if (!Array.isArray(messages) || messages.length === 0) {
          clientRes.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          clientRes.end(JSON.stringify({ error: "messages array is required and must not be empty" }));
          return;
        }

        if (!fs.existsSync(SYNC_DIR)) {
          fs.mkdirSync(SYNC_DIR, { recursive: true });
        }

        const now = Date.now();
        const dateObj = new Date(now);
        const dateIso = dateObj.toISOString();
        const dateFormatted = dateIso.replace(/[:.]/g, "-");
        const safeTitle = (sessionTitle || "chat-movil")
          .replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, "_")
          .slice(0, 40);

        const fileBase = `sync_${dateFormatted}_${safeTitle}`;
        const jsonFile = `${fileBase}.json`;
        const mdFile = `${fileBase}.md`;

        const jsonPayload = {
          id: fileBase,
          sessionTitle: sessionTitle || "Chat Satélite Móvil",
          syncedAt: dateIso,
          syncedTimestamp: now,
          messageCount: messages.length,
          messages: messages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content || ""),
            timestamp: m.timestamp || now,
          })),
        };

        fs.writeFileSync(path.join(SYNC_DIR, jsonFile), JSON.stringify(jsonPayload, null, 2), "utf8");

        const mdLines = [
          `# Sesión Sincronizada: ${sessionTitle || "Chat Satélite Móvil"}`,
          `- **Fecha de sincronización:** ${dateObj.toLocaleString("es-MX")}`,
          `- **Total de mensajes:** ${messages.length}`,
          `- **Identificador:** ${fileBase}`,
          ``,
          `---`,
          ``,
        ];

        for (const msg of jsonPayload.messages) {
          const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString("es-MX") : "";
          const roleHeader = msg.role === "user" ? "### 👤 Usuario" : "### 🤖 Asistente";
          mdLines.push(`${roleHeader} ${timeStr ? `(${timeStr})` : ""}\n`);
          mdLines.push(`${msg.content}\n`);
          mdLines.push(`---\n`);
        }

        fs.writeFileSync(path.join(SYNC_DIR, mdFile), mdLines.join("\n"), "utf8");

        const indexLine = JSON.stringify({
          id: fileBase,
          savedAt: now,
          title: sessionTitle || "Chat Satélite Móvil",
          count: messages.length,
          mdFile,
          jsonFile,
        }) + "\n";
        fs.appendFileSync(path.join(SYNC_DIR, "index.jsonl"), indexLine, "utf8");

        log(`Sincronización recibida: ${messages.length} mensajes guardados en ${mdFile}`);

        clientRes.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        clientRes.end(JSON.stringify({
          ok: true,
          syncedCount: messages.length,
          savedAt: now,
          file: mdFile,
        }));
      } catch (err) {
        log(`Error en /dsh-companion/sync: ${err.message}`);
        if (!clientRes.headersSent) {
          clientRes.writeHead(400, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          clientRes.end(JSON.stringify({ error: "Formato de sincronización inválido" }));
        }
      }
    });

    clientReq.on("error", (err) => {
      log(`Error en stream de sincronización: ${err.message}`);
      if (!clientRes.headersSent) {
        clientRes.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        clientRes.end(JSON.stringify({ error: "Fallo en transmisión de datos" }));
      }
    });
    return;
  }

  // 3. Consulta de archivos sincronizados
  if (pathname === "/dsh-companion/synced" && clientReq.method === "GET") {
    let chats = [];
    if (fs.existsSync(SYNC_DIR)) {
      chats = fs.readdirSync(SYNC_DIR)
        .filter((f) => f.endsWith(".md") && f.startsWith("sync_"))
        .sort()
        .reverse()
        .slice(0, 30);
    }
    clientRes.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    clientRes.end(JSON.stringify({ syncedFiles: chats }));
    return;
  }

  // 4. Servicio de interfaz Satélite Móvil PWA (/m, /offline y recursos)
  if (pathname === "/m" || pathname === "/offline") {
    const mPath = path.join(__dirname, "m.html");
    if (fs.existsSync(mPath)) {
      clientRes.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(mPath).pipe(clientRes);
      return;
    }
  }

  if (pathname === "/sw.js") {
    const swPath = path.join(__dirname, "sw.js");
    if (fs.existsSync(swPath)) {
      clientRes.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(swPath).pipe(clientRes);
      return;
    }
  }

  if (pathname === "/manifest.webmanifest") {
    const manifestPath = path.join(__dirname, "manifest.webmanifest");
    if (fs.existsSync(manifestPath)) {
      clientRes.writeHead(200, {
        "Content-Type": "application/manifest+json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      });
      fs.createReadStream(manifestPath).pipe(clientRes);
      return;
    }
  }

  if (pathname === "/icon.svg") {
    const iconPath = path.join(__dirname, "icon.svg");
    if (fs.existsSync(iconPath)) {
      clientRes.writeHead(200, {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      });
      fs.createReadStream(iconPath).pipe(clientRes);
      return;
    }
  }

  // 5. Proxy hacia el backend de DeepSeek Harness
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
    // Parche VULN-03: Solo escribe encabezados si no han sido enviados
    if (!clientRes.headersSent) {
      const acceptsHtml = (clientReq.headers["accept"] || "").includes("text/html");
      if (acceptsHtml && (pathname === "/" || pathname === "")) {
        clientRes.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
        clientRes.end(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DSH Búnker en Reposo</title>
  <style>
    body { background: #07080c; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #0f121a; border: 1px solid #1e2538; border-radius: 14px; padding: 28px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h2 { color: #00f0ff; margin-top: 0; font-size: 1.3rem; }
    p { color: #8b9bb4; font-size: 0.92rem; line-height: 1.5; margin: 12px 0; }
    .btn { display: inline-block; margin-top: 14px; padding: 11px 22px; background: linear-gradient(135deg, #00f0ff, #7928ca); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📡 Búnker DSH en Reposo</h2>
    <p>La PC está encendida pero DeepSeek Harness no está respondiendo en el puerto ${TARGET_PORT}.</p>
    <p>Puedes chatear en modo satélite desde tu celular con tu propia API Key:</p>
    <a class="btn" href="/m">Abrir DSH Satélite Móvil</a>
  </div>
</body>
</html>`);
      } else {
        clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        clientRes.end(`[DSH Bridge] Error al conectar con el backend (${TARGET_HOST}:${TARGET_PORT}): ${err.message}`);
      }
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
  log(`Modo Satélite disponible en: http://${FINAL_BIND_HOST}:${LISTEN_PORT}/m`);
});

server.on("error", (err) => {
  console.error(`[Error Fatal] No se pudo levantar el puerto ${FINAL_BIND_HOST}:${LISTEN_PORT}:`, err.message);
  process.exit(1);
});
