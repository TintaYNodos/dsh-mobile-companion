import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BRIDGE = { host: process.env.DSH_TEST_HOST || "10.173.252.87", port: Number(process.env.DSH_TEST_PORT || 57420) };
const PANEL = { host: "127.0.0.1", port: Number(process.env.DSH_PANEL_PORT || 57421) };

const token = (() => {
  const fromEnv = String(process.env.DSH_PANEL_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(path.join(os.homedir(), ".dsh", "companion-panel-token"), "utf8").trim();
  } catch {
    return "";
  }
})();

const call = (target, pathname, { method = "GET", headers = {}, body = null, cookie = null } = {}) =>
  new Promise((resolve) => {
    const merged = { ...headers };
    if (cookie) merged.cookie = cookie;
    if (body) merged["content-type"] = "application/x-www-form-urlencoded";
    const req = http.request(
      { hostname: target.host, port: target.port, path: pathname, method, headers: merged, agent: false, timeout: 8000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers || {},
            setCookie: res.headers["set-cookie"] || [],
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
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

// 1. El panel NO esta expuesto por la red privada.
const viaVpn = await call(BRIDGE, "/pair");
check("panel no responde por la VPN", viaVpn.status === 403, `status=${viaVpn.status}`);

// 2. El panel existe en loopback pero exige credencial.
const noToken = await call(PANEL, "/pair");
check("panel sin credencial rechazado", noToken.status === 200 && noToken.body.includes("Falta la credencial"), `status=${noToken.status}`);

const badToken = await call(PANEL, "/pair?t=inventado");
check("credencial invalida rechazada", badToken.status === 403, `status=${badToken.status}`);

// 3. Con credencial: redirige y entrega cookie.
const good = await call(PANEL, `/pair?t=${encodeURIComponent(token)}`);
const panelCookie = good.setCookie.find((value) => value.startsWith("dsh-panel="));
check("credencial valida redirige", good.status === 303, `status=${good.status}`);
check("entrega cookie de panel", Boolean(panelCookie), panelCookie ? "cookie emitida" : "sin cookie");
const cookie = panelCookie ? panelCookie.split(";")[0] : "";

// 4. Con cookie se ve el panel.
const panel = await call(PANEL, "/pair", { cookie });
check("panel visible con cookie", panel.status === 200 && panel.body.includes("Dispositivos autorizados"), `status=${panel.status}`);

// 5. Un telefono pide acceso por la VPN.
await call(BRIDGE, "/dsh-companion/status", { headers: { "user-agent": "Pixel 7 · prueba" } });
const withPending = await call(PANEL, "/pair", { cookie });
const idMatch = withPending.body.match(/name="id" value="([^"]+)"/);
check("la solicitud aparece en el panel", Boolean(idMatch), idMatch ? "con id" : "sin id");

// 6. Aprobar.
const id = idMatch ? idMatch[1] : "";
const approve = await call(PANEL, "/pair/approve", { method: "POST", cookie, body: `id=${encodeURIComponent(id)}` });
check("aprobar funciona", approve.status === 303, `status=${approve.status}`);

// 7. El telefono reclama su cookie.
const claim = await call(BRIDGE, "/dsh-companion/pair-state");
const deviceCookie = claim.setCookie.find((value) => value.startsWith("dsh-companion-device="));
check("el telefono recibe cookie", Boolean(deviceCookie), deviceCookie ? "cookie emitida" : "sin cookie");
const device = deviceCookie ? deviceCookie.split(";")[0] : "";

// 8. Entra a la app.
const app = await call(BRIDGE, "/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie: device });
check("el telefono entra a la app", app.status === 200 && !app.body.includes("Acceso pendiente"), `status=${app.status}`);

// 9. El dispositivo figura en el panel con boton de revocar.
const listed = await call(PANEL, "/pair", { cookie });
check("el dispositivo figura en el panel", listed.body.includes("/pair/revoke-device"), "con boton revocar");
const deviceId = (listed.body.match(/action="\/pair\/revoke-device"[^>]*>[\s\S]*?name="id" value="([^"]+)"/) || [])[1];

// 10. Revocar individualmente.
const revoke = await call(PANEL, "/pair/revoke-device", { method: "POST", cookie, body: `id=${encodeURIComponent(deviceId || "")}` });
check("revocar dispositivo responde", revoke.status === 303, `status=${revoke.status}`);

const after = await call(BRIDGE, "/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie: device });
check("tras revocar, el telefono ya no entra", after.body.includes("Acceso pendiente"), `status=${after.status}`);

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
