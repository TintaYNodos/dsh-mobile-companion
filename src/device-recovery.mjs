/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Recuperacion de un dispositivo YA aprobado cuando la peticion llega sin la
 * cookie `dsh-companion-device`.
 *
 * Regresion 5.4.1: la navegacion que sigue a la aprobacion puede llegar sin la
 * cookie. El WebView la recibe en la respuesta del sondeo `pair-state` y navega
 * a la app en el mismo instante; en Android la navegacion gana la carrera y la
 * cookie no llega a guardarse. Antes esa peticion se trataba como un equipo
 * nuevo (`claimApprovedDevice` solo canjea dispositivos con `claimed !== true`)
 * y volvia a la cola: el panel pedia autorizar otra vez 4 s despues y cada
 * aprobacion creaba otro dispositivo duplicado.
 *
 * Vive aparte de devices.mjs para que ese modulo quede por debajo del limite de
 * 400 lineas del proyecto.
 */
import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { loadRegistry, saveRegistry } from "./registry.mjs";
import { isDenied, normalize, readClaimToken } from "./device-claim.mjs";
import { hasProxyHeaders } from "./http.mjs";

/**
 * Un dispositivo caduca si lleva mas de `deviceTtlDays` sin aparecer. Antes el
 * TTL solo alimentaba el Max-Age de la cookie: el servidor aceptaba para
 * siempre a un dispositivo de hace meses porque solo comparaba el id.
 */
export const isDeviceExpired = (device) => {
  if (!device) return true;
  const stamp = device.lastSeen || device.lastRefresh || device.approvedAt;
  const seen = stamp ? new Date(stamp).getTime() : 0;
  if (!seen) return true;
  const ttlMs = config.deviceTtlDays * 24 * 60 * 60 * 1000;
  return Date.now() - seen > ttlMs;
};

const deviceStamp = (device) => {
  const stamp = Date.parse(device?.lastSeen || device?.lastRefresh || device?.approvedAt || 0);
  return Number.isFinite(stamp) ? stamp : 0;
};

const matchesRequest = (device, address, agent) =>
  !isDeviceExpired(device) &&
  normalize(device.address) === address &&
  String(device.agent || "").slice(0, 120) === agent;

/** El dispositivo aprobado mas reciente de esa direccion + user-agent, o null. */
const newestMatch = (devices, address, agent) =>
  devices.filter((device) => matchesRequest(device, address, agent))
    .sort((left, right) => deviceStamp(right) - deviceStamp(left))[0] || null;

const RECOVERED_LOG_INTERVAL_MS = 60 * 1000;
const recoveredLogAt = new Map();

const noteRecoveredDevice = (device) => {
  const now = Date.now();
  for (const [id, at] of recoveredLogAt) {
    if (now - at > 30 * 60 * 1000) recoveredLogAt.delete(id);
  }
  if (now - (recoveredLogAt.get(device.id) || 0) < RECOVERED_LOG_INTERVAL_MS) return;
  recoveredLogAt.set(device.id, now);
  log("pair", `Dispositivo ya aprobado reconocido sin cookie (misma direccion y user-agent): ${device.address}`);
};

/**
 * Si YA hay un dispositivo aprobado de la MISMA direccion y el MISMO user-agent,
 * lo devuelve para que `resolveDevice` re-emita su cookie en la respuesta que ve
 * el WebView, sin crear solicitud nueva.
 *
 * Seguridad: nunca se decide por la IP sola. Hacen falta direccion + `agent`
 * identicos (dos equipos tras el mismo NAT se distinguen por su user-agent) y un
 * dispositivo no caducado. Un `denied` de ESTA peticion no se reutiliza jamas.
 */
export function findApprovedDeviceByAddressAndAgent(req, remoteAddress) {
  const address = normalize(remoteAddress || "");
  const agent = String(req?.headers?.["user-agent"] || "").slice(0, 120);
  // Sin user-agent no hay identidad suficiente: la IP sola no autoriza. Detras
  // de un proxy/tunel el socket siempre es 127.0.0.1, asi que la direccion no
  // identifica al equipo y no se reutiliza nada (fail-closed).
  if (!address || !agent || hasProxyHeaders(req)) return null;

  const current = loadRegistry();
  if (isDenied(address, { claimToken: readClaimToken(req) || "", agent })) return null;

  const device = newestMatch(current.devices, address, agent);
  if (!device) return null;

  // Duplicados de versiones anteriores: se reutiliza el mas reciente. No se
  // borran automaticamente: con el mismo modelo de telefono tras el mismo NAT
  // podrian ser equipos distintos; la limpieza es una accion del panel.
  // Una solicitud pendiente de este mismo equipo ya no tiene sentido: el
  // dispositivo existe y esta aprobado. Las de OTRO agente detras de la misma IP
  // se conservan (nunca se decide por IP sola).
  const before = current.pending.length;
  current.pending = current.pending.filter(
    (entry) => !(normalize(entry.address) === address && String(entry.agent || "").slice(0, 120) === agent)
  );
  if (current.pending.length !== before) {
    saveRegistry();
    log("pair", `Solicitud pendiente obsoleta descartada: ${address} ya tiene dispositivo aprobado`);
  }

  noteRecoveredDevice(device);
  return device;
}

/**
 * Regresion 5.4.1: aprobar una segunda solicitud del MISMO equipo (la carrera de
 * la cookie descrita arriba) no debe crear un dispositivo duplicado. Si ya
 * existe uno aprobado con la misma direccion y user-agent se reutiliza,
 * conservando id, nombre, rol y backend que el usuario ya habia elegido, y se le
 * entrega el canje nuevo (`claimToken`/`code`) para que reciba su cookie.
 */
export function reuseApprovedDevice(current, entry) {
  const agent = String(entry?.agent || "").slice(0, 120);
  const address = normalize(entry?.address || "");
  if (!agent || !address) return null;
  const device = newestMatch(current.devices, address, agent);
  if (!device) return null;
  device.claimToken = entry.claimToken || null;
  device.code = entry.code || "";
  device.approvedAt = new Date().toISOString();
  device.claimed = false;
  return device;
}
