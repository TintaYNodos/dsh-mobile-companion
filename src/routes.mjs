/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import { config } from "./config.mjs";
import { isClientAuthorized, normalizeAddress, probePort } from "./network.mjs";
import { hasValidAccessKey } from "./crypto.mjs";
import {
  findPairedDevice,
  isViewer,
  logReadOnlyRejection,
  pendingRequests,
  requestAccess,
  resolveTargetPortForDevice,
  sendReadOnly,
  touchDevice,
} from "./devices.mjs";
import { hasAmbiguousFraming, isSameOriginRequest, readBody, sendJson, sendText } from "./http.mjs";
import { isPanelTabOpen } from "./panel.mjs";
import { handlePairingRoutes, handlePendingApprovalGate, resolveDevice } from "./routes-pairing.mjs";
import { handleHttpProxy } from "./proxy.mjs";
import { handleDataRoutes } from "./routes-data.mjs";
import { hasStaticRoute, serveStatic, apkSha256 } from "./static.mjs";
import { consumeAllowance } from "./ratelimit.mjs";
import { collectSystemStats, telemetryHistory } from "./system-stats.mjs";
import { emitTestEvent, handlePcEvents, startPcWatcher } from "./pc-events.mjs";
import { contractSnapshot } from "./dsh-contract.mjs";
import { handleHealthz } from "./healthz.mjs";

/**
 * Cabeceras que delatan que la peticion llego a traves de un proxy o tunel
 * (Cloudflare, nginx, etc.). Cuando estan presentes, el `remoteAddress` es el
 * del proxy (loopback), no el del cliente: la pertenencia a loopback deja de
 * ser una identidad y NUNCA debe conceder privilegios locales (ver
 * `DSH_ALLOW_PROXY_ACCESS` en src/config.mjs). El flag solo permite pasar la
 * guarda de red; no eleva privilegios.
 */
const PROXY_SIGNAL_HEADERS = [
  "cf-connecting-ip",
  "cf-access-jwt-assertion",
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
];

export const hasProxyHeaders = (req) =>
  PROXY_SIGNAL_HEADERS.some((name) => String(req?.headers?.[name] ?? "").trim() !== "");

/** Loopback real: la conexion viene del propio equipo, no de un proxy delante. */
export const isTrustedLoopbackRequest = (req, remoteAddress) =>
  !hasProxyHeaders(req) && normalizeAddress(remoteAddress).startsWith("127.");

export const wantsMobileShell = (req, url) => {
  if (url.searchParams.get("dshc") === "off") return false;
  if (url.searchParams.get("dshc") === "on") return true;
  return /android|iphone|ipad|ipod|mobile|harmonyos/i.test(String(req.headers["user-agent"] || ""));
};

export const buildStatusPayload = async (options = {}) => {
  const includePendingList = options.includePendingList === true;
  // Perfil por dispositivo: el estado informa el backend que ese dispositivo
  // usaria de verdad, no solo el backend por defecto del puente.
  const targetPort = await resolveTargetPortForDevice(options.device || null);
  const dshOnline = await probePort(targetPort, config.targetHost, 400);
  const pending = pendingRequests();
  return {
    service: "dsh-companion",
    version: config.version,
    apkVersion: config.apkVersion || config.version,
    apkVersionCode: config.apkVersionCode || 14,
    apkSha256: apkSha256(),
    previousApkVersion: config.previousApkVersion || "3.9.2",
    previousApkVersionCode: config.previousApkVersionCode || 13,
    status: "online",
    dshOnline,
    targetPort,
    pendingDevices: pending.length,
    // P16: el telefono no necesita la lista de pendientes (ids, codigos, IPs y
    // user-agents de otros equipos). Solo se entrega al panel local.
    ...(includePendingList ? { pendingList: pending } : {}),
    systemStats: collectSystemStats(),
    // 5.2.0: estado del contrato interno con Harness. El cliente autorizado ve
    // que piezas se comprobaron y cuales estan degradadas; nunca hay secretos.
    contract: contractSnapshot(),
    time: Date.now(),
  };
};

/**
 * P6: estado de los sondeos de /status sin credencial.
 *
 * El telefono sondea mientras espera aprobacion. La solicitud se conserva
 * porque es el flujo de emparejamiento, pero no se abre una ventana del panel
 * en cada sondeo: se abre a lo sumo una vez por IP y nunca si ya hay una
 * pestana del panel abierta. La solicitud pendiente se reutiliza (requestAccess
 * ya devuelve la existente para la misma IP); aqui solo se cuenta el intento.
 */
const pairingPolls = new Map();
// La ventana del panel se recuerda por IP (P6: una sola vez por equipo), pero el
// estado del sondeo se separa por IP + user-agent: dos clientes tras la misma IP
// (NAT, pruebas en loopback) no deben compartir la solicitud cacheada.
const pairingPanelOpened = new Map();
const PAIRING_POLL_TTL_MS = 30 * 60 * 1000;
// H6: `requestAccess` persiste el registro con fsync. Un sondeo anonimo a
// /status no puede reescribirlo cada 2 segundos (desgaste del disco y latencia):
// `requestedAt` se refresca en memoria en cada sondeo y se persiste como mucho
// una vez por minuto. El primer sondeo si escribe, porque requestAccess crea la
// solicitud y necesita guardarla.
const PAIRING_PERSIST_INTERVAL_MS = 60 * 1000;

const agentKey = (userAgent) => String(userAgent || "").slice(0, 120);
const pollKey = (address, userAgent) => `${address}|${agentKey(userAgent)}`;

/**
 * H-02: conjuntos de Host/Origin aceptados para un enlace concreto.
 *
 * Antes bridge.mjs los armaba a mano al arrancar y `watchBinding` los
 * reconstruia SOLO con la IP nueva, olvidando los alias de loopback: tras un
 * cambio de IP, 127.0.0.1/localhost/[::1] recibian 403. Esta funcion es la
 * unica fuente de verdad y los reañade siempre. Util para la prueba unitaria.
 */
export const LOOPBACK_ALIASES = Object.freeze(["127.0.0.1", "localhost", "[::1]"]);
export const buildAllowedSets = (host, port) => {
  const allowedHosts = new Set([`${host}:${port}`]);
  const allowedOrigins = new Set([`http://${host}:${port}`]);
  for (const alias of LOOPBACK_ALIASES) {
    allowedHosts.add(`${alias}:${port}`);
    allowedOrigins.add(`http://${alias}:${port}`);
  }
  return { allowedHosts, allowedOrigins };
};

const markPairingPanelOpened = (remoteAddress) => {
  pairingPanelOpened.set(normalizeAddress(remoteAddress || "desconocida"), Date.now());
};

const trackPairingPoll = (remoteAddress, userAgent) => {
  const now = Date.now();
  for (const [key, previous] of pairingPolls) {
    if (now - previous.at > PAIRING_POLL_TTL_MS) pairingPolls.delete(key);
  }
  for (const [address, at] of pairingPanelOpened) {
    if (now - at > PAIRING_POLL_TTL_MS) pairingPanelOpened.delete(address);
  }

  const address = normalizeAddress(remoteAddress || "desconocida");
  const key = pollKey(address, userAgent);
  const previous = pairingPolls.get(key);
  if (previous?.entry && now - previous.persistedAt < PAIRING_PERSIST_INTERVAL_MS) {
    previous.entry.requestedAt = new Date(now).toISOString();
    previous.attempts += 1;
    previous.entry.attempts = previous.attempts;
    previous.at = now;
    return { entry: previous.entry, created: false, denied: false, state: previous };
  }

  const { entry, created, denied } = requestAccess(remoteAddress, userAgent);
  const sameRequest = Boolean(entry) && previous?.requestId === entry.id;
  const state = {
    requestId: entry ? entry.id : "",
    attempts: entry ? (sameRequest ? previous.attempts + 1 : 1) : 0,
    panelOpened: pairingPanelOpened.has(address),
    at: now,
    persistedAt: now,
    entry: entry || null,
  };
  pairingPolls.set(key, state);
  // Marca visible en la solicitud: el esquema del registro lo administra
  // devices.mjs (fuera de este bloque), asi que el contador se adjunta aqui en
  // memoria. La fuente de verdad para no duplicar la solicitud sigue siendo
  // requestAccess, que reutiliza la pendiente de la misma IP.
  if (entry) entry.attempts = state.attempts;
  return { entry, created, denied, state };
};

export async function dispatchRequest(req, res, context) {
  const { bindHost, bindPrefix, allowedOrigins, allowedHosts, openPanelWindow } = context;
  const remoteAddress = req.socket.remoteAddress;

  // Un proxy delante del puente (Cloudflare Tunnel, nginx) hace que todas las
  // peticiones lleguen desde 127.0.0.1, y entonces el criterio de red dejaria de
  // proteger nada. Si aparecen cabeceras de proxy y el operador no lo habilito
  // de forma explicita, se rechaza: mejor fallar cerrado que publicar el puente
  // sin querer. `DSH_ALLOW_PROXY_ACCESS=1` SOLO deja pasar esta guarda de red:
  // con cabeceras de proxy no se concede ningun privilegio de loopback (lista
  // de pendientes, abrir el panel, aprobar/rechazar, retry ni pair-events).
  const proxyHeaders = hasProxyHeaders(req);
  if (proxyHeaders && !config.allowProxyAccess) {
    sendJson(res, 403, {
      error: "Peticion a traves de un proxy rechazada",
      hint: "Si es intencionado (Cloudflare Tunnel + Access), arranca el puente con DSH_ALLOW_PROXY_ACCESS=1 y pon una capa de identidad delante.",
    });
    return;
  }
  if (!isClientAuthorized(remoteAddress, bindHost, bindPrefix)) {
    sendText(res, 403, "Acceso denegado");
    return;
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  if (hasAmbiguousFraming(req.headers)) {
    sendText(res, 400, "Framing de peticion ambiguo");
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${bindHost}:${config.listenPort}`);
  } catch {
    sendText(res, 400, "URI invalida");
    return;
  }

  const { pathname } = url;

  // 5.2.0: salud real (puente + Harness) para el healthcheck de Docker y para el
  // panel. Sin credenciales: la peticion solo puede llegar desde la red privada
  // o loopback (guarda anterior) y la respuesta no contiene secretos.
  // M3: /healthz se atendia ANTES del filtro de Host/Origin, asi que un Host
  // ajeno (DNS rebinding) o un Origin:null/cross-site podian sondearlo. Se le
  // aplica la misma frontera que al resto de rutas; el healthcheck de Docker y
  // el doctor de la PC usan Host legitimo (127.0.0.1:<puerto>) y no envian
  // Origin, asi que siguen pasando.
  if (pathname === "/healthz") {
    if (!isSameOriginRequest(req, allowedOrigins, allowedHosts)) {
      sendText(res, 403, "Origen no autorizado");
      return;
    }
    await handleHealthz(req, res, { bindHost, remoteAddress });
    return;
  }

  if (await handlePairingRoutes(req, res, { url, pathname, remoteAddress, context, proxyHeaders })) return;

  if (!isSameOriginRequest(req, allowedOrigins, allowedHosts)) {
    sendText(res, 403, "Origen no autorizado");
    return;
  }

  if (pathname === "/dsh-companion/status" && (req.method === "GET" || req.method === "HEAD")) {
    if (!consumeAllowance(`status:${remoteAddress}`, { capacity: 120, refillPerSecond: 2 })) {
      sendJson(res, 429, { error: "Demasiadas consultas" });
      return;
    }

    const device = resolveDevice(req, res, remoteAddress);
    const authorized = Boolean(device) || hasValidAccessKey(req);
    const now = Date.now();

    if (!authorized) {
      // Sin autorizacion no se calcula nada caro: buildStatusPayload() lanza
      // collectSystemStats() (PowerShell cada pocos segundos) y era un DoS
      // trivial desde la LAN con solo pedir /status en bucle.
      //
      // P6: el panel se abre como maximo una vez por IP y nunca si ya hay una
      // pestana del panel abierta/enfocada (su SSE mantiene isPanelTabOpen en
      // verdadero). La solicitud pendiente se reutiliza y solo se cuentan los
      // intentos, en vez de crear una solicitud nueva por sondeo.
      const poll = trackPairingPoll(remoteAddress, req.headers["user-agent"]);
      if (!poll.state.panelOpened && !isPanelTabOpen()) {
        poll.state.panelOpened = true;
        markPairingPanelOpened(remoteAddress);
        // P6: si la peticion llego por un proxy/tunel no se abre una ventana del
        // panel en el escritorio del host: el operador no esta delante y la
        // ventana solo molesta.
        if (!proxyHeaders) openPanelWindow();
      }
      sendJson(res, 200, {
        service: "dsh-companion",
        version: config.version,
        apkVersion: config.apkVersion || config.version,
        apkVersionCode: config.apkVersionCode || 0,
        status: "pairing",
        dshOnline: false,
        targetPort: null,
        requestAttempts: poll.state.attempts,
        time: now,
      });
      return;
    }

    // P47: un dispositivo autorizado que consulta el estado esta vivo. Antes
    // solo se refrescaba en el flujo documental; con DSH_ACCESS_DISABLE=1
    // ningun camino lo hacia y el dispositivo caducaba por TTL aunque se usara
    // a diario. Refrescar aqui no cambia la autorizacion.
    if (device) touchDevice(device);

    // Una peticion con cabeceras de proxy no es loopback aunque el socket venga
    // de 127.0.0.1: el proxy reenvia desde el host. Sin privilegios locales.
    const isLoopback = isTrustedLoopbackRequest(req, remoteAddress);
    const payload = await buildStatusPayload({ includePendingList: isLoopback, device });
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === "/dsh-companion/stats" && (req.method === "GET" || req.method === "HEAD")) {
    if (!consumeAllowance(`stats:${remoteAddress}`, { capacity: 60, refillPerSecond: 1 })) {
      sendJson(res, 429, { error: "Demasiadas consultas" });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    const current = collectSystemStats();
    sendJson(res, 200, { ok: true, stats: { ...current, history: telemetryHistory } });
    return;
  }


  // P7/P55: el simulador es una herramienta de desarrollo. Solo se sirve a un
  // dispositivo emparejado o con la clave de acceso, y con sus propios recursos
  // (antes el HTML cargaba CSS/JS que el puente no servia: 403).
  if (pathname === "/simulator" || pathname === "/simulator-base.css" ||
      pathname === "/simulator-components.css" || pathname === "/simulator.js") {
    const simulatorDevice = findPairedDevice(req);
    if (!simulatorDevice && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    serveStatic(pathname, req, res);
    return;
  }

  // La puerta devuelve el dispositivo de la peticion (o `true` si respondio
  // ella). Se reutiliza aqui para aplicar su perfil (rol y puerto destino) al
  // proxy, incluida la primera peticion en la que el dispositivo se canjea.
  const gate = await handlePendingApprovalGate(req, res, { url, pathname, remoteAddress, context, proxyHeaders });
  if (gate === true) return;
  const requestDevice = gate || findPairedDevice(req) || null;

  if (pathname === "/" || pathname === "/index.html") {
    const targetPort = await resolveTargetPortForDevice(requestDevice);
    await handleHttpProxy(req, res, { targetPort, mobileMode: wantsMobileShell(req, url), device: requestDevice });
    return;
  }

  if (pathname === "/m" || pathname === "/offline") {
    if (pathname === "/m") {
      res.writeHead(308, { Location: "/", "Cache-Control": "no-store" });
      res.end();
      return;
    }
  }

  // Rutas de datos: /dsh-companion/sync y /dsh-companion/notes (escritura) y
  // /dsh-companion/chats y /dsh-companion/chat/:id (lectura) se despachan en
  // routes-data.mjs, en el mismo orden que tenian aqui.
  if (await handleDataRoutes(req, res, { url, pathname, remoteAddress })) return;

  if (pathname === "/dsh-companion/pc-events" && (req.method === "GET" || req.method === "HEAD")) {
    if (!consumeAllowance(`pc-events:${remoteAddress}`, { capacity: 20, refillPerSecond: 0.2 })) {
      sendJson(res, 429, { error: "Demasiadas conexiones" });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    startPcWatcher();
    handlePcEvents(req, res);
    return;
  }

  if (pathname === "/dsh-companion/pc-events/test" && req.method === "POST") {
    const device = resolveDevice(req, res, remoteAddress);
    if (device && isViewer(device)) {
      logReadOnlyRejection(device, req.method, pathname);
      sendReadOnly(res);
      return;
    }
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    startPcWatcher();
    const listeners = emitTestEvent();
    sendJson(res, 200, { ok: true, listeners });
    return;
  }

  if (hasStaticRoute(pathname)) {
    serveStatic(pathname, req, res);
    return;
  }

  const targetPort = await resolveTargetPortForDevice(requestDevice);
  await handleHttpProxy(req, res, { targetPort, mobileMode: wantsMobileShell(req, url), device: requestDevice });
}
