/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import { config } from "./config.mjs";
import { isClientAuthorized, normalizeAddress, resolveTargetPort, probePort } from "./network.mjs";
import { accessKeyEnabled, hasValidAccessKey, isCompanionRequestTrusted } from "./crypto.mjs";
import {
  approveRequest,
  claimApprovedDevice,
  clearDenied,
  deviceCookieHeader,
  findPairedDevice,
  isDenied,
  onDeviceApproved,
  pendingRequests,
  readCookie,
  rejectRequest,
  requestAccess,
  revokeAll,
  touchDevice,
} from "./devices.mjs";
import { log } from "./log.mjs";
import { rejectedPage, waitingPage } from "./pairing.mjs";
import { hasAmbiguousFraming, isDocumentRequest, isJsonRequest, isSameOriginRequest, readBody, sendJson, sendText } from "./http.mjs";
import { handleHttpProxy } from "./proxy.mjs";
import { terminateAllWsConnections } from "./proxy-ws.mjs";
import { handleSync, handleListChats, handleGetChat } from "./sync.mjs";
import { hasStaticRoute, serveStatic } from "./static.mjs";
import { consumeAllowance } from "./ratelimit.mjs";
import { collectSystemStats } from "./system-stats.mjs";
import { panelUrl } from "./panel.mjs";

const waitingClients = new Set();

onDeviceApproved(() => {
  for (const client of waitingClients) {
    try {
      client.write(`data: ${JSON.stringify({ approved: true })}\n\n`);
    } catch {
      waitingClients.delete(client);
    }
  }
  waitingClients.clear();
});

export const resolveDevice = (req, res, remoteAddress) => {
  const paired = findPairedDevice(req);
  if (paired) {
    const cookieId = readCookie(req);
    if (!cookieId || cookieId !== paired.id) {
      res.setHeader("Set-Cookie", deviceCookieHeader(paired.id));
    }
    return paired;
  }

  const claimed = claimApprovedDevice(remoteAddress);
  if (claimed) res.setHeader("Set-Cookie", deviceCookieHeader(claimed.id));
  return claimed;
};

export const wantsMobileShell = (req, url) => {
  if (url.searchParams.get("dshc") === "off") return false;
  if (url.searchParams.get("dshc") === "on") return true;
  return /android|iphone|ipad|ipod|mobile|harmonyos/i.test(String(req.headers["user-agent"] || ""));
};

export const buildStatusPayload = async () => {
  const targetPort = await resolveTargetPort();
  const dshOnline = await probePort(targetPort, config.targetHost, 400);
  const pending = pendingRequests();
  return {
    service: "dsh-companion",
    version: config.version,
    apkVersion: config.apkVersion || config.version,
    apkVersionCode: config.apkVersionCode || 14,
    previousApkVersion: config.previousApkVersion || "3.9.2",
    previousApkVersionCode: config.previousApkVersionCode || 13,
    status: "online",
    dshOnline,
    targetPort,
    pendingDevices: pending.length,
    pendingList: pending,
    systemStats: collectSystemStats(),
    time: Date.now(),
  };
};

export async function dispatchRequest(req, res, context) {
  const { bindHost, bindPrefix, allowedOrigins, allowedHosts, openPanelWindow } = context;
  const remoteAddress = req.socket.remoteAddress;

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

  if (pathname === "/pair" || pathname.startsWith("/pair/")) {
    const clientIp = normalizeAddress(remoteAddress);
    if (clientIp.startsWith("127.")) {
      res.writeHead(302, { Location: panelUrl() });
      res.end();
      return;
    }
    sendText(res, 403, `El panel solo esta disponible en http://127.0.0.1:${config.panelPort}/pair`);
    return;
  }

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

    if (!authorized) {
      const { created } = requestAccess(remoteAddress, req.headers["user-agent"]);
      if (created) openPanelWindow();
    }

    const payload = await buildStatusPayload();
    sendJson(res, 200, authorized ? payload : { ...payload, status: "pairing", dshOnline: false, targetPort: null, systemStats: null });
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
    sendJson(res, 200, collectSystemStats());
    return;
  }

  if (pathname === "/dsh-companion/pair-state" && req.method === "GET") {
    if (!consumeAllowance(`state:${remoteAddress}`, { capacity: 120, refillPerSecond: 2 })) {
      sendJson(res, 429, { approved: false });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    const approved = Boolean(device);

    if (!approved) {
      if (isDenied(remoteAddress)) {
        sendJson(res, 200, { approved: false, rejected: true, pending: false });
        return;
      }
      requestAccess(remoteAddress, req.headers["user-agent"]);
    }

    sendJson(res, 200, { approved, rejected: false, pending: !approved });
    return;
  }

  if (pathname === "/dsh-companion/pair-events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);
    waitingClients.add(res);

    req.on("close", () => {
      waitingClients.delete(res);
    });
    return;
  }

  if (pathname === "/dsh-companion/open-panel" && req.method === "POST") {
    if (!consumeAllowance(`open:${remoteAddress}`, { capacity: 3, refillPerSecond: 0.05 })) {
      sendJson(res, 429, { ok: false, error: "Espera un momento" });
      return;
    }
    const hasRequest = !isDenied(remoteAddress) && !findPairedDevice(req);
    sendJson(res, 200, { ok: hasRequest ? openPanelWindow({ force: true }) : false });
    return;
  }

  if (pathname === "/dsh-companion/retry" && req.method === "POST") {
    if (!consumeAllowance(`retry:${remoteAddress}`, { capacity: 3, refillPerSecond: 0.05 })) {
      sendJson(res, 429, { ok: false });
      return;
    }
    clearDenied(remoteAddress);
    const { created } = requestAccess(remoteAddress, req.headers["user-agent"]);
    if (created) openPanelWindow({ force: true });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/dsh-companion/kill-switch" && req.method === "POST") {
    if (!consumeAllowance(`kill:${remoteAddress}`, { capacity: 5, refillPerSecond: 0.1 })) {
      sendJson(res, 429, { ok: false, error: "Demasiadas peticiones" });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { ok: false, error: "Acceso no autorizado" });
      return;
    }
    const revokedCount = revokeAll();
    if (revokedCount < 0) {
      sendJson(res, 500, { ok: false, error: "Fallo al persistir registro de revocacion" });
      return;
    }
    const wsClosed = terminateAllWsConnections();
    log("pair", `Kill switch activado desde ${remoteAddress}: ${revokedCount} dispositivos revocados, ${wsClosed} tuneles WS terminados`);
    sendJson(res, 200, { ok: true, revoked: revokedCount, message: "Todos los dispositivos han sido revocados" });
    return;
  }

  if (pathname === "/dsh-companion/rechazado" && req.method === "GET") {
    const body = Buffer.from(rejectedPage(), "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    res.end(body);
    return;
  }

  if ((pathname === "/dsh-companion/action" || pathname === "/dsh-companion/notification-action") && req.method === "POST") {
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 401, { error: "No autorizado" });
      return;
    }
    let body;
    try {
      body = JSON.parse((await readBody(req, 4096)).toString("utf8"));
    } catch {
      sendJson(res, 400, { error: "JSON invalido" });
      return;
    }
    const { action, id, requestId } = body;
    const targetId = id || requestId;
    if (action === "approve_device") {
      const ok = approveRequest(targetId);
      sendJson(res, 200, { ok: Boolean(ok) });
      return;
    }
    if (action === "reject_device") {
      const ok = rejectRequest(targetId);
      sendJson(res, 200, { ok: Boolean(ok) });
      return;
    }
    if (action === "allow" || action === "reject" || action === "approve") {
      sendJson(res, 200, { ok: true, action, id: targetId });
      return;
    }
    sendJson(res, 400, { error: "Accion desconocida" });
    return;
  }

  if (accessKeyEnabled() && !hasValidAccessKey(req)) {
    const device = resolveDevice(req, res, remoteAddress);

    if (!device) {
      const { entry: pending, created, denied } = requestAccess(remoteAddress, req.headers["user-agent"]);
      if (created) openPanelWindow();

      if (isDocumentRequest(req)) {
        const pageBody = denied
          ? rejectedPage()
          : waitingPage({ code: pending?.code || "", hostLabel: `${bindHost}:${config.listenPort}` });
        const body = Buffer.from(pageBody, "utf8");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": body.length,
          "Cache-Control": "no-store",
        });
        res.end(body);
        return;
      }

      sendJson(res, 403, { error: "Acceso pendiente de aprobacion", id: pending?.id ?? "" });
      return;
    }

    if (touchDevice(device)) res.setHeader("Set-Cookie", deviceCookieHeader(device.id));
  }

  if (pathname === "/" || pathname === "/index.html") {
    const targetPort = await resolveTargetPort();
    await handleHttpProxy(req, res, { targetPort, mobileMode: wantsMobileShell(req, url) });
    return;
  }

  if (pathname === "/m" || pathname === "/offline") {
    if (pathname === "/m") {
      res.writeHead(308, { Location: "/", "Cache-Control": "no-store" });
      res.end();
      return;
    }
  }

  if (pathname === "/dsh-companion/sync") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "POST" });
      return;
    }
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Se requiere Content-Type application/json" });
      req.resume();
      return;
    }
    if (!isCompanionRequestTrusted(req)) {
      sendJson(res, 401, { error: "Token de companion ausente o invalido" });
      return;
    }
    await handleSync(req, res, remoteAddress);
    return;
  }

  if (pathname === "/dsh-companion/chats") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD" });
      return;
    }
    await handleListChats(req, res, remoteAddress);
    return;
  }

  if (pathname.startsWith("/dsh-companion/chat/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD" });
      return;
    }
    const id = pathname.slice("/dsh-companion/chat/".length).trim();
    const format = url.searchParams.get("format") || (req.headers.accept?.includes("text/markdown") ? "md" : "json");
    await handleGetChat(req, res, id, remoteAddress, format);
    return;
  }

  if (hasStaticRoute(pathname)) {
    serveStatic(pathname, req, res);
    return;
  }

  const targetPort = await resolveTargetPort();
  await handleHttpProxy(req, res, { targetPort, mobileMode: wantsMobileShell(req, url) });
}
