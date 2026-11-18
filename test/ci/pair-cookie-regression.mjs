/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Regresion 5.4.1 del emparejamiento, compartida por verify_panel.mjs (asi ese
 * archivo no pasa del limite de 400 lineas del proyecto):
 *
 *  a) El WebView pierde la cookie de dispositivo entre el canje y la navegacion
 *     (navega antes de guardar la que trae el sondeo). Dos sondeos seguidos de
 *     la MISMA IP + user-agent sin cookie deben reconocer el dispositivo ya
 *     aprobado, re-emitir la cookie (tambien en la respuesta de navegacion) y no
 *     crear solicitudes nuevas: antes el panel pedia autorizar otra vez 4 s
 *     despues y se acumulaban dispositivos duplicados.
 *  b) Si aun asi llega una solicitud duplicada del mismo equipo (registros de
 *     versiones anteriores), aprobarla reutiliza el dispositivo existente.
 */
import fs from "node:fs";

const readRegistry = (registryPath) => {
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
};

const deviceCookieOf = (response, deviceId) =>
  (response.setCookie || []).find((value) => value.startsWith(`dsh-companion-device=${deviceId};`)) || "";

/** `ctx`: { call, check, BRIDGE, PANEL, OWN_AGENT, deviceId, panelCookie, REGISTRY } */
export async function runPairCookieRegression(ctx) {
  const { call, check, BRIDGE, PANEL, OWN_AGENT, deviceId, panelCookie, REGISTRY } = ctx;
  const headers = { "user-agent": OWN_AGENT };

  const lossPoll1 = await call(BRIDGE, "/dsh-companion/pair-state", { headers });
  const lossPoll2 = await call(BRIDGE, "/dsh-companion/pair-state", { headers });
  const lossNav = await call(BRIDGE, "/", {
    headers: { ...headers, accept: "text/html", "sec-fetch-dest": "document" },
  });
  const cookie1 = Boolean(deviceCookieOf(lossPoll1, deviceId));
  const cookie2 = Boolean(deviceCookieOf(lossPoll2, deviceId));
  const cookieNav = Boolean(deviceCookieOf(lossNav, deviceId));
  check(
    "regresion perdida de cookie: pair-state reconoce el dispositivo aprobado y re-emite la cookie",
    lossPoll1.body.includes('"approved":true') && lossPoll2.body.includes('"approved":true') && cookie1 && cookie2,
    `poll1=${lossPoll1.body.slice(0, 60)} poll2=${lossPoll2.body.slice(0, 60)} cookie1=${cookie1} cookie2=${cookie2}`
  );
  check(
    "regresion perdida de cookie: la navegacion entra a la app y recibe Set-Cookie del dispositivo",
    lossNav.status === 200 && !lossNav.body.includes("Acceso pendiente") && cookieNav,
    `status=${lossNav.status} espera=${lossNav.body.includes("Acceso pendiente")} cookie=${cookieNav}`
  );

  if (!REGISTRY) {
    console.log("SKIP  comprobaciones del registro tras perder la cookie: DSH_HOME no es una instancia aislada");
    return;
  }
  const afterLoss = readRegistry(REGISTRY);
  check(
    "regresion perdida de cookie: 0 solicitudes nuevas y 1 solo dispositivo",
    afterLoss && afterLoss.devices.length === 1 && afterLoss.pending.length === 0,
    afterLoss ? `devices=${afterLoss.devices.length} pending=${afterLoss.pending.length}` : "registro ilegible"
  );

  const ownDevice = afterLoss && afterLoss.devices.find((row) => row.id === deviceId);
  if (!ownDevice) {
    console.log("SKIP  comprobacion de aprobacion duplicada: no se localizo el dispositivo propio");
    return;
  }
  afterLoss.pending.push({
    id: "qa-dup-request",
    code: "4321",
    address: ownDevice.address,
    agent: ownDevice.agent,
    requestedAt: new Date().toISOString(),
    claimToken: "qa-dup-token-0123456789",
  });
  fs.writeFileSync(REGISTRY, JSON.stringify(afterLoss, null, 2));
  // Deja que el puente recargue el registro por mtime/tamano antes de aprobar.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const duplicateApprove = await call(PANEL, "/pair/approve", {
    method: "POST", cookie: panelCookie, body: "id=qa-dup-request",
  });
  const afterDuplicate = readRegistry(REGISTRY);
  check(
    "regresion duplicados: aprobar una solicitud repetida reutiliza el dispositivo (no crea otro)",
    duplicateApprove.status === 303 && afterDuplicate &&
      afterDuplicate.devices.length === 1 && afterDuplicate.pending.length === 0 &&
      afterDuplicate.devices[0].id === deviceId,
    afterDuplicate
      ? `devices=${afterDuplicate.devices.length} pending=${afterDuplicate.pending.length} mismoId=${afterDuplicate.devices[0]?.id === deviceId}`
      : "registro ilegible"
  );
}
