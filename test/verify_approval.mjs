import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOST = process.env.DSH_TEST_HOST || "127.0.0.1";
const PORT = Number(process.env.DSH_TEST_PORT || 57420);
const PANEL_PORT = Number(process.env.DSH_PANEL_PORT || 57421);

const panelToken = (() => {
  const fromEnv = String(process.env.DSH_PANEL_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(path.join(os.homedir(), ".dsh", "companion-panel-token"), "utf8").trim();
  } catch {
    return "";
  }
})();

const call = (pathname, { host = HOST, port = PORT, method = "GET", headers = {}, body = null, cookie = null } = {}) =>
  new Promise((resolve) => {
    const merged = { ...headers };
    if (cookie) merged.cookie = cookie;
    if (body) merged["content-type"] = "application/x-www-form-urlencoded";
    const req = http.request({ hostname: host, port, path: pathname, method, headers: merged, agent: false, timeout: 8000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          setCookie: res.headers["set-cookie"] || [],
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });
    req.on("error", (e) => resolve({ status: 0, headers: {}, setCookie: [], body: e.code }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, setCookie: [], body: "timeout" }); });
    if (body) req.write(body);
    req.end();
  });

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

/**
 * La prueba SOLO puede tocar la solicitud y el dispositivo que ella misma crea.
 * Se marca con un user-agent propio (el panel lo muestra como "Teléfono Android
 * 99.8") y se localiza su tarjeta; nunca se aprueba ni se revoca "el primer id"
 * del panel (puede ser un dispositivo o una solicitud reales del usuario).
 */
const OWN_AGENT =
  "Mozilla/5.0 (Linux; Android 99.8; DSH prueba de aprobacion) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const OWN_CARD = "Teléfono Android 99.8";
const HEADING = { "user-agent": OWN_AGENT };
const cookiePair = (setCookie, name) => {
  const value = setCookie.find((entry) => entry.startsWith(`${name}=`));
  return value ? value.split(";")[0] : "";
};
const pendingIdFor = (html, marker) => {
  for (const match of html.matchAll(/<article class="card">([\s\S]*?)<\/article>/g)) {
    if (!match[1].includes(marker)) continue;
    const id = /name="id" value="([^"]+)"/.exec(match[1]);
    if (id) return id[1];
  }
  return "";
};

// 1. Un cliente desconocido recibe la pantalla de espera, no la app.
const waiting = await call("/", { headers: { ...HEADING, accept: "text/html", "sec-fetch-dest": "document" } });
check("documento sin aprobar muestra espera", waiting.status === 200 && (waiting.body.includes("Confirma en la computadora") || waiting.body.includes("Acceso pendiente")), `status=${waiting.status}`);
check("la espera no filtra la app", !waiting.body.includes("DeepSeek"));
const claimCookie = cookiePair(waiting.setCookie, "dsh-companion-claim");

// 2. Se registra la solicitud.
const state1 = await call("/dsh-companion/pair-state", { headers: HEADING });
check("pair-state pendiente", state1.status === 200 && state1.body.includes('"approved":false'), state1.body);

// 3. El panel de aprobacion existe y muestra la solicitud propia.
// Autenticamos contra el puerto del panel en loopback
const panelAuth = await call(`/pair?t=${encodeURIComponent(panelToken)}`, { host: "127.0.0.1", port: PANEL_PORT });
const panelCookieHeader = panelAuth.setCookie.find((v) => v.startsWith("dsh-panel="));
const panelCookie = panelCookieHeader ? panelCookieHeader.split(";")[0] : "";

const panel = await call("/pair", { host: "127.0.0.1", port: PANEL_PORT, cookie: panelCookie });
check("panel accesible desde la PC", panel.status === 200 && (panel.body.includes("Autorizar un dispositivo") || panel.body.includes("Dispositivos autorizados")), `status=${panel.status}`);
const id = pendingIdFor(panel.body, OWN_CARD);
check("la solicitud propia aparece en el panel", Boolean(id), id ? "con id propio" : "sin id propio");

// 4. Aprobar SOLO la solicitud propia.
const approve = await call("/pair/approve", { host: "127.0.0.1", port: PANEL_PORT, method: "POST", cookie: panelCookie, body: `id=${encodeURIComponent(id)}` });
check("aprobar responde redireccion", approve.status === 303, `status=${approve.status}`);

// 5. El cliente reclama su cookie.
const claim = await call("/dsh-companion/pair-state", { headers: HEADING, cookie: claimCookie || null });
const cookieHeader = claim.setCookie.find((value) => value.startsWith("dsh-companion-device="));
check("al aprobar se entrega cookie", Boolean(cookieHeader), cookieHeader ? "cookie emitida" : "sin cookie");
const cookie = cookieHeader ? cookieHeader.split(";")[0] : "";
const deviceId = cookie.slice("dsh-companion-device=".length);

// 6. Con cookie entra a la app.
const app = await call("/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie });
check("con cookie abre la GUI", app.status === 200 && !app.body.includes("Confirma en la computadora") && !app.body.includes("Acceso pendiente"), `status=${app.status}`);

// 7. La cookie declara 30 dias.
check("vigencia de 30 dias", /Max-Age=2592000/.test(cookieHeader || ""), (cookieHeader || "").slice(0, 80));

// 8. Y se renueva: el estado anterior no debe reemitir hasta cumplir 24 h,
//    pero la cookie sigue siendo valida en cada peticion.
const again = await call("/dsh-companion/status", { cookie });
check("status con cookie autorizado", again.status === 200 && again.body.includes('"status":"online"'), again.body.slice(0, 90));

// Limpieza: revocar SOLO el dispositivo que esta prueba emparejo. Nunca se usa
// el primer id del panel: puede ser un dispositivo real del usuario.
if (deviceId) {
  const listed = await call("/pair", { host: "127.0.0.1", port: PANEL_PORT, cookie: panelCookie });
  const ownRevokeForm = new RegExp(`action="/pair/revoke-device"[\\s\\S]{0,400}?name="id" value="${deviceId}"`).test(listed.body);
  check("el dispositivo propio aparece para revocar", ownRevokeForm, deviceId ? "id propio localizado" : "sin id propio");
  if (ownRevokeForm) {
    const revoked = await call("/pair/revoke-device", { host: "127.0.0.1", port: PANEL_PORT, method: "POST", cookie: panelCookie, body: `id=${encodeURIComponent(deviceId)}` });
    check("revocar limpia el dispositivo propio", revoked.status === 303, `status=${revoked.status}`);
  }
}

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
