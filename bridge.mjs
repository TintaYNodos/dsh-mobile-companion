/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael MuÃ±oz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1) / PolyForm Noncommercial 1.0.0.
 * See companion/LICENSE or LICENSE for license terms.
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { config } from "./src/config.mjs";
import { log, warn } from "./src/log.mjs";
import { findVpnAddress, isClientAuthorized, resolveTargetPort } from "./src/network.mjs";
import { accessKeyEnabled, hasValidAccessKey, loadSecret, resolveAccessKey } from "./src/crypto.mjs";
import { deviceSummary, findPairedDevice } from "./src/devices.mjs";
import { focusPanelWindow, isPanelTabOpen, notifyPanelClients, panelUrl, startPanel } from "./src/panel.mjs";
import { isSameOriginRequest, sendText } from "./src/http.mjs";
import { handleWsProxy } from "./src/proxy.mjs";
import { dispatchRequest } from "./src/routes.mjs";

const binding = findVpnAddress();
const bindHost = binding.address;

if (bindHost === "0.0.0.0") {
  console.error("Enlace en 0.0.0.0 rechazado por politica de seguridad.");
  process.exit(1);
}

const bindPrefix = binding.prefix ?? 24;
const allowedOrigins = new Set([`http://${bindHost}:${config.listenPort}`]);
const allowedHosts = new Set([`${bindHost}:${config.listenPort}`]);

for (const alias of ["127.0.0.1", "localhost", "[::1]"]) {
  allowedOrigins.add(`http://${alias}:${config.listenPort}`);
  allowedHosts.add(`${alias}:${config.listenPort}`);
}

const REALM = 'Basic realm="DSH Companion", charset="UTF-8"';

let lastPanelOpen = 0;
const openPanelWindow = ({ force = false } = {}) => {
  const now = Date.now();

  // Si ya hay una pestaÃ±a del panel abierta en el navegador:
  // NO abrir pestaÃ±as adicionales. Actualizar la existente y enfocarla en Windows.
  if (isPanelTabOpen()) {
    notifyPanelClients();
    focusPanelWindow();
    return true;
  }

  if (!force && now - lastPanelOpen < 30_000) return false;
  lastPanelOpen = now;
  if (process.platform !== "win32") return false;
  try {
    spawn("cmd", ["/c", "start", "", panelUrl()], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
};

const routeContext = {
  bindHost,
  bindPrefix,
  allowedOrigins,
  allowedHosts,
  openPanelWindow,
};

const server = http.createServer((req, res) => {
  dispatchRequest(req, res, routeContext).catch((error) => {
    warn("bridge", `Peticion fallida: ${error.message}`);
    if (!res.headersSent) sendText(res, 500, "Fallo interno del puente");
    else if (!res.destroyed) res.destroy();
  });
});

server.headersTimeout = config.headersTimeoutMs;
server.requestTimeout = config.requestTimeoutMs;
server.keepAliveTimeout = config.keepAliveTimeoutMs;
server.maxConnections = config.maxConnections;

server.on("upgrade", (req, socket, head) => {
  if (!isClientAuthorized(socket.remoteAddress, bindHost, bindPrefix)) {
    socket.destroy();
    return;
  }

  if (accessKeyEnabled() && !hasValidAccessKey(req) && !findPairedDevice(req)) {
    socket.end("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: " + REALM + "\r\nConnection: close\r\n\r\n");
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${bindHost}:${config.listenPort}`);
  } catch {
    socket.destroy();
    return;
  }

  const trustedOrigin = isSameOriginRequest(req, allowedOrigins, allowedHosts);

  resolveTargetPort()
    .then((targetPort) => {
      handleWsProxy(req, socket, head, { targetPort, originAllowed: trustedOrigin });
    })
    .catch(() => socket.destroy());
});

server.on("clientError", (error, socket) => {
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  try {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  } catch {
    socket.destroy();
  }
});

server.on("error", (error) => {
  console.error(`No se pudo enlazar ${bindHost}:${config.listenPort}: ${error.message}`);
  process.exit(1);
});

try {
  loadSecret();
} catch (error) {
  console.error(`No se pudo cargar el secreto de sesion: ${error.message}`);
  process.exit(1);
}

startPanel();
void resolveTargetPort(true);

server.listen(config.listenPort, bindHost, () => {
  log("bridge", `DSH Companion ${config.version} activo`);
  log("bridge", `Interfaz ${binding.iface} -> http://${bindHost}:${config.listenPort}`);
  log("bridge", `Backend DeepSeek Harness en ${config.targetHost}:${config.targetPort}`);

  if (accessKeyEnabled()) {
    log("bridge", `Dispositivos autorizados: ${deviceSummary().length}`);
    log("bridge", `Clave manual de respaldo: ${resolveAccessKey()}`);
  } else {
    warn("bridge", "Clave de acceso desactivada por DSH_ACCESS_DISABLE=1");
    warn("bridge", "Cualquier dispositivo de la red privada puede abrir esta sesion");
  }

  if (!config.companionToken) {
    warn("bridge", "Sin DSH_COMPANION_TOKEN: /dsh-companion/sync queda protegido solo por la clave de acceso");
  }
});

let loopbackServer = null;
if (!bindHost.startsWith("127.")) {
  loopbackServer = http.createServer((req, res) => {
    dispatchRequest(req, res, routeContext).catch((error) => {
      warn("bridge", `Peticion fallida: ${error.message}`);
      if (!res.headersSent) sendText(res, 500, "Fallo interno del puente");
      else if (!res.destroyed) res.destroy();
    });
  });

  loopbackServer.headersTimeout = config.headersTimeoutMs;
  loopbackServer.requestTimeout = config.requestTimeoutMs;
  loopbackServer.keepAliveTimeout = config.keepAliveTimeoutMs;
  loopbackServer.maxConnections = config.maxConnections;

  loopbackServer.on("upgrade", (req, socket, head) => {
    server.emit("upgrade", req, socket, head);
  });

  loopbackServer.on("error", (error) => {
    warn("bridge", `No se pudo enlazar loopback 127.0.0.1:${config.listenPort}: ${error.message}`);
  });

  loopbackServer.listen(config.listenPort, "127.0.0.1", () => {
    log("bridge", `Loopback local activo en http://127.0.0.1:${config.listenPort}`);
  });
}

const shutdown = (signal) => {
  log("bridge", `Cerrando por ${signal}`);
  server.close(() => process.exit(0));
  if (loopbackServer) loopbackServer.close();
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => warn("bridge", `Promesa rechazada: ${reason}`));
