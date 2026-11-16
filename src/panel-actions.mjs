/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import { config } from "./config.mjs";
import { discoverListeningPorts, probeDshPort, resolveTargetPort } from "./network.mjs";
import { escapeHtml } from "./pairing-views.mjs";
import {
  approveRequest,
  clearHistory,
  isValidDeviceTargetPort,
  rejectRequest,
  removeDevice,
  renameDevice,
  revokeAll,
  setDeviceRole,
  setDeviceTarget,
} from "./devices.mjs";

/**
 * Acciones y controles del panel local.
 *
 * Se separan de panel.mjs, que solo atiende HTTP, para no pasar del limite de
 * 400 lineas por archivo. `runPanelAction` corre SOLO con una sesion de panel
 * valida (panel.mjs ya lo comprueba antes): los perfiles de dispositivo se
 * administran desde la computadora, nunca desde el telefono.
 */

const EXTRA_FLASH = new Map([
  ["role-full", ["Rol actualizado: control total. Puede escribir y aprobar herramientas.", ""]],
  ["role-viewer", ["Rol actualizado: solo lectura. El puente rechazara sus escrituras con 403.", ""]],
  ["role-invalid", ["Rol no valido: usa control total o solo lectura.", "bad"]],
  ["target-set", ["Puerto destino guardado y comprobado: ese backend responde.", ""]],
  ["target-clear", ["Puerto destino borrado: el dispositivo usa el backend por defecto.", ""]],
  ["target-down", ["Ese puerto no responde como DeepSeek Harness. No se guardo el cambio.", "bad"]],
  ["target-invalid", ["Puerto no valido: entre 1024 y 65535 y distinto de los del puente y el panel.", "bad"]],
]);

/**
 * Ejecuta una accion del panel y devuelve el codigo de flash, o `null` si la
 * ruta no es una accion conocida. Es async porque `set-target` sonda el puerto.
 */
export async function runPanelAction(pathname, form) {
  const id = form.get("id") || "";

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
    case "/pair/set-role": {
      const role = String(form.get("role") || "");
      if (role !== "full" && role !== "viewer") return "role-invalid";
      if (!setDeviceRole(id, role)) return "missing";
      return role === "viewer" ? "role-viewer" : "role-full";
    }
    case "/pair/set-target": {
      const raw = String(form.get("targetPort") ?? "").trim();
      if (raw === "") return setDeviceTarget(id, null).ok ? "target-clear" : "missing";
      if (!/^\d{1,5}$/.test(raw)) return "target-invalid";
      const port = Number.parseInt(raw, 10);
      if (!isValidDeviceTargetPort(port)) return "target-invalid";
      // Aviso si el puerto no responde; no se guarda un destino muerto.
      const alive = await probeDshPort(port, config.targetHost, 500);
      if (!alive) return "target-down";
      return setDeviceTarget(id, port).ok ? "target-set" : "missing";
    }
    default:
      return null;
  }
}

let cachedPorts = { at: 0, ports: [] };
const TARGET_CHOICES_TTL_MS = 60_000;
const TARGET_CHOICES_LIMIT = 24;

/**
 * Puertos sugeridos para el backend de un dispositivo. D5: primero el backend
 * activo, el configurado y los candidatos de Harness; despues los puertos de
 * `netstat` ordenados. Antes solo se veian los 12 primeros del orden de
 * `netstat` y el puerto real podia quedar fuera de la lista.
 */
export async function listTargetPortChoices() {
  if (Date.now() - cachedPorts.at < TARGET_CHOICES_TTL_MS) return cachedPorts.ports;
  let current = config.targetPort;
  try {
    current = await resolveTargetPort();
  } catch {
    current = config.targetPort;
  }
  let discovered = [];
  try {
    discovered = await discoverListeningPorts();
  } catch {
    discovered = [];
  }
  const ports = [];
  const add = (port) => {
    if (Number.isInteger(port) && isValidDeviceTargetPort(port) && !ports.includes(port)) ports.push(port);
  };
  add(current);
  add(config.targetPort);
  for (const port of config.targetCandidates) add(port);
  for (const port of [...discovered].sort((left, right) => left - right)) add(port);
  cachedPorts = { at: Date.now(), ports: ports.slice(0, TARGET_CHOICES_LIMIT) };
  return cachedPorts.ports;
}

const SELECT_STYLE =
  "font:inherit;font-size:13px;padding:9px 10px;border-radius:8px;border:1px solid var(--line-strong);" +
  "background:var(--bg);color:var(--ink)";

const deviceControls = (device, label) => {
  const id = escapeHtml(device.id);
  const role = device.role === "viewer" ? "viewer" : "full";
  const target = device.targetPort === null || device.targetPort === undefined ? "" : String(device.targetPort);
  return `<div class="actions" style="gap:6px;margin-top:8px">
      <form method="post" action="/pair/set-role" class="actions" style="gap:6px">
        <input type="hidden" name="id" value="${id}">
        <select name="role" aria-label="Rol de ${label}" style="${SELECT_STYLE}">
          <option value="full"${role === "full" ? " selected" : ""}>Control total</option>
          <option value="viewer"${role === "viewer" ? " selected" : ""}>Solo lectura</option>
        </select>
        <button type="submit" aria-label="Guardar el rol de ${label}">Guardar rol</button>
      </form>
      <form method="post" action="/pair/set-target" class="actions" style="gap:6px">
        <input type="hidden" name="id" value="${id}">
        <input type="text" name="targetPort" value="${escapeHtml(target)}" inputmode="numeric" maxlength="5"
               placeholder="puerto por defecto" list="dsh-target-ports"
               aria-label="Puerto destino de ${label}">
        <button type="submit" aria-label="Guardar el puerto destino de ${label}">Guardar puerto</button>
      </form>
    </div>`;
};

/**
 * Añade al HTML del panel los controles de perfil por dispositivo.
 *
 * El render de la pagina vive en pairing-views.mjs (fuera de este cambio), asi
 * que se inyecta el bloque nuevo justo antes del formulario de revocar de cada
 * tarjeta, conservando el orden en que el panel entrego los dispositivos.
 */
export async function renderPanelBody(html, { devices = [], flash = "" } = {}) {
  const ports = await listTargetPortChoices();
  let body = html;

  const extra = EXTRA_FLASH.get(flash);
  if (extra) {
    body = body.replace(
      /(<div class="wrap">)/,
      `$1<div class="flash ${extra[1]}" role="status">${escapeHtml(extra[0])}</div>`
    );
  }

  const datalist = `<datalist id="dsh-target-ports">${ports
    .map((port) => `<option value="${port}"></option>`)
    .join("")}</datalist>`;
  const note =
    `<p class="hint" style="margin:6px 0 10px">Rol: <b>control total</b> puede escribir y aprobar; ` +
    `<b>solo lectura</b> no. Puerto destino vacio = backend por defecto del puente; ` +
    `un puerto fijo permite apuntar este dispositivo a otra instancia de DeepSeek Harness.</p>` +
    datalist;
  body = body.replace("<h2>Dispositivos autorizados</h2>", `<h2>Dispositivos autorizados</h2>${note}`);

  let index = 0;
  body = body.replace(/<form method="post" action="\/pair\/revoke-device">/g, (match) => {
    const device = devices[index];
    index += 1;
    if (!device) return match;
    const label = escapeHtml(device.name || device.address || "dispositivo");
    return deviceControls(device, label) + match;
  });

  return body;
}
