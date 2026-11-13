import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOST = process.env.DSH_TEST_HOST || "10.173.252.87";
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

// 1. Un cliente desconocido recibe la pantalla de espera, no la app.
const waiting = await call("/", { headers: { accept: "text/html", "sec-fetch-dest": "document" } });
check("documento sin aprobar muestra espera", waiting.status === 200 && (waiting.body.includes("Confirma en la computadora") || waiting.body.includes("Acceso pendiente")), `status=${waiting.status}`);
check("la espera no filtra la app", !waiting.body.includes("DeepSeek"));

// 2. Se registra la solicitud.
const state1 = await call("/dsh-companion/pair-state");
check("pair-state pendiente", state1.status === 200 && state1.body.includes('"approved":false'), state1.body);

// 3. El panel de aprobacion existe y muestra la solicitud.
// Autenticamos contra el puerto del panel en loopback
const panelAuth = await call(`/pair?t=${encodeURIComponent(panelToken)}`, { host: "127.0.0.1", port: PANEL_PORT });
const panelCookieHeader = panelAuth.setCookie.find((v) => v.startsWith("dsh-panel="));
const panelCookie = panelCookieHeader ? panelCookieHeader.split(";")[0] : "";

const panel = await call("/pair", { host: "127.0.0.1", port: PANEL_PORT, cookie: panelCookie });
check("panel accesible desde la PC", panel.status === 200 && (panel.body.includes("Autorizar un dispositivo") || panel.body.includes("Dispositivos autorizados")), `status=${panel.status}`);
const idMatch = panel.body.match(/name="id" value="([^"]+)"/);
check("la solicitud aparece en el panel", Boolean(idMatch), idMatch ? "con id" : "sin id");

// 4. Aprobar.
const id = idMatch ? idMatch[1] : "";
const approve = await call("/pair/approve", { host: "127.0.0.1", port: PANEL_PORT, method: "POST", cookie: panelCookie, body: `id=${encodeURIComponent(id)}` });
check("aprobar responde redireccion", approve.status === 303, `status=${approve.status}`);

// 5. El cliente reclama su cookie.
const claim = await call("/dsh-companion/pair-state");
const cookieHeader = claim.setCookie.find((value) => value.startsWith("dsh-companion-device="));
check("al aprobar se entrega cookie", Boolean(cookieHeader), cookieHeader ? "cookie emitida" : "sin cookie");
const cookie = cookieHeader ? cookieHeader.split(";")[0] : "";

// 6. Con cookie entra a la app.
const app = await call("/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie });
check("con cookie abre la GUI", app.status === 200 && !app.body.includes("Confirma en la computadora") && !app.body.includes("Acceso pendiente"), `status=${app.status}`);

// 7. La cookie declara 30 dias.
check("vigencia de 30 dias", /Max-Age=2592000/.test(cookieHeader || ""), (cookieHeader || "").slice(0, 80));

// 8. Y se renueva: el estado anterior no debe reemitir hasta cumplir 24 h,
//    pero la cookie sigue siendo valida en cada peticion.
const again = await call("/dsh-companion/status", { cookie });
check("status con cookie autorizado", again.status === 200 && again.body.includes('"status":"online"'), again.body.slice(0, 90));

// Limpieza: revocar para no dejar residuos
if (id) {
  const listed = await call("/pair", { host: "127.0.0.1", port: PANEL_PORT, cookie: panelCookie });
  const deviceId = (listed.body.match(/action="\/pair\/revoke-device"[^>]*>[\s\S]*?name="id" value="([^"]+)"/) || [])[1];
  if (deviceId) {
    await call("/pair/revoke-device", { host: "127.0.0.1", port: PANEL_PORT, method: "POST", cookie: panelCookie, body: `id=${encodeURIComponent(deviceId)}` });
  }
}

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
