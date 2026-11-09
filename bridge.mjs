/**
 * DSH Mobile Companion Bridge - EDICION BLINDADA Y DE ALTA FIABILIDAD
 * Elaborado por: Ismael Munoz Reyes
 * Proyecto: DSH Mobile Companion / Tinta y Nodos
 */

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TARGET_HOST = "127.0.0.1";
let TARGET_PORT = parseInt(process.env.DSH_TARGET_PORT || "52710", 10);
const LISTEN_PORT = parseInt(process.env.DSH_LISTEN_PORT || "57420", 10);

const SYNC_DIR = path.join(process.cwd(), "synced_chats");

function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[DSH-Bridge ${ts}] ${msg}`);
}

function probePort(port, host = TARGET_HOST, timeout = 1200) {
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

function updateTargetPort(newPort) {
  if (newPort && newPort !== TARGET_PORT) {
    TARGET_PORT = newPort;
    log(`Puerto de destino actualizado hacia: ${TARGET_PORT}`);
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findVpnIp() {
  if (process.env.DSH_VPN_IP) {
    return { ip: process.env.DSH_VPN_IP, iface: "env" };
  }
  const ifaces = os.networkInterfaces();
  const isIpv4 = (a) => (a.family === "IPv4" || a.family === 4) && !a.internal && !a.address.startsWith("169.254.");

  // 1. Interfaces explicitas VPN
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/zerotier|tailscale|^zt|^ts|wireguard|^wg|openvpn/i.test(name) && addrs) {
      for (const a of addrs) {
        if (isIpv4(a)) return { ip: a.address, iface: name };
      }
    }
  }
  // 2. Tailscale CGNAT
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
  // 3. Subred ZeroTier tipica (10.x.x.x)
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
    throw new Error(`No se encontro el archivo de credenciales en ${credPath}`);
  }
  const content = fs.readFileSync(credPath, "utf8");
  const match = content.match(/client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]+)/);
  if (!match || !match[1]) {
    throw new Error("No se pudo extraer el secreto browser-session de .credentials.yaml");
  }
  return match[1].trim();
}

const rawSecret = loadSecret();
const secret = Buffer.from(rawSecret, "base64url");

let cachedAuthority = "";
let cachedCookie = "";
let cookieExpiresAt = 0;

function getAuthority() {
  return `${TARGET_HOST}:${TARGET_PORT}`;
}

function getValidCookie() {
  const currentAuthority = getAuthority();
  const now = Date.now();
  if (cachedCookie && now < cookieExpiresAt && cachedAuthority === currentAuthority) {
    return cachedCookie;
  }
  cachedAuthority = currentAuthority;
  const cookieHash = crypto.createHash("sha256").update(currentAuthority).digest().toString("base64url");
  const cookieName = `dsh-auth-${cookieHash}`;
  const issuedAt = now;
  const expiresAt = issuedAt + 7 * 24 * 3600 * 1000;
  const payload = { version: 1, authority: currentAuthority, issuedAt, expiresAt };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest().toString("base64url");
  cachedCookie = `${cookieName}=v1.${body}.${sig}`;
  cookieExpiresAt = expiresAt - 3600 * 1000;
  return cachedCookie;
}

function injectAuthHeaders(headers) {
  const currentAuthority = getAuthority();
  const newHeaders = { ...headers };
  newHeaders["host"] = currentAuthority;
  if (newHeaders["origin"]) newHeaders["origin"] = `http://${currentAuthority}`;
  if (newHeaders["referer"]) newHeaders["referer"] = `http://${currentAuthority}/`;

  const authCookie = getValidCookie();
  const cookieHash = crypto.createHash("sha256").update(currentAuthority).digest().toString("base64url");
  const cookieName = `dsh-auth-${cookieHash}`;

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
const FINAL_BIND_HOST = process.env.DSH_BIND_HOST || (BIND_IP !== "127.0.0.1" ? BIND_IP : "127.0.0.1");

const server = http.createServer(async (clientReq, clientRes) => {
  const reqUrl = new URL(clientReq.url, `http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  const pathname = reqUrl.pathname;

  // Estado de conectividad multi-bunker
  if (pathname === "/dsh-companion/status" && clientReq.method === "GET") {
    let isDshActive = await probePort(TARGET_PORT, TARGET_HOST, 1000);
    if (!isDshActive) {
      const candidatePorts = [52710, 52711, 52712, 57421];
      for (const p of candidatePorts) {
        if (p !== TARGET_PORT && (await probePort(p, TARGET_HOST, 400))) {
          updateTargetPort(p);
          isDshActive = true;
          break;
        }
      }
    }

    clientRes.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
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

  // Sincronizacion directa satelite -> bunker protegida contra XSS y Memory DoS
  if (pathname === "/dsh-companion/sync" && clientReq.method === "POST") {
    const MAX_SYNC_BODY = 10 * 1024 * 1024;
    const declaredLen = parseInt(clientReq.headers["content-length"] || "0", 10);

    if (declaredLen > MAX_SYNC_BODY) {
      clientRes.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
      clientRes.end(JSON.stringify({ error: "Payload excede el limite de 10 MB" }));
      clientReq.resume();
      return;
    }

    let body = "";
    let bodySize = 0;
    let aborted = false;

    clientReq.on("data", (chunk) => {
      if (aborted) return;
      bodySize += chunk.length;
      if (bodySize > MAX_SYNC_BODY) {
        aborted = true;
        if (!clientRes.headersSent) {
          clientRes.writeHead(413, { "Content-Type": "application/json; charset=utf-8" });
          clientRes.end(JSON.stringify({ error: "Payload excede el limite de 10 MB" }));
        }
        clientReq.pause();
        clientReq.destroy();
        return;
      }
      body += chunk;
    });

    clientReq.on("end", async () => {
      if (aborted || clientRes.headersSent) return;
      try {
        const data = JSON.parse(body);
        const { sessionTitle, messages } = data;
        if (!Array.isArray(messages) || messages.length === 0) {
          clientRes.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          clientRes.end(JSON.stringify({ error: "Array de mensajes requerido" }));
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

        // Sanitizacion contra Stored XSS en Markdown
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

        // Escritura asincrona no bloqueante
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

        clientRes.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        clientRes.end(JSON.stringify({ ok: true, syncedCount: cleanMessages.length, file: mdFile }));
      } catch (err) {
        if (!clientRes.headersSent) {
          clientRes.writeHead(400, { "Content-Type": "application/json" });
          clientRes.end(JSON.stringify({ error: "Formato de datos invalido" }));
        }
      }
    });
    return;
  }

  // Interfaz Satelite PWA
  if (pathname === "/m" || pathname === "/offline") {
    const htmlPath = path.join(process.cwd(), "m.html");
    if (fs.existsSync(htmlPath)) {
      clientRes.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(htmlPath).pipe(clientRes);
      return;
    }
  }

  if (pathname === "/sw.js") {
    const swPath = path.join(process.cwd(), "sw.js");
    if (fs.existsSync(swPath)) {
      clientRes.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Service-Worker-Allowed": "/",
      });
      fs.createReadStream(swPath).pipe(clientRes);
      return;
    }
  }

  if (pathname === "/manifest.webmanifest") {
    const manifestPath = path.join(process.cwd(), "manifest.webmanifest");
    if (fs.existsSync(manifestPath)) {
      clientRes.writeHead(200, { "Content-Type": "application/manifest+json; charset=utf-8" });
      fs.createReadStream(manifestPath).pipe(clientRes);
      return;
    }
  }

  if (pathname === "/icon.svg") {
    const iconPath = path.join(process.cwd(), "icon.svg");
    if (fs.existsSync(iconPath)) {
      clientRes.writeHead(200, { "Content-Type": "image/svg+xml" });
      fs.createReadStream(iconPath).pipe(clientRes);
      return;
    }
  }

  // Proxy inverso hacia DSH con TCP Keep-Alive y cancelacion de request zombi
  clientReq.socket.setKeepAlive(true, 15000);
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

  // Mata peticion zombi en DSH si el movil se desconecta
  clientRes.on("close", () => {
    if (!proxyReq.destroyed) proxyReq.destroy();
  });

  proxyReq.on("error", (err) => {
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

// Tunel WebSocket blindado contra Sockets Zombis
server.on("upgrade", (clientReq, clientSocket, clientHead) => {
  clientSocket.pause();
  clientSocket.setKeepAlive(true, 15000);

  const targetHeaders = injectAuthHeaders(clientReq.headers);
  const targetSocket = net.connect({ host: TARGET_HOST, port: TARGET_PORT });

  targetSocket.setTimeout(8000);
  targetSocket.on("timeout", () => {
    targetSocket.destroy(new Error("Timeout conectando con DSH"));
  });

  const cleanup = () => {
    if (!clientSocket.destroyed) clientSocket.destroy();
    if (!targetSocket.destroyed) targetSocket.destroy();
  };

  clientSocket.on("close", cleanup);
  clientSocket.on("end", cleanup);
  clientSocket.on("error", cleanup);

  targetSocket.on("close", cleanup);
  targetSocket.on("end", cleanup);
  targetSocket.on("error", (err) => {
    log(`Error en tunel WebSocket: ${err.message}`);
    if (clientSocket.writable) {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
    cleanup();
  });

  targetSocket.on("connect", () => {
    targetSocket.setTimeout(0);
    targetSocket.setKeepAlive(true, 15000);

    let reqRaw = `${clientReq.method} ${clientReq.url} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(targetHeaders)) {
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
});

server.listen(LISTEN_PORT, FINAL_BIND_HOST, () => {
  log(`Tinta y Nodos - DSH Mobile Companion ACTIVO (Edicion Blindada)`);
  log(`Interfaz VPN detectada: ${iface} (${BIND_IP})`);
  log(`Escuchando estrictamente en: http://${FINAL_BIND_HOST}:${LISTEN_PORT}`);
  log(`Redirigiendo de forma segura hacia: http://${getAuthority()}`);
});

server.on("error", (err) => {
  console.error(`[Error Fatal] No se pudo levantar el puerto ${FINAL_BIND_HOST}:${LISTEN_PORT}:`, err.message);
  process.exit(1);
});
