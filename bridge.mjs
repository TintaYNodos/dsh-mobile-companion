/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "./src/config.mjs";
import { log, sanitizeLogMessage, warn, rotateBridgeLog } from "./src/log.mjs";
import { findVpnAddress, isClientAuthorized, resolveTargetPort } from "./src/network.mjs";
import { hasValidAccessKey, loadSecret, resolveAccessKey } from "./src/crypto.mjs";
import { deviceLabel, deviceSummary, findPairedDevice, isViewer, runWithRequestContext } from "./src/devices.mjs";
import { focusPanelWindow, isPanelTabOpen, notifyPanelClients, panelUrl, startPanel } from "./src/panel.mjs";
import { hasProxyHeaders, isSameOriginRequest, sendText } from "./src/http.mjs";
import { startContractWatch } from "./src/dsh-contract.mjs";
import { handleWsProxy } from "./src/proxy.mjs";
import { buildAllowedSets, dispatchRequest } from "./src/routes.mjs";

/**
 * P25: bridge.log lo escribe la redireccion de run-hidden.vbs y crecia sin
 * limite. Se rota aqui, antes de la primera linea de log del proceso, y
 * src/log.mjs resuelve el caso de Windows en el que cmd.exe mantiene
 * bridge.log abierto mientras corre node (el `rename` desde dentro da EBUSY):
 * copia a bridge.log.1 y sigue escribiendo sobre el archivo ya abierto.
 *
 * Ademas esta llamada deja instalada la rotacion EN CALIENTE (5.1.5): a partir
 * de aqui src/log.mjs revisa el tamano en cada escritura (y cada 30 s como red
 * de seguridad) y rota cuando se alcanza DSH_LOG_MAX_MB, conservando
 * DSH_LOG_KEEP archivos rotados. Antes solo se rotaba al arrancar y un puente de
 * semanas llenaba el disco.
 */
const bridgeDir = path.dirname(fileURLToPath(import.meta.url));
// H-17: el log se puede redirigir (tests y despliegues) con DSH_LOG_FILE; por
// defecto sigue siendo bridge.log junto a este archivo.
const rotation = rotateBridgeLog(config.logFile);
if (rotation.rotated && rotation.mode === "rename") {
  // Sin redireccion el aviso va a la consola: no hay archivo nuevo que recibirlo.
  console.log(`[bridge] bridge.log rotado a bridge.log.1 (${rotation.bytes} bytes)`);
} else if (!rotation.rotated && rotation.error) {
  warn(
    "bridge",
    `bridge.log (${rotation.bytes} bytes) no se pudo rotar: ${rotation.error}. Se seguira escribiendo en el archivo actual.`
  );
}

let binding = findVpnAddress();
let bindHost = binding.address;

if (bindHost === "0.0.0.0") {
  console.error("Enlace en 0.0.0.0 rechazado por politica de seguridad.");
  process.exit(1);
}

/**
 * P48: la configuracion de acceso se valida ANTES de crear o enlazar el
 * servidor. Antes `resolveAccessKey()` se llamaba dentro del callback de
 * `listen`, asi que el error de DSH_ACCESS_DISABLE saltaba con el puerto ya
 * abierto y como excepcion no capturada (traza completa). Ahora se sale con un
 * mensaje legible y codigo 1.
 */
let accessKey = "";
try {
  accessKey = resolveAccessKey();
} catch (error) {
  console.error(`DSH Companion no puede arrancar: ${error?.message || error}`);
  console.error(
    "Revise DSH_ACCESS_DISABLE (solo se permite con el puente enlazado a 127.0.0.1), DSH_ACCESS_KEY o el adaptador de red."
  );
  process.exit(1);
}
const accessKeyOn = accessKey.length > 0;

let bindPrefix = binding.prefix ?? 24;
// H-02: mismos conjuntos en el arranque y en cada cambio de IP (ver
// buildAllowedSets en routes.mjs: reañade siempre los alias de loopback).
let { allowedOrigins, allowedHosts } = buildAllowedSets(bindHost, config.listenPort);

const REALM = 'Basic realm="DSH Companion", charset="UTF-8"';

let lastPanelOpen = 0;
const openPanelWindow = ({ force = false } = {}) => {
  const now = Date.now();

  // Si ya hay una pestaña del panel abierta en el navegador:
  // NO abrir pestañas adicionales. Actualizar la existente y enfocarla en Windows.
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

const routeContext = {};
const refreshRouteContext = () => {
  routeContext.bindHost = bindHost;
  routeContext.bindPrefix = bindPrefix;
  routeContext.allowedOrigins = allowedOrigins;
  routeContext.allowedHosts = allowedHosts;
  routeContext.openPanelWindow = openPanelWindow;
};
refreshRouteContext();

/**
 * P42: cada peticion se atiende dentro de un AsyncLocalStorage con su req/res.
 * devices.mjs lo usa para leer la cookie de canje y emitir la Set-Cookie de la
 * solicitud sin cambiar las firmas de las rutas existentes.
 */
const handleRequest = (req, res) => {
  runWithRequestContext(req, res, () => dispatchRequest(req, res, routeContext)).catch((error) => {
    warn("bridge", `Peticion fallida: ${sanitizeLogMessage(error?.message || error)}`);
    if (!res.headersSent) sendText(res, 500, "Fallo interno del puente");
    else if (!res.destroyed) res.destroy();
  });
};

const server = http.createServer(handleRequest);

server.headersTimeout = config.headersTimeoutMs;
server.requestTimeout = config.requestTimeoutMs;
server.keepAliveTimeout = config.keepAliveTimeoutMs;
server.maxConnections = config.maxConnections;

server.on("upgrade", (req, socket, head) => {
  const remote = String(socket.remoteAddress || "");
  if (!isClientAuthorized(socket.remoteAddress, bindHost, bindPrefix)) {
    log("ws", `rechazado por red: ${remote}`);
    socket.destroy();
    return;
  }

  // H1: detras de un proxy el socket tambien es loopback. Ahi la confianza
  // local no vale: hace falta credencial verificable aunque DSH_ACCESS_DISABLE
  // haya apagado la clave para el equipo local. El flag solo deja pasar la
  // guarda de red, no eleva privilegios.
  const proxyHeaders = hasProxyHeaders(req);
  const device = findPairedDevice(req);
  const keyAuthorized = accessKeyOn && hasValidAccessKey(req);
  const authorized = Boolean(device) || keyAuthorized || (!proxyHeaders && !accessKeyOn);
  if (!authorized) {
    log("ws", `rechazado sin credencial valida: ${remote}`);
    socket.end("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: " + REALM + "\r\nConnection: close\r\n\r\n");
    return;
  }

  // H2: un dispositivo `viewer` no abre el tunel. El canal transporta tambien
  // llamadas unarias y respuestas de aprobacion, no solo eventos: no se puede
  // garantizar que sea de solo lectura, asi que se rechaza el upgrade entero.
  if (device && isViewer(device)) {
    log("ws", `upgrade rechazado para ${deviceLabel(device)} (solo lectura): ${remote}`);
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
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
  if (!trustedOrigin) {
    log("ws", `origen no confiable (${req.headers.origin || "sin Origin"}) desde ${remote}`);
  }

  resolveTargetPort()
    .then((targetPort) => {
      log("ws", `tunel ${url.pathname} -> ${config.targetHost}:${targetPort} para ${remote}`);
      handleWsProxy(req, socket, head, { targetPort, originAllowed: trustedOrigin });
    })
    .catch((error) => {
      log("ws", `sin puerto de destino: ${error.message}`);
      socket.destroy();
    });
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


/**
 * Reparacion en caliente del enlace.
 *
 * Al iniciar sesion en Windows el tunel (ZeroTier/Tailscale) muchas veces aun
 * no tiene direccion, asi que findVpnAddress() devolvia loopback y el puente se
 * quedaba ahi: el telefono no llegaba hasta reiniciarlo a mano. Cada 15 s se
 * vuelve a mirar la interfaz y, si cambia la IP privada, se reenlaza solo.
 */
const watchBinding = () => {
  if (String(process.env.DSH_BIND_HOST || "").trim()) return;
  const timer = setInterval(() => {
    let next;
    try { next = findVpnAddress(); } catch { return; }
    if (!next || !next.address || next.address === "0.0.0.0" || next.address === bindHost) return;
    const previous = bindHost;
    binding = next;
    bindHost = next.address;
    bindPrefix = next.prefix ?? 24;
    // H-02: al reenlazar se reconstruyen los conjuntos CON los alias de
    // loopback; antes se perdian y 127.0.0.1/localhost/[::1] recibian 403.
    ({ allowedOrigins, allowedHosts } = buildAllowedSets(bindHost, config.listenPort));
    refreshRouteContext();
    log("bridge", `La IP privada cambio: ${previous} -> ${bindHost} (${next.iface}); reenlazando`);
    server.close(() => {
      server.listen(config.listenPort, bindHost, () => {
        log("bridge", `Activo de nuevo en http://${bindHost}:${config.listenPort}`);
        ensureLoopbackServer();
      });
    });
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  }, 15_000);
  timer.unref();
};


startPanel();
void resolveTargetPort(true);
// 5.2.0: comprueba al arrancar (y cada 10 min) las piezas internas de Harness de
// las que depende el puente. Si alguna cambia, degrada solo su funcion con un
// aviso claro en bridge.log en vez de fallar en silencio.
startContractWatch();
watchBinding();

server.listen(config.listenPort, bindHost, () => {
  log("bridge", `DSH Companion ${config.version} activo`);
  log("bridge", `Interfaz ${binding.iface} -> http://${bindHost}:${config.listenPort}`);
  log("bridge", `Backend DeepSeek Harness en ${config.targetHost}:${config.targetPort}`);

  if (accessKeyOn) {
    log("bridge", `Dispositivos autorizados: ${deviceSummary().length}`);
    // Nunca la clave completa: este log acaba en copias de soporte y respaldos.
    log("bridge", `Clave manual de respaldo: ****${accessKey.slice(-4)}`);
  } else {
    warn("bridge", "Clave de acceso desactivada por DSH_ACCESS_DISABLE=1");
    warn("bridge", "Cualquier dispositivo de la red privada puede abrir esta sesion");
  }

  if (!config.companionToken) {
    warn("bridge", "Sin DSH_COMPANION_TOKEN: /dsh-companion/sync queda protegido solo por la clave de acceso");
  }
});

let loopbackServer = null;
const ensureLoopbackServer = () => {
  if (bindHost.startsWith("127.") || loopbackServer) return;
  loopbackServer = http.createServer(handleRequest);
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
    log("bridge", `Acceso local en http://127.0.0.1:${config.listenPort}`);
  });
};
ensureLoopbackServer();
/**
 * M1/H-06: en Windows `child.kill("SIGTERM")` del supervisor no ejecuta el
 * handler (Windows no tiene senales POSIX). `stop.bat` escribe la bandera
 * `companion.stop` junto al puente; aqui se vigila y, al aparecer, se cierran
 * los servidores y se sale con codigo 0 (cierre ordenado). SIGINT/SIGTERM se
 * conservan para Linux/macOS. `DSH_STOP_FLAG` permite apuntar la bandera a otro
 * archivo (tests aislados) sin tocar la instalacion real.
 */
const stopFlagPath = process.env.DSH_STOP_FLAG
  ? path.resolve(process.env.DSH_STOP_FLAG)
  : path.join(bridgeDir, "companion.stop");
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log("bridge", `Cerrando por ${signal}`);
  server.close(() => process.exit(0));
  // Un cierre ordenado no debe esperar a que el telefono suelte el WebSocket:
  // con conexiones vivas, server.close() no llama al callback hasta que mueren
  // y stop.bat acababa forzando. Se cortan aqui y el proceso sale en <1 s.
  if (typeof server.closeAllConnections === "function") server.closeAllConnections();
  if (loopbackServer) {
    loopbackServer.close();
    if (typeof loopbackServer.closeAllConnections === "function") loopbackServer.closeAllConnections();
  }
  setTimeout(() => process.exit(0), 3000).unref();
};

const stopFlagStartedAt = Date.now();
const stopTimer = setInterval(() => {
  if (shuttingDown) return;
  let flag;
  try {
    flag = fs.statSync(stopFlagPath);
  } catch {
    return;
  }
  // Una bandera de un arranque anterior (stop interrumpido) no debe apagar el
  // puente recien arrancado: solo se obedece la que se creo DESPUES de empezar.
  if (flag.mtimeMs < stopFlagStartedAt) return;
  clearInterval(stopTimer);
  shutdown("bandera companion.stop");
}, 250);
stopTimer.unref();

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => warn("bridge", `Promesa rechazada: ${reason}`));

// Una excepcion no controlada deja el estado del proceso en duda: se registra y
// se sale con codigo 1 para que el supervisor (run-hidden.vbs) lo levante de
// nuevo en vez de dejar el telefono incomunicado.
process.on("uncaughtException", (error) => {
  warn("bridge", `Excepcion no controlada: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
