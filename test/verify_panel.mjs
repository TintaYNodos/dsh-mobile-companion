import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BRIDGE = { host: process.env.DSH_TEST_HOST || "127.0.0.1", port: Number(process.env.DSH_TEST_PORT || 57420) };
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

/**
 * La prueba SOLO puede tocar el dispositivo y la solicitud que ella misma crea.
 * Marca su solicitud con un user-agent propio (el panel lo muestra como
 * "Teléfono Android 99.9") y localiza ESA tarjeta; nunca usa "el primer id del
 * panel" (un dispositivo o una solicitud reales del usuario).
 */
const OWN_AGENT =
  "Mozilla/5.0 (Linux; Android 99.9; Pixel QA de prueba) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const OWN_CARD = "Teléfono Android 99.9";
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

// 5. Un telefono pide acceso por la VPN. Se guarda su cookie de canje para que
//    el emparejamiento quede atado a ESTA solicitud y no a otra de la misma IP.
const poll = await call(BRIDGE, "/dsh-companion/status", { headers: { "user-agent": OWN_AGENT } });
const claimCookie = cookiePair(poll.setCookie, "dsh-companion-claim");
const withPending = await call(PANEL, "/pair", { cookie });
const id = pendingIdFor(withPending.body, OWN_CARD);
check("la solicitud aparece en el panel", Boolean(id), id ? "con id propio" : "sin id propio");
check(
  "solo se aprueba la solicitud de la prueba",
  Boolean(id) && withPending.body.includes(OWN_CARD),
  id ? "tarjeta propia localizada" : "no se localizo la tarjeta propia"
);

// 6. Aprobar (solo el id de la solicitud propia).
const approve = await call(PANEL, "/pair/approve", { method: "POST", cookie, body: `id=${encodeURIComponent(id)}` });
check("aprobar funciona", approve.status === 303, `status=${approve.status}`);

// 7. El telefono reclama su cookie (con la cookie de canje de su solicitud).
const claim = await call(BRIDGE, "/dsh-companion/pair-state", { cookie: claimCookie || null });
const deviceCookie = claim.setCookie.find((value) => value.startsWith("dsh-companion-device="));
check("el telefono recibe cookie", Boolean(deviceCookie), deviceCookie ? "cookie emitida" : "sin cookie");
const device = deviceCookie ? deviceCookie.split(";")[0] : "";
const deviceId = device.slice("dsh-companion-device=".length);

// 8. Entra a la app.
const app = await call(BRIDGE, "/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie: device });
check("el telefono entra a la app", app.status === 200 && !app.body.includes("Acceso pendiente"), `status=${app.status}`);

// 9. El dispositivo propio figura en el panel con boton de revocar. NUNCA se
//    usa el primer id del panel: puede ser un dispositivo real del usuario.
const listed = await call(PANEL, "/pair", { cookie });
check("el dispositivo figura en el panel", Boolean(deviceId) && listed.body.includes(deviceId), deviceId ? "id propio listado" : "sin id propio");
check(
  "el dispositivo propio tiene boton de revocar",
  Boolean(deviceId) && new RegExp(`action="/pair/revoke-device"[\\s\\S]{0,400}?name="id" value="${deviceId}"`).test(listed.body),
  "formulario de revocar propio"
);

// 10. Revocar individualmente SOLO el dispositivo que creo esta prueba.
const revoke = await call(PANEL, "/pair/revoke-device", { method: "POST", cookie, body: `id=${encodeURIComponent(deviceId)}` });
check("revocar dispositivo responde", revoke.status === 303, `status=${revoke.status}`);

const after = await call(BRIDGE, "/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie: device });
check("tras revocar, el telefono ya no entra", after.body.includes("Acceso pendiente"), `status=${after.status}`);

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
