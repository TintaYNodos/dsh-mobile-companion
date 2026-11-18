/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * "Abrir el panel en la computadora" y la frontera de privilegios locales.
 *
 * El panel escucha solo en loopback, asi que un telefono que aun no esta
 * aprobado no puede abrirlo por si mismo: la pantalla de espera le ofrece este
 * boton para que la ventana salte en el escritorio del host.
 *
 * Reglas:
 *  - loopback real (nunca detras de un proxy) puede pedirlo siempre;
 *  - un cliente remoto solo si SU solicitud de acceso sigue pendiente;
 *  - cualquier otro cliente de la red recibe 403.
 *
 * Es un modulo aparte para que routes-pairing.mjs respete el limite de 400
 * lineas y para poder probar esta frontera sin arrastrar todo el enrutado.
 */
import { findPairedDevice, isDenied, pendingRequests, readClaimToken } from "./devices.mjs";
import { sendJson } from "./http.mjs";
import { log } from "./log.mjs";
import { normalizeAddress } from "./network.mjs";
import { consumeAllowance } from "./ratelimit.mjs";

/**
 * H1: un privilegio de loopback (panel, aprobacion, retry, pair-events) solo se
 * concede si la conexion viene de verdad del propio equipo. Detras de un proxy
 * o tunel el socket tambien es 127.0.0.1, pero el cliente es remoto: ahi no hay
 * privilegios locales ni con DSH_ALLOW_PROXY_ACCESS=1.
 */
export const isLocalRequest = (remoteAddress, proxyHeaders) =>
  !proxyHeaders && normalizeAddress(remoteAddress).startsWith("127.");

// H-08: clave de una peticion concreta (token de canje o IP + user-agent), nunca
// la IP sola: un rechazo no debe bloquear a otros equipos detras del mismo NAT.
export const deniedKey = (req, remoteAddress) => ({
  address: remoteAddress,
  claimToken: readClaimToken(req) || "",
  agent: String(req.headers?.["user-agent"] || "").slice(0, 120),
});

/**
 * True si esta misma peticion (token de canje o IP+agente) tiene solicitud viva.
 * Lo usa tambien la pantalla de espera (`pair-state`): si el kill switch borro
 * su solicitud, el siguiente sondeo debe crearla de nuevo aunque la escritura
 * del registro este limitada a una por minuto.
 */
export const hasPendingRequestFor = (req, remoteAddress) => {
  const token = readClaimToken(req);
  const agent = String(req.headers?.["user-agent"] || "").slice(0, 120);
  const address = normalizeAddress(remoteAddress);
  return pendingRequests().some((entry) => {
    if (token && entry.claimToken === token) return true;
    return normalizeAddress(entry.address) === address && String(entry.agent || "").slice(0, 120) === agent;
  });
};

/**
 * Atiende POST /dsh-companion/open-panel. Devuelve true (ruta atendida) siempre.
 */
export const handleOpenPanel = (req, res, { remoteAddress, proxyHeaders, openPanelWindow }) => {
  const local = isLocalRequest(remoteAddress, proxyHeaders);
  const pending = !local && hasPendingRequestFor(req, remoteAddress);
  if (!local && !pending) {
    sendJson(res, 403, { ok: false, error: "Solo disponible desde la computadora" });
    return true;
  }
  if (!consumeAllowance(`open:${remoteAddress}`, { capacity: 3, refillPerSecond: 0.05 })) {
    sendJson(res, 429, { ok: false, error: "Espera un momento" });
    return true;
  }
  if (pending) {
    log("pair", `Apertura del panel pedida desde ${normalizeAddress(remoteAddress)} (solicitud pendiente)`);
  }
  // force: el boton debe abrir aunque la ventana automatica de la solicitud
  // acabara de fallar; el rate limit de arriba (3 y luego 1/20 s) evita rafagas.
  const hasRequest = pending || (!isDenied(remoteAddress, deniedKey(req, remoteAddress)) && !findPairedDevice(req));
  sendJson(res, 200, { ok: hasRequest ? openPanelWindow({ force: true }) : false });
  return true;
};
