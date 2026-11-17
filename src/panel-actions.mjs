/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import http from "node:http";
import { config } from "./config.mjs";
import { resolveAccessKey } from "./crypto.mjs";
import { discoverListeningPorts, probeDshPort, resolveTargetPort } from "./network.mjs";
import { escapeHtml } from "./pairing-views.mjs";
import { NOTE_STATUS_LABELS, NOTE_TYPE_LABELS } from "./notes-format.mjs";
import { listInboxNotes } from "./notes-store.mjs";
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
 * Seccion "Notas recibidas" del panel.
 *
 * El panel no comparte credenciales con el telefono, pero corre en el mismo
 * proceso que el puente: pide `GET /dsh-companion/notes` por loopback con la
 * clave de acceso efectiva (HTTP Basic), que es como el puente autoriza a la
 * propia PC. Si esa lectura fallara (por ejemplo con DSH_ACCESS_DISABLE=1 y el
 * puente sin clave), se cae a leer la bandeja directamente: el panel ya exige
 * su propia sesion, asi que no se expone nada nuevo.
 */
const PANEL_NOTES_LIMIT = 10;
const PANEL_NOTES_TIMEOUT_MS = 1500;

const notesAuthHeader = () => {
  let key = "";
  try {
    key = resolveAccessKey();
  } catch {
    key = "";
  }
  if (!key) return {};
  return { authorization: `Basic ${Buffer.from(`dsh:${key}`, "utf8").toString("base64")}` };
};

const fetchNotesForPanel = () =>
  new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: config.listenPort,
        path: "/dsh-companion/notes",
        method: "GET",
        headers: notesAuthHeader(),
        agent: false,
        timeout: PANEL_NOTES_TIMEOUT_MS,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          if (response.statusCode !== 200) return done(null);
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            done(Array.isArray(parsed?.notes) ? parsed.notes : null);
          } catch {
            done(null);
          }
        });
      }
    );
    request.on("timeout", () => {
      request.destroy();
      done(null);
    });
    request.on("error", () => done(null));
    request.end();
  });

const panelNotes = async () => {
  const fetched = await fetchNotesForPanel();
  if (fetched) return fetched;
  try {
    return listInboxNotes();
  } catch {
    return [];
  }
};

/** Etiqueta legible: "reunion" / "en-progreso" / "en_progreso" -> "Reunion" / "En progreso". */
const humanizeLabel = (value) => {
  const text = String(value ?? "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Valor canonico del telefono -> etiqueta en espanol. `humanizeLabel` queda
 * como reserva para valores desconocidos (texto libre de versiones futuras).
 */
const noteLabel = (table, value) => table.get(String(value ?? "").trim().toLowerCase()) || humanizeLabel(value);

const pad2 = (value) => String(value).padStart(2, "0");

/** Marca ISO -> fecha local `dd/mm/aaaa hh:mm`; "" si no es una fecha valida. */
const localDateTime = (value) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

/** `AAAA-MM-DD` -> `dd/mm/aaaa` sin desplazamientos de zona horaria. */
const localDueDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

/**
 * Fila de una nota: titulo y metadatos legibles. El tipo y el estado se
 * traducen del valor canonico del telefono al espanol, la fecha se muestra en
 * local y el vencimiento humanizado. Cada campo se escapa UNA sola vez, ya al
 * final, para que "I+D & Socios" quede como `I+D &amp; Socios` (no `&amp;amp;`).
 */
const noteSummaryRow = (note) => {
  const title = escapeHtml(note.title || note.file || "nota");
  const type = escapeHtml(noteLabel(NOTE_TYPE_LABELS, note.type) || "Sin tipo");
  const due = localDueDate(note.dueDate);
  const meta = [
    note.project || "Sin proyecto",
    noteLabel(NOTE_STATUS_LABELS, note.status),
    localDateTime(note.receivedAt || note.createdAt),
    due ? `Vence ${due}` : "",
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" &middot; ");
  return `<li><span class="tag muted">${type}</span>
      <span><b>${title}</b><br><span class="meta">${meta}</span></span></li>`;
};

/** Bloque de solo lectura con las ultimas PANEL_NOTES_LIMIT notas recibidas. */
const renderNotesSection = (notes) => {
  const list = Array.isArray(notes) ? notes.slice(0, PANEL_NOTES_LIMIT) : [];
  const rows = list.length
    ? `<ul class="events">${list.map(noteSummaryRow).join("")}</ul>`
    : `<div class="card empty">Todavia no hay notas recibidas del telefono.</div>`;
  const endpoint = `http://127.0.0.1:${config.listenPort}/dsh-companion/notes`;
  return `<p class="hint" style="margin:6px 0 10px">Ultimas ${PANEL_NOTES_LIMIT} notas del telefono, solo lectura.
      JSON completo (requiere credencial): <a href="${escapeHtml(endpoint)}" style="color:var(--accent-glow)">${escapeHtml(endpoint)}</a></p>${rows}`;
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

  // Notas recibidas: se inyectan antes del pie, al final de la pagina del panel.
  const notes = await panelNotes();
  body = body.replace("<footer>", `<h2>Notas recibidas</h2>${renderNotesSection(notes)}<footer>`);

  return body;
}
