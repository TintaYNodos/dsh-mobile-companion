/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import net from "node:net";
import { config } from "./config.mjs";
import { injectSessionHeaders, getAuthority } from "./crypto.mjs";
import { scrubHeaders } from "./http.mjs";
import { invalidateTargetPort } from "./network.mjs";
import { log } from "./log.mjs";

const activeSockets = new Set();

export function terminateAllWsConnections() {
  const count = activeSockets.size;
  for (const s of activeSockets) {
    try { s.destroy(); } catch {}
  }
  activeSockets.clear();
  return count;
}

export function handleWsProxy(req, socket, head, { targetPort, originAllowed }) {
  activeSockets.add(socket);
  socket.pause();
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 15_000);

  if (!originAllowed) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    return;
  }

  const method = String(req.method || "GET").replace(/[^A-Z]/g, "") || "GET";
  const path = String(req.url || "/").replace(/[\r\n]/g, "");
  const authority = getAuthority(config.targetHost, targetPort);

  const target = net.connect({ host: config.targetHost, port: targetPort });
  let handshakeTimer = null;
  let closing = false;
  let destroyed = false;

  const hardClose = () => {
    activeSockets.delete(socket);
    if (destroyed) return;
    destroyed = true;
    if (handshakeTimer) clearTimeout(handshakeTimer);
    socket.destroy();
    target.destroy();
  };

  const softClose = () => {
    if (closing) return;
    closing = true;
    if (handshakeTimer) clearTimeout(handshakeTimer);
    if (!socket.destroyed) socket.end();
    if (!target.destroyed) target.end();
    const kill = setTimeout(hardClose, 1500);
    kill.unref?.();
  };

  socket.on("close", hardClose);
  socket.on("error", hardClose);
  socket.on("end", softClose);
  target.on("close", hardClose);
  target.on("end", softClose);

  target.setTimeout(config.connectTimeoutMs);
  target.on("timeout", () => {
    target.destroy(Object.assign(new Error("Tiempo de conexion agotado"), { code: "ETIMEDOUT" }));
  });

  target.on("error", (error) => {
    log("ws", `Tunel cerrado: ${error.code || error.message}`);
    if (error.code === "ECONNREFUSED" || error.code === "ECONNRESET") {
      invalidateTargetPort();
    }
    if (socket.writable && !closing && !destroyed) {
      socket.write("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      softClose();
      return;
    }
    hardClose();
  });

  target.on("connect", () => {
    target.setTimeout(0);
    target.setKeepAlive(true, 15_000);
    target.setNoDelay(true);

    handshakeTimer = setTimeout(() => {
      if (destroyed || closing) return;
      if (socket.writable) {
        socket.write("HTTP/1.1 504 Gateway Timeout\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      }
      softClose();
    }, 15_000);
    handshakeTimer.unref?.();
    target.once("data", () => {
      if (handshakeTimer) clearTimeout(handshakeTimer);
    });

    let outgoing;
    try {
      outgoing = injectSessionHeaders(scrubHeaders(req.headers), authority);
      outgoing.upgrade = "websocket";
      outgoing.connection = "Upgrade";
    } catch (error) {
      log("ws", `Sesion no disponible: ${error.message}`);
      if (socket.writable) {
        socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      }
      softClose();
      return;
    }

    const lines = [`${method} ${path} HTTP/1.1`];
    for (const [key, value] of Object.entries(outgoing)) {
      const name = String(key).replace(/[^a-zA-Z0-9-]/g, "");
      if (!name) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const entry of values) {
        if (entry === undefined) continue;
        lines.push(`${name}: ${String(entry).replace(/[\r\n]/g, "")}`);
      }
    }
    lines.push("", "");

    target.write(lines.join("\r\n"));
    if (head && head.length) target.write(head);

    socket.pipe(target, { end: true });
    target.pipe(socket, { end: true });
    socket.resume();
  });
}
