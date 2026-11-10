import http from "node:http";
import net from "node:net";
import { injectAuthHeaders, getAuthority } from "./crypto.mjs";
import { log } from "./network.mjs";

export function handleHttpProxy(clientReq, clientRes, TARGET_HOST, TARGET_PORT) {
  clientReq.socket.setKeepAlive(true, 15000);
  const targetHeaders = injectAuthHeaders(clientReq.headers, getAuthority(TARGET_HOST, TARGET_PORT));

  const proxyReq = http.request(
    {
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path: clientReq.url,
      method: clientReq.method,
      headers: targetHeaders,
    },
    (proxyRes) => {
      // Optimizacion: deshabilita timeout y setNoDelay para SSE/streaming
      if (proxyRes.socket) {
        proxyRes.socket.setNoDelay(true);
        proxyRes.socket.setTimeout(0);
      }
      if (clientRes.socket) {
        clientRes.socket.setNoDelay(true);
        clientRes.socket.setTimeout(0);
      }

      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

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
}

export function handleWsProxy(clientReq, clientSocket, clientHead, TARGET_HOST, TARGET_PORT) {
  clientSocket.pause();
  clientSocket.setKeepAlive(true, 15000);
  clientSocket.setNoDelay(true);

  const targetHeaders = injectAuthHeaders(clientReq.headers, getAuthority(TARGET_HOST, TARGET_PORT));
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
    targetSocket.setNoDelay(true);

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
}
