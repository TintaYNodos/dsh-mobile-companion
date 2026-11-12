/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import { escapeHtml, page, brand, approvalPage as renderApproval, stateStamp } from "./pairing-views.mjs";

export { stateStamp };

export const when = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export const isoOf = (value) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};

export const ago = (value) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return "";
  if (minutes < 1) return "hace unos segundos";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `hace ${hours} h` : `hace ${Math.round(hours / 24)} dÃ­as`;
};

export const describeAgent = (agent = "") => {
  const ua = String(agent || "");
  if (!ua) return "Dispositivo sin identificar";

  const browser = /EdgA?\//.test(ua) ? "Edge"
    : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "";

  const android = /Android\s+([\d.]+)/i.exec(ua);
  if (android) return `TelÃ©fono Android ${android[1]}${browser ? ` Â· ${browser}` : ""}`;
  if (/iPhone|iPad|iPod/i.test(ua)) return `iPhone${browser ? ` Â· ${browser}` : ""}`;
  if (/Windows/i.test(ua)) return `Equipo Windows${browser ? ` Â· ${browser}` : ""}`;
  if (/Macintosh|Mac OS/i.test(ua)) return `Mac${browser ? ` Â· ${browser}` : ""}`;
  if (/Linux/i.test(ua)) return `Equipo Linux${browser ? ` Â· ${browser}` : ""}`;
  return "Dispositivo sin identificar";
};

export const waitingPage = ({ code = "", hostLabel = "" } = {}) =>
  page(
    "Acceso pendiente",
    brand("Acceso pendiente", "Tu telÃ©fono espera permiso") +
      `<p class="lead">Abre el panel en la computadora y pulsa <b>Autorizar</b>.
       Esta pantalla entra sola en cuanto lo hagas.</p>
       ${
         code
           ? `<article class="card" style="text-align:center;margin-top:16px">
                <div class="meta" style="letter-spacing:1px;text-transform:uppercase">CÃ³digo de este dispositivo</div>
                <div style="font-size:38px;font-weight:800;letter-spacing:8px;margin-top:4px;color:var(--accent)">${escapeHtml(code)}</div>
                <div class="meta">Debe coincidir con el que muestra el panel</div>
              </article>`
           : ""
       }
       <button class="ok wide" id="open-panel" type="button">Abrir el panel en la computadora</button>
       <p class="hint" id="open-status" role="status" aria-live="polite"></p>
       <p class="hint">Si no se abre, en la computadora haz doble clic en <b>panel.bat</b>.</p>
       <p class="hint" id="expira">La solicitud caduca a los 15 minutos sin autorizar.</p>
       <details class="more"><summary>Detalles de conexiÃ³n</summary>
         <p class="meta">DirecciÃ³n de la computadora en la red privada:
         <code>http://${escapeHtml(hostLabel)}</code></p>
       </details>`,
    `<script>
     (function(){
       var out=document.getElementById('open-status');
       var btn=document.getElementById('open-panel');
       if (btn) {
         btn.addEventListener('click',function(){
           btn.disabled=true; out.textContent='Abriendo el panel en la computadora…';
           fetch('/dsh-companion/open-panel',{method:'POST',cache:'no-store'})
             .then(function(r){return r.ok?r.json():null})
             .then(function(s){
               if(s&&s.ok){ out.textContent='Listo. Mira la pantalla de la computadora.'; return; }
               out.textContent='No se pudo abrir solo. En la computadora, doble clic en panel.bat.';
               btn.disabled=false;
             })
             .catch(function(){
               out.textContent='Sin conexión con la computadora. Revisa la red privada.';
               btn.disabled=false;
             });
         });
       }

       var done = false;
       function loadSystemNow() {
         if (done) return;
         done = true;
         if (window.AndroidCompanion && typeof window.AndroidCompanion.onApproved === 'function') {
           try {
             window.AndroidCompanion.onApproved();
             return;
           } catch(e) {}
         }
         window.location.replace('/?t=' + Date.now());
       }

       try {
         if (typeof EventSource !== 'undefined') {
           var es = new EventSource('/dsh-companion/pair-events');
           es.onmessage = function(ev) {
             try {
               var data = JSON.parse(ev.data);
               if (data && data.approved) {
                 es.close();
                 loadSystemNow();
               } else if (data && data.rejected) {
                 es.close();
                 window.location.replace('/dsh-companion/rechazado');
               }
             } catch(e) {}
           };
         }
       } catch(e) {}

       var timer = setInterval(function(){
         if (done) { clearInterval(timer); return; }
         fetch('/dsh-companion/pair-state', { cache: 'no-store' })
           .then(function(r){ return r.ok ? r.json() : null; })
           .then(function(s){
             if (!s) return;
             if (s.approved) {
               clearInterval(timer);
               loadSystemNow();
             } else if (s.rejected) {
               clearInterval(timer);
               window.location.replace('/dsh-companion/rechazado');
             }
           })
           .catch(function(){});
       }, 700);
     })();
     </script>`
  );

export const rejectedPage = () =>
  page(
    "Acceso rechazado",
    brand("Acceso rechazado", "La computadora no autorizÃ³ este telÃ©fono") +
      `<p class="lead">Si fue un error, puedes pedir acceso otra vez.</p>
       <button class="ok wide" id="retry" type="button">Pedir acceso de nuevo</button>
       <p class="hint" id="retry-status" role="status" aria-live="polite"></p>
       <script>
       document.getElementById('retry').addEventListener('click',function(){
         var btn=this, out=document.getElementById('retry-status');
         btn.disabled=true; out.textContent='Enviando la solicitudâ€¦';
         fetch('/dsh-companion/retry',{method:'POST',cache:'no-store'})
           .then(function(r){return r.ok?r.json():null})
           .then(function(s){
             if(s&&s.ok){ location.replace('/'); return; }
             out.textContent='No se pudo enviar. IntÃ©ntalo de nuevo en un minuto.';
             btn.disabled=false;
           })
           .catch(function(){ out.textContent='Sin conexiÃ³n con la computadora.'; btn.disabled=false; });
       });
       </script>`
  );

export const recoveryPage = () =>
  page(
    "No se pudo abrir el panel",
    brand("No se pudo abrir el panel", "La credencial no es vÃ¡lida") +
      `<p class="lead">Este enlace no trae una credencial vÃ¡lida, o ya venciÃ³.</p>
       <p class="hint">En la computadora, haz doble clic en <b>panel.bat</b>.</p>`
  );

export const panelCredentialPage = () =>
  page(
    "Credencial requerida",
    brand("Falta la credencial", "Panel de autorizaciÃ³n") +
      `<p class="lead">Este panel solo se abre desde el acceso directo que incluye la credencial.</p>
       <p class="hint">En la computadora, haz doble clic en <b>panel.bat</b>.</p>`
  );

export const notLocalPage = () =>
  page(
    "Solo en la computadora",
    brand("Solo en la computadora", "El panel no se abre desde la red") +
      `<p class="lead">Por seguridad, el panel solo funciona en el equipo donde corre el puente.</p>
       <p class="hint">Abre <b>panel.bat</b> en esa computadora.</p>`
  );

export function approvalPage(data = {}) {
  return renderApproval(data, { describeAgent, when, ago, isoOf });
}
