/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
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
  isViewer,
  logReadOnlyRejection,
  onDeviceApproved,
  readCookie,
  rejectRequest,
  requestAccess,
  revokeAll,
  sendReadOnly,
  touchDevice,
} from "./devices.mjs";
import { isDocumentRequest, isSameOriginRequest, readBody, sendJson, sendText } from "./http.mjs";
import { log, warn } from "./log.mjs";
import { deniedKey, handleOpenPanel, isLocalRequest } from "./open-panel.mjs";
import { rejectedPage, waitingPage } from "./pairing.mjs";
import { consumeAllowance } from "./ratelimit.mjs";
import { terminateAllWsConnections } from "./proxy-ws.mjs";
import { invalidatePanelSessions } from "./panel-session.mjs";

const waitingClients = new Set();

// La frontera de privilegios locales y el boton "Abrir el panel" viven en
// open-panel.mjs (aqui solo se enrutan).

/**
 * H6: /pair-state sondea cada 700 ms y `requestAccess` guarda el registro con
 * fsync. Se persiste como mucho una vez por minuto por IP; entre medias basta
 * con no llamar (la solicitud sigue vigente: su TTL es de 15 min).
 */
const PAIR_STATE_PERSIST_INTERVAL_MS = 60 * 1000;
const pairStatePolls = new Map();

const shouldPersistPairState = (remoteAddress, userAgent) => {
  const now = Date.now();
  for (const [key, at] of pairStatePolls) {
    if (now - at > 30 * 60 * 1000) pairStatePolls.delete(key);
  }
  // IP + user-agent: dos clientes tras la misma IP no comparten la ventana.
  const key = `${normalizeAddress(remoteAddress || "desconocida")}|${String(userAgent || "").slice(0, 120)}`;
  if (now - (pairStatePolls.get(key) || 0) < PAIR_STATE_PERSIST_INTERVAL_MS) return false;
  pairStatePolls.set(key, now);
  return true;
};

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

export async function handlePairingRoutes(req, res, { url, pathname, remoteAddress, context, proxyHeaders = false }) {
  const { openPanelWindow } = context;

  if (pathname === "/pair" || pathname.startsWith("/pair/")) {
    if (isLocalRequest(remoteAddress, proxyHeaders)) {
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
      if (isDenied(remoteAddress, deniedKey(req, remoteAddress))) {
        sendJson(res, 200, { approved: false, rejected: true, pending: false });
        return true;
      }
      if (shouldPersistPairState(remoteAddress, req.headers["user-agent"])) requestAccess(remoteAddress, req.headers["user-agent"]);
    }

    sendJson(res, 200, { approved, rejected: false, pending: !approved });
    return true;
  }

  if (pathname === "/dsh-companion/pair-events" && req.method === "GET") {
    // El flujo de espera filtra el estado de aprobacion de cualquier IP. Solo lo
    // consume la propia computadora o un cliente ya autorizado.
    const paired = resolveDevice(req, res, remoteAddress);
    if (!paired && !hasValidAccessKey(req) && !isLocalRequest(remoteAddress, proxyHeaders)) {
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
    return handleOpenPanel(req, res, { remoteAddress, proxyHeaders, openPanelWindow });
  }

  if (pathname === "/dsh-companion/retry" && req.method === "POST") {
    // Borrar un rechazo y crear una solicitud nueva no debe poder hacerlo
    // cualquiera de la red: solo el propio equipo o un cliente autorizado.
    const paired = resolveDevice(req, res, remoteAddress);
    // D1: el boton "Pedir acceso de nuevo" de la pagina de rechazo lo pulsa el
    // telefono desde su propia IP, que en ese momento esta en `denied`. Se le
    // permite reintentar (con el mismo rate limit) porque solo borra su rechazo
    // y vuelve a la cola: el panel sigue decidiendo y no autoriza nada. Sin
    // estar rechazado, la ruta sigue exigiendo loopback o credencial.
    const denied = isDenied(remoteAddress, deniedKey(req, remoteAddress));
    if (!paired && !hasValidAccessKey(req) && !denied && !isLocalRequest(remoteAddress, proxyHeaders)) {
      sendJson(res, 403, { ok: false, error: "Acceso no autorizado" });
      return true;
    }
    if (!consumeAllowance(`retry:${remoteAddress}`, { capacity: 3, refillPerSecond: 0.05 })) {
      sendJson(res, 429, { ok: false });
      return true;
    }
    clearDenied(remoteAddress, deniedKey(req, remoteAddress));
    const { created } = requestAccess(remoteAddress, req.headers["user-agent"]);
    if (created && !proxyHeaders) openPanelWindow({ force: true });
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (pathname === "/dsh-companion/kill-switch" && req.method === "POST") {
    if (!consumeAllowance(`kill:${remoteAddress}`, { capacity: 5, refillPerSecond: 0.1 })) {
      sendJson(res, 429, { ok: false, error: "Demasiadas peticiones" });
      return true;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (device && isViewer(device)) {
      logReadOnlyRejection(device, req.method, pathname);
      sendReadOnly(res);
      return true;
    }
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
    // Ademas de revocar dispositivos se rota la clave maestra. H-01: rotar
    // devuelve un resultado explicito; con DSH_ACCESS_KEY no se puede rotar.
    let rotation = { rotated: false, reason: "error" };
    try {
      rotation = rotateAccessKey();
    } catch (error) {
      warn("pair", `No se pudo rotar la clave: ${error.message}`);
      rotation = { rotated: false, reason: "error" };
    }
    if (!rotation.rotated) {
      warn(
        "pair",
        rotation.reason === "env"
          ? "La clave de acceso viene de DSH_ACCESS_KEY (entorno): el kill switch no puede rotarla; cambiala y reinicia el puente."
          : rotation.reason === "disabled"
            ? "La clave de acceso esta desactivada (DSH_ACCESS_DISABLE=1): no hay clave que rotar."
            : "La rotacion de la clave de acceso fallo."
      );
    }
    log("pair", `Kill switch activado desde ${remoteAddress}: ${revokedCount} dispositivos revocados, ${wsClosed} tuneles WS terminados, clave rotada: ${rotation.rotated}${rotation.reason ? ` (${rotation.reason})` : ""}, sesiones de panel cerradas: ${panelSessionsClosed}`);
    sendJson(res, 200, {
      ok: true,
      revoked: revokedCount,
      rotated: rotation.rotated,
      rotationReason: rotation.reason,
      message: "Todos los dispositivos han sido revocados",
    });
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
    // accion queda reservada al propio equipo del host (loopback real, sin
    // cabeceras de proxy), que es donde vive el panel local; el telefono recibe
    // 403 y debe hacerlo desde la computadora. El panel de
    // 127.0.0.1:<panelPort>/pair no usa esta ruta: aplica las decisiones con su
    // propia sesion.
    if (!isLocalRequest(remoteAddress, proxyHeaders)) {
      log("pair", `Accion de dispositivos rechazada para ${remoteAddress}: solo desde el equipo del host`);
      sendJson(res, 403, { error: "Accion reservada al panel local de la computadora" });
      return true;
    }
    // Aprobar o rechazar herramientas y dispositivos es una escritura: un
    // dispositivo `viewer` no puede hacerlo ni siquiera desde el equipo host.
    const actionDevice = resolveDevice(req, res, remoteAddress);
    if (actionDevice && isViewer(actionDevice)) {
      logReadOnlyRejection(actionDevice, req.method, pathname);
      sendReadOnly(res);
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
      const result = approveRequest(targetId);
      sendJson(res, 200, { ok: result.ok, reason: result.reason || null });
      return true;
    }
    if (action === "reject_device") {
      const result = rejectRequest(targetId);
      sendJson(res, 200, { ok: result.ok, reason: result.reason || null });
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

/**
 * Puerta de aprobacion.
 *
 * Devuelve `true` si ella misma respondio (pagina de espera, JSON de pendiente)
 * o el dispositivo de la peticion cuando la deja pasar. `routes.mjs` usa ese
 * dispositivo para aplicar su perfil (rol y puerto destino) al proxy, incluida
 * la primera peticion en la que se canjea la cookie.
 */
export async function handlePendingApprovalGate(req, res, { url, pathname, remoteAddress, context, proxyHeaders = false }) {
  const { bindHost, openPanelWindow } = context;
  let requestDevice = null;

  // P47: con DSH_ACCESS_DISABLE=1 no hay clave de acceso, asi que el filtro de
  // abajo se saltaba por completo y ningun dispositivo refrescaba su lastSeen:
  // acababan caducando por TTL aunque se usaran a diario. Se refresca al
  // atender una peticion que trae una cookie de dispositivo valida. La
  // autorizacion no cambia (este modo solo se permite con enlace local).
  if (!accessKeyEnabled()) {
    requestDevice = resolveDevice(req, res, remoteAddress);
    if (requestDevice && touchDevice(requestDevice)) {
      res.setHeader("Set-Cookie", deviceCookieHeader(requestDevice.id));
    }
    return requestDevice;
  }

  // P43: `DSH_COMPANION_TOKEN` es la credencial documentada de la API
  // `/dsh-companion/sync`. Este filtro de aprobacion no la conoce y respondia
  // 403 antes de llegar a la ruta; se deja pasar SOLO esa ruta, que vuelve a
  // validar el token (o una credencial verificable) por su cuenta.
  if (pathname === "/dsh-companion/sync" && isCompanionRequestTrusted(req)) return null;

  if (!hasValidAccessKey(req)) {
    requestDevice = resolveDevice(req, res, remoteAddress);

    if (!requestDevice) {
      const { entry: pending, created, denied } = requestAccess(remoteAddress, req.headers["user-agent"]);
      if (created && !proxyHeaders) openPanelWindow();

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

    if (touchDevice(requestDevice)) res.setHeader("Set-Cookie", deviceCookieHeader(requestDevice.id));
  }

  return requestDevice;
}
