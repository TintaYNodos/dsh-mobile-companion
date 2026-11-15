/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.mjs";
import {
  PANEL_COOKIE,
  SESSION_TTL_MS,
  TICKET_TTL_MS,
  createSession,
  discardPublishedUrl,
  issueTicket,
  redeemTicket,
  sessionValid,
} from "./panel-session.mjs";
import { log, warn } from "./log.mjs";
import { readBody, sendText } from "./http.mjs";
import {
  approvalPage,
  notLocalPage,
  panelCredentialPage,
  recoveryPage,
  stateStamp,
} from "./pairing.mjs";
import {
  approveRequest,
  clearHistory,
  deviceSummary,
  pendingRequests,
  recentEvents,
  rejectRequest,
  removeDevice,
  renameDevice,
  revokeAll,
} from "./devices.mjs";


let activePort = config.panelPort;

let lastPanelPing = 0;
const sseClients = new Set();

export const isPanelTabOpen = () => {
  return sseClients.size > 0 || (Date.now() - lastPanelPing < 7000);
};

export const recordPanelPing = () => {
  lastPanelPing = Date.now();
};

export const notifyPanelClients = () => {
  const currentStamp = snapshot().stamp;
  for (const client of sseClients) {
    try {
      client.write(`data: ${JSON.stringify({ stamp: currentStamp })}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
};

let lastFocusAt = 0;

/**
 * P33: traer la ventana del panel al frente es una accion con efectos: se hace
 * una sola vez por minuto y nunca si ya hay una pestana del panel abierta.
 */
export const focusPanelWindow = (options = {}) => {
  if (process.platform !== "win32") return;
  if (!options.force) {
    if (isPanelTabOpen()) return true;
    if (Date.now() - lastFocusAt < 60000) return true;
  }
  lastFocusAt = Date.now();
  try {
    const psCmd = "$ws = New-Object -ComObject Wscript.Shell; if (-not $ws.AppActivate('Autorizar dispositivos')) { $ws.AppActivate('DSH Companion') }";
    spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {}
  return true;
};

const readPanelCookie = (req) => {
  const header = String(req.headers.cookie || "");
  for (const chunk of header.split(";")) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith(`${PANEL_COOKIE}=`)) return trimmed.slice(PANEL_COOKIE.length + 1);
  }
  return null;
};

const isAuthorized = (req) => sessionValid(readPanelCookie(req));

/**
 * P13: el panel solo atiende peticiones cuyo `Host` sea el de este mismo
 * equipo. Sin esta comprobacion, un dominio externo resuelto a 127.0.0.1 (DNS
 * rebinding) podia hablar con el panel con sus propias cabeceras; la cookie
 * SameSite=Strict ya frena el CSRF, pero validar el Host es la defensa directa
 * y barata. Se admiten 127.0.0.1:puerto, localhost:puerto, [::1]:puerto y el
 * host configurado (DSH_BIND_HOST), todos con el puerto real del panel.
 */
const isAllowedPanelHost = (req) => {
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!host) return false;

  const allowed = new Set([
    `127.0.0.1:${activePort}`,
    `localhost:${activePort}`,
    `[::1]:${activePort}`,
  ]);
  const configured = String(config.bindHost || "").trim().toLowerCase();
  if (configured) allowed.add(`${configured}:${activePort}`);

  return allowed.has(host);
};

const panelCookie = (sessionId) =>
  `${PANEL_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;

const html = (res, body, status = 200, extraHeaders = {}) => {
  const buffer = Buffer.from(body, "utf8");
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(buffer);
};

const json = (res, status, payload) => {
  const buffer = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
};

const redirect = (res, location, extraHeaders = {}) => {
  res.writeHead(303, { Location: location, "Cache-Control": "no-store", ...extraHeaders });
  res.end();
};

const snapshot = () => {
  const data = { pending: pendingRequests(), devices: deviceSummary(), events: recentEvents() };
  return { ...data, stamp: stateStamp(data) };
};

/**
 * Resultado de cada accion: el panel no debe decir "listo" cuando la solicitud
 * ya caduco o el dispositivo ya no existe.
 */
const runAction = (pathname, form) => {
  const id = form.get("id") || "";

  const result = (() => {
    switch (pathname) {
      case "/pair/approve":
        return approveRequest(id) ? "approve" : "expired";
      case "/pair/reject":
        return rejectRequest(id) ? "reject" : "expired";
      case "/pair/revoke-device":
        return removeDevice(id) ? "revoke" : "missing";
      case "/pair/rename":
        return renameDevice(id, form.get("name") || "") ? "rename" : "missing";
      case "/pair/revoke":
        revokeAll();
        return "revoke-all";
      case "/pair/clear-history":
        clearHistory();
        return "cleared";
      default:
        return null;
    }
  })();

  if (result) notifyPanelClients();
  return result;
};

const handler = async (req, res) => {
  const remote = String(req.socket.remoteAddress || "");
  if (!remote.startsWith("127.") && remote !== "::1") {
    html(res, notLocalPage(), 403);
    return;
  }

  // P13: un Host ajeno (DNS rebinding) recibe 403 antes de tocar boletos,
  // sesiones o cualquier ruta del panel.
  if (!isAllowedPanelHost(req)) {
    html(res, notLocalPage(), 403);
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://127.0.0.1:${activePort}`);
  } catch {
    sendText(res, 400, "URI invalida");
    return;
  }

  if (url.pathname === "/pair" && req.method === "GET") {
    recordPanelPing();
    const ticket = url.searchParams.get("t");

    // El boleto de entrada se canjea UNA vez por una cookie de sesion; ya no se
    // acepta el token maestro en la URL ni se conserva tras el canje.
    if (ticket !== null) {
      if (redeemTicket(ticket) !== "ok") {
        html(res, recoveryPage(), 403);
        return;
      }
      redirect(res, "/pair", { "Set-Cookie": panelCookie(createSession()) });
      return;
    }

    if (!isAuthorized(req)) {
      html(res, panelCredentialPage());
      return;
    }

    const flash = url.searchParams.get("flash") || "";
    html(res, approvalPage({ ...snapshot(), flash }));
    return;
  }

  if (url.pathname === "/pair/state" && req.method === "GET") {
    recordPanelPing();
    if (!isAuthorized(req)) {
      json(res, 401, { error: "Credencial del panel invalida" });
      return;
    }
    json(res, 200, { stamp: snapshot().stamp });
    return;
  }

  if (url.pathname === "/pair/events" && req.method === "GET") {
    if (!isAuthorized(req)) {
      sendText(res, 401, "No autorizado");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ stamp: snapshot().stamp })}\n\n`);
    sseClients.add(res);
    recordPanelPing();

    req.on("close", () => {
      sseClients.delete(res);
    });
    return;
  }

  if (url.pathname.startsWith("/pair/") && req.method === "POST") {
    if (!isAuthorized(req)) {
      sendText(res, 403, "Credencial del panel invalida");
      return;
    }

    // Una pagina externa abierta en este equipo no puede enviar formularios aqui.
    const origin = req.headers.origin;
    const secFetchSite = req.headers["sec-fetch-site"];

    if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
      sendText(res, 403, "Origen no autorizado");
      return;
    }

    if (origin && origin !== "null" && origin !== `http://127.0.0.1:${activePort}` && origin !== `http://localhost:${activePort}`) {
      sendText(res, 403, "Origen no autorizado");
      return;
    }

    const referer = req.headers.referer;
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (refOrigin !== `http://127.0.0.1:${activePort}` && refOrigin !== `http://localhost:${activePort}`) {
          sendText(res, 403, "Origen no autorizado");
          return;
        }
      } catch {
        sendText(res, 403, "Origen no autorizado");
        return;
      }
    }

    let form;
    try {
      form = new URLSearchParams((await readBody(req, 4096)).toString("utf8"));
    } catch {
      sendText(res, 400, "Solicitud invalida");
      return;
    }

    const flash = runAction(url.pathname, form);
    if (!flash) {
      sendText(res, 404, "Accion desconocida");
      return;
    }

    redirect(res, `/pair?flash=${encodeURIComponent(flash)}`);
    return;
  }

  sendText(res, 404, "Ruta desconocida");
};

let panelServer = null;

/**
 * El panel ya no se publica con el token en un archivo de texto: cualquiera
 * con acceso de lectura al hogar del usuario podria usarlo (y acababa en el
 * historial del navegador). Se borra el archivo heredado para no dejar
 * credenciales viejas en disco. panel.bat sigue funcionando porque usa el
 * boleto de un solo uso de `companion-panel-token`.
 */

/**
 * Abre el panel en loopback. Si el puerto esta ocupado prueba los siguientes:
 * quedarse sin panel dejaria al usuario sin forma de autorizar su telefono.
 */
export function startPanel() {
  if (panelServer) return panelServer;

  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      // Un 500 mudo deja al usuario sin panel y sin pista: siempre se registra.
      warn("panel", `Fallo al atender ${req.url}: ${error && error.stack ? error.stack.split("\n")[0] : error}`);
      if (!res.headersSent) sendText(res, 500, "Fallo del panel");
      else res.destroy();
    });
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = 15_000;

  // Un solo listener permanente: registrar `once` dentro del reintento dejaba
  // el segundo EADDRINUSE sin capturar y mataba el proceso entero.
  let attempt = 0;
  const onError = (error) => {
    if (error.code === "EADDRINUSE" && attempt < 5) {
      attempt += 1;
      activePort = config.panelPort + attempt;
      server.listen(activePort, "127.0.0.1");
      return;
    }
    server.removeListener("error", onError);
    warn("panel", `No se pudo abrir el panel local: ${error.code || error.message}`);
    panelServer = null;
  };

  server.on("error", onError);
  server.once("listening", () => {
    panelServer = server;
    log("panel", `Panel local en http://127.0.0.1:${activePort}/pair`);
    discardPublishedUrl();
  });

  server.listen(activePort, "127.0.0.1");
  return server;
}

/**
 * URL de apertura del panel con un boleto de un solo uso (caduca en 2 minutos).
 * Solo se entrega al navegador del propio equipo a traves de openPanelWindow.
 */
export const panelUrl = () => `http://127.0.0.1:${activePort}/pair?t=${issueTicket(TICKET_TTL_MS)}`;
