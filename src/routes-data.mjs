/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import { hasValidAccessKey, isCompanionRequestTrusted } from "./crypto.mjs";
import { touchDevice } from "./devices.mjs";
import { isJsonRequest, sendJson } from "./http.mjs";
import { resolveDevice } from "./routes-pairing.mjs";
import { handleAbsorbSatellite, handleGetChat, handleListChats, handleSync } from "./sync.mjs";

/**
 * Rutas de datos del puente: sincronizacion de conversaciones, absorcion de
 * notas satelite y API de solo lectura de conversaciones.
 *
 * Se extraen de routes.mjs para que el despachador general no mezcle el control
 * de estado/dispositivos con la persistencia. Devuelve true si atendio la
 * peticion; si devuelve false, routes.mjs sigue con el resto del despacho, en
 * el mismo orden relativo que tenia el bloque original.
 */
export async function handleDataRoutes(req, res, { url, pathname, remoteAddress }) {
  /**
   * P44: `/dsh-companion/sync` no tiene llamador dentro del repositorio (ningun
   * modulo de `src/` lo invoca). Se conserva a proposito como API publica para
   * terceros: scripts y herramientas del usuario que vuelcan conversaciones a
   * `synced_chats/`, tal como lo documentan los README y lo ejercitan las
   * pruebas del repo. Borrarla romperia ese contrato sin ganar seguridad: la
   * ruta exige las mismas credenciales verificables que el resto del puente.
   * La API de solo lectura (`/dsh-companion/chats` y `/dsh-companion/chat/:id`)
   * queda intacta.
   */
  if (pathname === "/dsh-companion/sync") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "POST" });
      return true;
    }
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Se requiere Content-Type application/json" });
      req.resume();
      return true;
    }
    // P43: con DSH_COMPANION_TOKEN configurado se exigia SOLO ese token, que
    // ningun cliente del repo envia (los clientes reales se autentican con la
    // cookie de dispositivo o la clave de acceso), asi que /sync respondia 401
    // a peticiones legitimas. Se aceptan las credenciales verificables y el
    // token compartido queda como via adicional. `isCompanionRequestTrusted`
    // es fail-closed: sin token configurado devuelve false.
    const syncDevice = resolveDevice(req, res, remoteAddress);
    const syncAuthorized = Boolean(syncDevice) || hasValidAccessKey(req) || isCompanionRequestTrusted(req);
    if (!syncAuthorized) {
      sendJson(res, 401, { error: "Token o credenciales ausentes o invalidos" });
      return true;
    }
    // P47: una sincronizacion autenticada tambien cuenta como uso del
    // dispositivo, igual que el resto de peticiones autorizadas.
    if (syncDevice) touchDevice(syncDevice);
    await handleSync(req, res, remoteAddress);
    return true;
  }

  if (pathname === "/dsh-companion/absorb-satellite") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "POST" });
      return true;
    }
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Se requiere Content-Type application/json" });
      req.resume();
      return true;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req) && !isCompanionRequestTrusted(req)) {
      sendJson(res, 401, { error: "Token o credenciales ausentes o invalidos" });
      return true;
    }
    await handleAbsorbSatellite(req, res, remoteAddress);
    return true;
  }

  if (pathname === "/dsh-companion/chats") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD" });
      return true;
    }
    await handleListChats(req, res, remoteAddress);
    return true;
  }

  if (pathname.startsWith("/dsh-companion/chat/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD" });
      return true;
    }
    const id = pathname.slice("/dsh-companion/chat/".length).trim();
    const format = url.searchParams.get("format") || (req.headers.accept?.includes("text/markdown") ? "md" : "json");
    await handleGetChat(req, res, id, remoteAddress, format);
    return true;
  }

  return false;
}
