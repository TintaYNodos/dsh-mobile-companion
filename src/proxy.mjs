import http from "node:http";
import net from "node:net";
import { injectAuthHeaders, getAuthority } from "./crypto.mjs";
import { log } from "./network.mjs";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
]);

function sanitizeHeaders(headers) {
  const clean = {};
  for (const [key, val] of Object.entries(headers)) {
    const safeKey = key.replace(/[\r\n]/g, "").trim().toLowerCase();
    if (!safeKey || HOP_BY_HOP.has(safeKey)) continue;

    if (Array.isArray(val)) {
      clean[safeKey] = val.map((item) => String(item).replace(/[\r\n]/g, ""));
    } else if (val !== undefined) {
      clean[safeKey] = String(val).replace(/[\r\n]/g, "");
    }
  }
  return clean;
}

export function handleHttpProxy(clientReq, clientRes, targetHost, targetPort) {
  clientReq.socket.setKeepAlive(true, 15_000);
  const authority = getAuthority(targetHost, targetPort);
  const targetHeaders = sanitizeHeaders(injectAuthHeaders(clientReq.headers, authority));

  let proxyReq;
  try {
    proxyReq = http.request(
      {
        hostname: targetHost,
        port: targetPort,
        path: clientReq.url,
        method: clientReq.method,
        headers: targetHeaders,
        timeout: 60_000,
      },
      (proxyRes) => {
        const isSSE = (proxyRes.headers["content-type"] || "").includes("text/event-stream");
        const socketTimeout = isSSE ? 300_000 : 60_000;

        if (proxyRes.socket) {
          proxyRes.socket.setNoDelay(true);
          proxyRes.socket.setTimeout(socketTimeout);
        }
        if (clientRes.socket) {
          clientRes.socket.setNoDelay(true);
          clientRes.socket.setTimeout(socketTimeout);
        }

        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
      }
    );
  } catch (err) {
    if (!clientRes.headersSent) {
      clientRes.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      clientRes.end(`[DSH Bridge] Peticion proxy invalida: ${err.message}`);
    }
    return;
  }

  const abortProxy = () => {
    if (proxyReq && !proxyReq.destroyed) proxyReq.destroy();
  };

  clientRes.on("close", abortProxy);
  clientReq.on("error", abortProxy);

  proxyReq.on("timeout", () => {
    proxyReq.destroy(new Error("Timeout en comunicacion con backend DSH"));
  });

  proxyReq.on("error", (err) => {
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      clientRes.end(`[DSH Bridge] Backend no disponible (${targetHost}:${targetPort}): ${err.message}`);
    } else {
      clientRes.destroy();
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}

export function handleWsProxy(clientReq, clientSocket, clientHead, targetHost, targetPort) {
  clientSocket.pause();
  clientSocket.setKeepAlive(true, 15_000);
  clientSocket.setNoDelay(true);

  const safeMethod = String(clientReq.method || "GET").replace(/[^A-Z]/g, "");
  const safeUrl = String(clientReq.url || "/").replace(/[\r\n]/g, "");

  const authority = getAuthority(targetHost, targetPort);
  const targetHeaders = injectAuthHeaders(clientReq.headers, authority);
  const targetSocket = net.connect({ host: targetHost, port: targetPort });

  targetSocket.setTimeout(8_000);
  targetSocket.on("timeout", () => {
    targetSocket.destroy(new Error("Timeout conectando tunel WebSocket con DSH"));
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
    log(`Tunel WebSocket cerrado por error: ${err.message}`);
    if (clientSocket.writable) {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
    cleanup();
  });

  targetSocket.on("connect", () => {
    targetSocket.setTimeout(120_000);
    clientSocket.setTimeout(120_000);
    targetSocket.setKeepAlive(true, 15_000);
    targetSocket.setNoDelay(true);

    let reqRaw = `${safeMethod} ${safeUrl} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(targetHeaders)) {
      const cleanKey = String(key).replace(/[^a-zA-Z0-9_-]/g, "");
      if (!cleanKey) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (v !== undefined) {
          const cleanVal = String(v).replace(/[\r\n]/g, "");
          reqRaw += `${cleanKey}: ${cleanVal}\r\n`;
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
}
