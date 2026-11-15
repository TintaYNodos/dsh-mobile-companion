/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import { config } from "./config.mjs";
import { normalizeAddress } from "./network.mjs";
import { accessKeyEnabled, hasValidAccessKey, isCompanionRequestTrusted, rotateAccessKey } from "./crypto.mjs";
import {
  approveRequest,
  claimApprovedDevice,
  clearDenied,
  deviceCookieHeader,
  findPairedDevice,
  isDenied,
  onDeviceApproved,
  readCookie,
  rejectRequest,
  requestAccess,
  revokeAll,
  touchDevice,
} from "./devices.mjs";
import { isDocumentRequest, isSameOriginRequest, readBody, sendJson, sendText } from "./http.mjs";
import { log, warn } from "./log.mjs";
import { rejectedPage, waitingPage } from "./pairing.mjs";
import { consumeAllowance } from "./ratelimit.mjs";
import { terminateAllWsConnections } from "./proxy-ws.mjs";
import { invalidatePanelSessions } from "./panel-session.mjs";

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

  // Un equipo aprobado que aun no tiene cookie la recibe aqui, una sola vez.
  const claimed = claimApprovedDevice(remoteAddress);
  if (claimed) res.setHeader("Set-Cookie", deviceCookieHeader(claimed.id));
  return claimed;
};

export async function handlePairingRoutes(req, res, { url, pathname, remoteAddress, context }) {
  const { openPanelWindow } = context;

  if (pathname === "/pair" || pathname.startsWith("/pair/")) {
    const clientIp = normalizeAddress(remoteAddress);
    if (clientIp.startsWith("127.")) {
      // No se redirige con el token del panel en la URL: se abre la ventana del
      // panel (que ya hace el canje token->cookie) y se responde sin credencial.
      openPanelWindow();
      sendText(res, 403, `El panel se abre en su propia ventana: http://127.0.0.1:${config.panelPort}/pair`);
      return true;
    }
    sendText(res, 403, `El panel solo esta disponible en http://127.0.0.1:${config.panelPort}/pair`);
    return true;
  }

  // El resto de rutas de emparejamiento vivia despues del filtro de origen en
  // routes.mjs; se aplica aqui para que un origen no confiable siga sin
  // alcanzarlas. Si falla, routes.mjs responde igual que antes (return false).
  if (!isSameOriginRequest(req, context.allowedOrigins, context.allowedHosts)) return false;

  if (pathname === "/dsh-companion/pair-state" && req.method === "GET") {
    if (!consumeAllowance(`state:${remoteAddress}`, { capacity: 120, refillPerSecond: 2 })) {
      sendJson(res, 429, { approved: false });
      return true;
    }
    const device = resolveDevice(req, res, remoteAddress);
    const approved = Boolean(device);

    if (!approved) {
      if (isDenied(remoteAddress)) {
        sendJson(res, 200, { approved: false, rejected: true, pending: false });
        return true;
      }
      requestAccess(remoteAddress, req.headers["user-agent"]);
    }

    sendJson(res, 200, { approved, rejected: false, pending: !approved });
    return true;
  }

  if (pathname === "/dsh-companion/pair-events" && req.method === "GET") {
    // El flujo de espera filtra el estado de aprobacion de cualquier IP. Solo lo
    // consume la propia computadora o un cliente ya autorizado.
    const paired = resolveDevice(req, res, remoteAddress);
    if (!paired && !hasValidAccessKey(req) && !normalizeAddress(remoteAddress).startsWith("127.")) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return true;
    }
    if (!consumeAllowance(`pair-events:${remoteAddress}`, { capacity: 10, refillPerSecond: 0.1 })) {
      sendJson(res, 429, { error: "Demasiadas conexiones" });
      return true;
    }
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
    return true;
  }

  if (pathname === "/dsh-companion/open-panel" && req.method === "POST") {
    // Abrir ventanas en el escritorio del host es una accion local: solo se
    // permite desde loopback. Antes cualquier cliente de la red podia hacerlo.
    if (!normalizeAddress(remoteAddress).startsWith("127.")) {
      sendJson(res, 403, { ok: false, error: "Solo disponible desde la computadora" });
      return true;
    }
    if (!consumeAllowance(`open:${remoteAddress}`, { capacity: 3, refillPerSecond: 0.05 })) {
      sendJson(res, 429, { ok: false, error: "Espera un momento" });
      return true;
    }
    const hasRequest = !isDenied(remoteAddress) && !findPairedDevice(req);
    sendJson(res, 200, { ok: hasRequest ? openPanelWindow({ force: true }) : false });
    return true;
  }

  if (pathname === "/dsh-companion/retry" && req.method === "POST") {
    // Borrar un rechazo y crear una solicitud nueva no debe poder hacerlo
    // cualquiera de la red: solo el propio equipo o un cliente autorizado.
    const paired = resolveDevice(req, res, remoteAddress);
    if (!paired && !hasValidAccessKey(req) && !normalizeAddress(remoteAddress).startsWith("127.")) {
      sendJson(res, 403, { ok: false, error: "Acceso no autorizado" });
      return true;
    }
    if (!consumeAllowance(`retry:${remoteAddress}`, { capacity: 3, refillPerSecond: 0.05 })) {
      sendJson(res, 429, { ok: false });
      return true;
    }
    clearDenied(remoteAddress);
    const { created } = requestAccess(remoteAddress, req.headers["user-agent"]);
    if (created) openPanelWindow({ force: true });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/dsh-companion/kill-switch" && req.method === "POST") {
    if (!consumeAllowance(`kill:${remoteAddress}`, { capacity: 5, refillPerSecond: 0.1 })) {
      sendJson(res, 429, { ok: false, error: "Demasiadas peticiones" });
      return true;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { ok: false, error: "Acceso no autorizado" });
      return true;
    }
    const revokedCount = revokeAll();
    if (revokedCount < 0) {
      sendJson(res, 500, { ok: false, error: "Fallo al persistir registro de revocacion" });
      return true;
    }
    const wsClosed = terminateAllWsConnections();
    // Ademas del tunel, se cierran las sesiones del panel: si no, la pestana
    // abierta sigue aprobando dispositivos despues del kill switch.
    const panelSessionsClosed = invalidatePanelSessions();
    // Ademas de revocar dispositivos se rota la clave maestra: si no, "cortar
    // accesos" dejaba viva la credencial que abre todo.
    let rotated = false;
    try {
      rotateAccessKey();
      rotated = true;
    } catch (error) {
      warn("pair", `No se pudo rotar la clave: ${error.message}`);
    }
    log("pair", `Kill switch activado desde ${remoteAddress}: ${revokedCount} dispositivos revocados, ${wsClosed} tuneles WS terminados, clave rotada: ${rotated}, sesiones de panel cerradas: ${panelSessionsClosed}`);
    sendJson(res, 200, { ok: true, revoked: revokedCount, message: "Todos los dispositivos han sido revocados" });
    return true;
  }

  if (pathname === "/dsh-companion/rechazado" && req.method === "GET") {
    const body = Buffer.from(rejectedPage(), "utf8");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    res.end(body);
    return true;
  }

  if ((pathname === "/dsh-companion/action" || pathname === "/dsh-companion/notification-action") && req.method === "POST") {
    // Aprobar o rechazar dispositivos es una decision de administracion del
    // equipo, no del cliente. Antes bastaba una cookie de dispositivo
    // emparejado: un telefono podia autorizar a otros dispositivos. Ahora la
    // accion queda reservada al propio equipo del host (loopback), que es
    // donde vive el panel local; el telefono recibe 403 y debe hacerlo desde
    // la computadora. El panel de 127.0.0.1:<panelPort>/pair no usa esta ruta:
    // aplica las decisiones con su propia sesion.
    if (!normalizeAddress(remoteAddress).startsWith("127.")) {
      log("pair", `Accion de dispositivos rechazada para ${remoteAddress}: solo desde el equipo del host`);
      sendJson(res, 403, { error: "Accion reservada al panel local de la computadora" });
      return true;
    }
    let body;
    try {
      body = JSON.parse((await readBody(req, 4096)).toString("utf8"));
    } catch {
      sendJson(res, 400, { error: "JSON invalido" });
      return true;
    }
    const { action, id, requestId } = body;
    const targetId = id || requestId;
    if (action === "approve_device") {
      const ok = approveRequest(targetId);
      sendJson(res, 200, { ok: Boolean(ok) });
      return true;
    }
    if (action === "reject_device") {
      const ok = rejectRequest(targetId);
      sendJson(res, 200, { ok: Boolean(ok) });
      return true;
    }
    if (action === "allow" || action === "reject" || action === "approve") {
      // La aprobacion de herramientas vive en el DOM de la GUI: el puente no
      // puede resolverla. Antes respondia {ok:true} sin hacer nada y el telefono
      // mostraba "Peticion aprobada" (falso). Se responde 501 para que el
      // cliente sepa que esa via no esta soportada.
      sendJson(res, 501, {
        ok: false,
        error: "not_implemented",
        detail: "La aprobación remota de herramientas no está soportada por el puente; apruébala en la GUI.",
        action,
        id: targetId,
      });
      return true;
    }
    sendJson(res, 400, { error: "Accion desconocida" });
    return true;
  }

  return false;
}

export async function handlePendingApprovalGate(req, res, { url, pathname, remoteAddress, context }) {
  const { bindHost, openPanelWindow } = context;

  // P47: con DSH_ACCESS_DISABLE=1 no hay clave de acceso, asi que el filtro de
  // abajo se saltaba por completo y ningun dispositivo refrescaba su lastSeen:
  // acababan caducando por TTL aunque se usaran a diario. Se refresca al
  // atender una peticion que trae una cookie de dispositivo valida. La
  // autorizacion no cambia (este modo solo se permite con enlace local).
  if (!accessKeyEnabled()) {
    const device = resolveDevice(req, res, remoteAddress);
    if (device && touchDevice(device)) res.setHeader("Set-Cookie", deviceCookieHeader(device.id));
    return false;
  }

  // P43: `DSH_COMPANION_TOKEN` es la credencial documentada de la API
  // `/dsh-companion/sync`. Este filtro de aprobacion no la conoce y respondia
  // 403 antes de llegar a la ruta; se deja pasar SOLO esa ruta, que vuelve a
  // validar el token (o una credencial verificable) por su cuenta.
  if (pathname === "/dsh-companion/sync" && isCompanionRequestTrusted(req)) return false;

  if (!hasValidAccessKey(req)) {
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
        return true;
      }

      sendJson(res, 403, { error: "Acceso pendiente de aprobacion", id: pending?.id ?? "" });
      return true;
    }

    if (touchDevice(device)) res.setHeader("Set-Cookie", deviceCookieHeader(device.id));
  }

  return false;
}
