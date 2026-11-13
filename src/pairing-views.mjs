/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import { config } from "./config.mjs";

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const SHELL_CSS = `
:root{color-scheme:dark light;
--bg:#0a0e17;--raised:#121826;--line:#1e293b;--line-strong:#475569;
--ink:#f8fafc;--dim:#94a3b8;--accent:#2563eb;--accent-glow:#38bdf8;--accent-ink:#ffffff;
--ok:#10b981;--warn:#f59e0b;--danger:#ef4444;--focus:#38bdf8;
--ok-bg:#062820;--danger-bg:#261418}
@media (prefers-color-scheme:light){
:root{--bg:#ffffff;--raised:#f7f8fa;--line:#e3e5e9;--line-strong:#8b9099;
--ink:#0f1115;--dim:#61666b;--ok:#047857;--warn:#92400e;--danger:#b91c1c;--focus:#005f66;
--ok-bg:#e2f7f0;--danger-bg:#fde9e9}}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100dvh;background:var(--bg);color:var(--ink);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
-webkit-tap-highlight-color:transparent;
padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
.wrap{max-width:620px;margin:0 auto;padding:28px 18px 48px}
header.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mark{width:38px;height:38px;border-radius:11px;background:linear-gradient(160deg,#171b24,#090a0e);
border:1px solid var(--line);display:grid;place-items:center;flex:0 0 auto}
.mark svg{width:24px;height:24px}
.brand h1{font-size:17px;letter-spacing:-.2px;line-height:1.2}
.brand p{font-size:12px;color:var(--dim)}
h2{font-size:12px;letter-spacing:.8px;margin:26px 0 10px;color:var(--dim);text-transform:uppercase}
p{color:var(--dim)}
.lead{color:var(--ink);font-size:14.5px}
.hint{font-size:12.5px;color:var(--dim);margin-top:10px}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.chip{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);
background:var(--raised);font-size:12px;font-weight:600;color:var(--dim)}
.chip b{color:var(--ink)}
.chip .dot{width:7px;height:7px;border-radius:50%;background:var(--accent)}
.flash{margin:0 0 16px;padding:11px 14px;border-radius:10px;font-size:13px;font-weight:600;
border:1px solid var(--ok);background:var(--ok-bg);color:var(--ok)}
.flash.bad{border-color:var(--danger);background:var(--danger-bg);color:var(--danger)}
article.card{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--raised);margin-bottom:10px}
.row{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
.who{font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.state{font-size:11px;font-weight:600;color:var(--dim)}
.state.on{color:var(--ok)}
.code{font-size:12px;font-weight:800;letter-spacing:2px;padding:2px 8px;border-radius:6px;
border:1px solid var(--accent);color:var(--accent);font-variant-numeric:tabular-nums}
.meta{font-size:12px;color:var(--dim);margin-top:3px;line-height:1.5}
.live{width:7px;height:7px;border-radius:50%;background:var(--dim);flex:0 0 auto}
.live.on{background:var(--ok)}
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button{font:inherit;font-weight:700;font-size:12.5px;padding:10px 14px;border-radius:8px;
border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);cursor:pointer;touch-action:manipulation}
button.ok{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
button.no{color:var(--danger);border-color:var(--danger)}
button.link{background:transparent;border-color:transparent;color:var(--dim);font-weight:600;padding:10px 4px}
button.link:hover{color:var(--ink)}
button.wide{width:100%;margin-top:16px;padding:14px;font-size:14px;border-radius:10px}
button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
input[type=text]{font:inherit;font-size:13px;padding:9px 10px;border-radius:8px;
border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);min-width:0;flex:1 1 130px}
input[type=text]:focus{border-color:var(--focus)}
input[type=text]:focus-visible{outline:3px solid var(--focus);outline-offset:1px}
.empty{text-align:center;padding:22px 12px;color:var(--dim);font-size:13px}
.events{list-style:none}
.events li{display:flex;gap:10px;align-items:baseline;padding:8px 0;font-size:12.5px;border-bottom:1px solid var(--line)}
.events li:last-child{border-bottom:none}
.events .tag{font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;flex:0 0 96px}
.tag.ok{color:var(--ok)}.tag.warn{color:var(--warn)}.tag.bad{color:var(--danger)}.tag.muted{color:var(--dim)}
.events .at{margin-left:auto;color:var(--dim);font-size:11px;white-space:nowrap}
footer{margin-top:26px;font-size:11.5px;color:var(--dim);text-align:center}
details.more{margin-top:16px;font-size:12.5px;color:var(--dim)}
details.more summary{cursor:pointer;padding:6px 0}
details.more summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:var(--ink)}
@media (prefers-reduced-motion:no-preference){.pulse{animation:pulse 1.8s infinite}}
@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
`.trim();

export const MARK = `<svg viewBox="0 0 108 108" aria-hidden="true">
<path d="M54 10 L76 45 A26 26 0 1 1 32 45 Z" fill="none" stroke="#00f0ff" stroke-width="7" stroke-linejoin="round"/>
<circle cx="54" cy="52" r="6" fill="#00f0ff"/><circle cx="42" cy="72" r="5" fill="#7c3aed"/>
<circle cx="66" cy="72" r="5" fill="#7c3aed"/>
<path d="M54 52 L42 72 M54 52 L66 72 M42 72 L66 72" stroke="#00f0ff" stroke-width="3" opacity=".6"/></svg>`;

export const page = (title, body, extraHead = "") => `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b0d12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<title>${escapeHtml(title)}</title><style>${SHELL_CSS}</style>${extraHead}</head>
<body><div class="wrap">${body}</div></body></html>`;

export const brand = (title, subtitle) =>
  `<header class="brand"><div class="mark">${MARK}</div>
     <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div></header>`;

const EVENT_LABEL = new Map([
  ["approve", ["Autorizado", "ok"]],
  ["reject", ["Rechazado", "warn"]],
  ["revoke", ["Revocado", "bad"]],
  ["revoke-all", ["Todos revocados", "bad"]],
  ["rename", ["Renombrado", "muted"]],
]);

const FLASH = new Map([
  ["approve", ["Listo: autorizaste este dispositivo.", ""]],
  ["reject", ["Solicitud rechazada. El teléfono puede volver a pedir acceso.", ""]],
  ["revoke", ["Dispositivo revocado.", ""]],
  ["revoke-all", ["Se revocaron todos los dispositivos.", ""]],
  ["rename", ["Nombre actualizado.", ""]],
  ["cleared", ["Historial limpiado.", ""]],
  ["expired", ["No se pudo completar: esa solicitud ya no estaba vigente.", "bad"]],
  ["missing", ["No se pudo completar: el dispositivo o la solicitud ya no existe.", "bad"]],
  ["failed", ["No se pudo guardar el cambio. Revisa que el disco esté disponible.", "bad"]],
]);

export const stateStamp = ({ pending = [], devices = [], events = [] } = {}) =>
  [
    pending.map((entry) => entry.id).join(","),
    devices.map((device) => `${device.id}:${device.name}:${device.online ? 1 : 0}`).join(","),
    events.length,
    events[0]?.at || "",
  ].join("|");

export function approvalPage({ pending = [], devices = [], events = [], flash = "", stamp = "" } = {}, helpers = {}) {
  const { describeAgent = (a) => a, when = (w) => w, ago = (a) => a, isoOf = (i) => i } = helpers;

  const pendingCard = (entry) => `<article class="card">
  <div class="row">
    <div style="flex:1 1 220px;min-width:0">
      <div class="who">${escapeHtml(describeAgent(entry.agent))}
        ${entry.code ? `<span class="code">${escapeHtml(entry.code)}</span>` : ""}</div>
      <div class="meta">${escapeHtml(entry.address)} · pidió acceso ${escapeHtml(ago(entry.requestedAt))}</div>
      <div class="meta">Si es tu teléfono, el código debe coincidir con el de su pantalla.</div>
    </div>
    <div class="actions">
      <form method="post" action="/pair/approve">
        <input type="hidden" name="id" value="${escapeHtml(entry.id)}">
        <button class="ok" type="submit" aria-label="Autorizar ${escapeHtml(describeAgent(entry.agent))}">Autorizar</button>
      </form>
      <form method="post" action="/pair/reject">
        <input type="hidden" name="id" value="${escapeHtml(entry.id)}">
        <button class="no" type="submit" aria-label="Rechazar ${escapeHtml(describeAgent(entry.agent))}">Rechazar</button>
      </form>
    </div>
  </div>
</article>`;

  const deviceCard = (device) => {
    const label = device.name || describeAgent(device.agent) || device.address;
    return `<article class="card">
  <div class="row">
    <div style="flex:1 1 220px;min-width:0">
      <div class="who"><span class="live ${device.online ? "on" : ""}" aria-hidden="true"></span>
        ${escapeHtml(label)}
        <span class="state ${device.online ? "on" : ""}">${device.online ? "conectado" : "sin actividad"}</span></div>
      <div class="meta">${escapeHtml(device.address)} · ${escapeHtml(describeAgent(device.agent))}<br>
        autorizado ${escapeHtml(when(device.approvedAt))}${
          device.lastSeen ? ` · último uso ${escapeHtml(ago(device.lastSeen))}` : " · sin uso registrado"
        }</div>
    </div>
    <div class="actions">
      <form method="post" action="/pair/rename" class="actions" style="gap:6px">
        <input type="hidden" name="id" value="${escapeHtml(device.id)}">
        <input type="text" name="name" value="${escapeHtml(device.name || "")}" maxlength="40"
               autocomplete="off" spellcheck="false" placeholder="Nombre"
               aria-label="Nombre del dispositivo ${escapeHtml(label)}">
        <button type="submit" aria-label="Guardar el nombre de ${escapeHtml(label)}">Guardar</button>
      </form>
      <form method="post" action="/pair/revoke-device">
        <input type="hidden" name="id" value="${escapeHtml(device.id)}">
        <button class="link" type="submit" aria-label="Revocar el acceso de ${escapeHtml(label)}">Revocar</button>
      </form>
    </div>
  </div>
</article>`;
  };

  const eventList = (evs) =>
    evs.length
      ? `<ul class="events">${evs
          .map((event) => {
            const [label, tone] = EVENT_LABEL.get(event.type) || ["Evento", "muted"];
            return `<li><span class="tag ${tone}">${escapeHtml(label)}</span>
              <span>${escapeHtml(event.detail)}</span>
              <span class="at"><time datetime="${escapeHtml(isoOf(event.at))}">${escapeHtml(when(event.at))}</time></span></li>`;
          })
          .join("")}</ul>`
      : `<div class="card empty">Sin actividad registrada.</div>`;

  const pendingBlock = pending.length
    ? pending.map(pendingCard).join("")
    : `<div class="card empty">No hay solicitudes pendientes.<br>Abre la app en el teléfono y aparecerá aquí.</div>`;

  const devicesBlock = devices.length
    ? devices.map(deviceCard).join("") +
      `<form method="post" action="/pair/revoke" style="margin-top:4px"
             onsubmit="return confirm('¿Revocar los ${devices.length} dispositivo${devices.length === 1 ? "" : "s"}? El acceso se corta de inmediato.');">
         <button class="no" type="submit">Revocar todos</button></form>`
    : `<div class="card empty">Todavía no hay dispositivos autorizados.<br>Cuando autorices uno, aparecerá aquí.</div>`;

  const [flashText, flashTone] = FLASH.get(flash) || ["", ""];

  return page(
    "Autorizar dispositivos",
    `${brand("DSH Companion", "Autorizar dispositivos · solo esta computadora")}
     ${flashText ? `<div class="flash ${flashTone}" role="status">${escapeHtml(flashText)}</div>` : ""}
     <div class="stats">
       <span class="chip"><b>${pending.length}</b> solicitud${pending.length === 1 ? "" : "es"}</span>
       <span class="chip"><b>${devices.length}</b> dispositivo${devices.length === 1 ? "" : "s"}</span>
       <span class="chip">Sesión de ${config.deviceTtlDays} días, se renueva al usarla</span>
     </div>
     <h2>Solicitudes</h2>
     ${pendingBlock}
     <h2>Dispositivos autorizados</h2>
     ${devicesBlock}
     <h2>Actividad reciente</h2>
     ${eventList(events)}
     ${events.length ? `<form method="post" action="/pair/clear-history" style="margin-top:8px">
        <button class="link" type="submit">Limpiar historial</button></form>` : ""}
     <footer>DSH Companion v${escapeHtml(config.version)}</footer>`,
    `<script>
     (function(){
       var stamp=${JSON.stringify(stamp).replace(/</g, "\\u003c")};
       var submitting=false;
       document.addEventListener('submit',function(){ submitting=true; },true);

       function refreshPage() {
         if (submitting) return;
         var active = document.activeElement;
         if (active && active.tagName === "INPUT") return;
         location.replace('/pair');
       }

       // Detección y prevención de pestañas duplicadas
       try {
         if (typeof BroadcastChannel !== 'undefined') {
           var bc = new BroadcastChannel('dsh-companion-pair-panel');
           bc.postMessage({ type: 'hello', time: Date.now() });

           bc.onmessage = function(ev) {
             if (!ev || !ev.data) return;
             if (ev.data.type === 'hello') {
               bc.postMessage({ type: 'already-open' });
               refreshPage();
             } else if (ev.data.type === 'already-open') {
               try {
                 window.close();
               } catch(e) {}
               document.title = "DSH Companion (Pestaña abierta)";
               document.body.innerHTML = '<div style="max-width:480px;margin:80px auto;font-family:sans-serif;padding:32px;text-align:center;border-radius:12px;background:#f6f8fa;border:1px solid #d0d7de;color:#1f2328;">'
                 + '<h2 style="color:#0969da;margin-bottom:12px;font-size:18px;">DSH Companion ya está abierto</h2>'
                 + '<p style="font-size:14px;color:#656d76;line-height:1.5;">Esta ventana ya se encuentra abierta en otra pestaña de tu navegador y se actualiza automáticamente.</p>'
                 + '<p style="margin-top:20px;"><button onclick="window.close()" style="padding:10px 20px;font-size:14px;font-weight:600;border-radius:8px;background:#0969da;color:#fff;border:none;cursor:pointer;">Cerrar esta pestaña</button></p>'
                 + '</div>';
             }
           };
         }
       } catch(e) {}

       // Actualización instantánea en vivo mediante Server-Sent Events (SSE)
       try {
         if (typeof EventSource !== 'undefined') {
           var es = new EventSource('/pair/events');
           es.onmessage = function(ev) {
             try {
               var data = JSON.parse(ev.data);
               if (data && data.stamp && data.stamp !== stamp) {
                 refreshPage();
               }
             } catch(e) {}
           };
         }
       } catch(e) {}

       // Sondeo continuo (cada 2.5s) para mantener el pulso del servidor y asegurar frescura
       setInterval(function(){
         if (submitting) return;
         var active = document.activeElement;
         if (active && active.tagName === "INPUT") return;
         fetch('/pair/state', { cache: 'no-store' })
           .then(function(r) { return r.ok ? r.json() : null; })
           .then(function(s) {
             if (s && s.stamp && s.stamp !== stamp) {
               refreshPage();
             }
           })
           .catch(function() {});
       }, 2500);
     })();
     </script>`
  );
}
