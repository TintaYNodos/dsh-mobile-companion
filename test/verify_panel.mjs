import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBridge } from "./ci/start-bridge.mjs";
import { runPairCookieRegression } from "./ci/pair-cookie-regression.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// H-17: las notas de la prueba viven en el synced_chats temporal del puente.
const SYNC_DIR = path.resolve(process.env.DSH_SYNC_DIR || path.join(REPO_ROOT, "synced_chats"));
// H-10: registro del DSH_HOME temporal (solo se manipula si el entorno es aislado).
const DSH_HOME = String(process.env.DSH_HOME || "").trim();
const REGISTRY = DSH_HOME ? path.join(DSH_HOME, "companion-devices.json") : "";
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

// 4b. "Notas recibidas": la seccion del panel consume GET /dsh-companion/notes
//     por loopback. Se crean notas con valores canonicos del APK (tipo/estado),
//     proyecto con "&", HTML en el titulo y vencimiento; se comprueba que el
//     panel las muestra traducidas, escapadas UNA sola vez y con fecha local;
//     luego se borran los .md.
const accessKey = String(process.env.DSH_ACCESS_KEY || "").trim();
const keyAuth = accessKey ? { authorization: `Basic ${Buffer.from(`dsh:${accessKey}`, "utf8").toString("base64")}` } : {};
const postJson = (pathname, payload) =>
  new Promise((resolve) => {
    const request = http.request(
      { hostname: BRIDGE.host, port: BRIDGE.port, path: pathname, method: "POST",
        headers: { ...keyAuth, "content-type": "application/json" }, agent: false, timeout: 8000 },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    request.on("timeout", () => { request.destroy(); resolve({ status: 0, body: "timeout" }); });
    request.on("error", (error) => resolve({ status: 0, body: error.code }));
    request.write(JSON.stringify(payload));
    request.end();
  });
const noteTitle = "Nota <b>del panel</b> QA";
// Valores canonicos como los envia el APK (no slugs inventados): tipo y estado
// deben salir traducidos al espanol en el panel. El proyecto lleva "&" para
// comprobar que se escapa una sola vez.
const noteRes = await postJson("/dsh-companion/notes", {
  title: noteTitle, body: "cuerpo de la nota", project: "I+D & Socios",
  type: "material", status: "in_progress", dueDate: "2026-12-31",
});
const canonicalRes = [];
for (const payload of [
  { title: "Fuente QA", body: "cuerpo", project: "Panel QA", type: "source", status: "debunked" },
  { title: "Documento QA", body: "cuerpo", project: "Panel QA", type: "document", status: "verified" },
]) {
  canonicalRes.push(await postJson("/dsh-companion/notes", payload));
}
const noteFiles = [noteRes, ...canonicalRes].map((res) => {
  try { return JSON.parse(res.body).file || ""; } catch { return ""; }
});
const withNotes = await call(PANEL, "/pair", { cookie });
const notesSection = (() => {
  const start = withNotes.body.indexOf("Notas recibidas");
  const end = withNotes.body.indexOf("<footer>", start);
  return start >= 0 && end > start ? withNotes.body.slice(start, end) : "";
})();
check("el panel muestra la seccion Notas recibidas",
  noteRes.status === 200 && withNotes.body.includes("Notas recibidas"), `status=${noteRes.status}`);
check("el panel lista la nota con el titulo escapado",
  withNotes.body.includes("Nota &lt;b&gt;del panel&lt;/b&gt; QA") && !withNotes.body.includes("<b>del panel"));
check("el panel escapa el proyecto UNA sola vez (I+D & Socios)",
  notesSection.includes("I+D &amp; Socios") && !notesSection.includes("&amp;amp;"));
check("el panel traduce los tipos canonicos del APK al espanol",
  notesSection.includes("Material") && notesSection.includes("Fuente") && notesSection.includes("Documento") &&
  !/\b(source|document|material)\b/.test(notesSection));
check("el panel traduce los estados canonicos del APK al espanol",
  notesSection.includes("En curso") && notesSection.includes("Desmentido") && notesSection.includes("Verificado") &&
  !/\b(in_progress|debunked|verified)\b/.test(notesSection));
check("el panel muestra la fecha local dd/mm/aaaa hh:mm (no ISO UTC)",
  /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(notesSection) &&
  !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(notesSection));
check("el panel muestra el vencimiento humanizado", notesSection.includes("Vence 31/12/2026"));
for (const file of noteFiles) {
  try { if (file) fs.unlinkSync(path.join(SYNC_DIR, "notes", file)); } catch { /* nota de la prueba */ }
}

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
// 9b. Regresion 5.4.1 (cookie perdida / aprobacion duplicada): ver ci/pair-cookie-regression.mjs.
await runPairCookieRegression({ call, check, BRIDGE, PANEL, OWN_AGENT, deviceId, panelCookie: cookie, REGISTRY });

// 10. Revocar individualmente SOLO el dispositivo que creo esta prueba.
const revoke = await call(PANEL, "/pair/revoke-device", { method: "POST", cookie, body: `id=${encodeURIComponent(deviceId)}` });
check("revocar dispositivo responde", revoke.status === 303, `status=${revoke.status}`);

const after = await call(BRIDGE, "/", { headers: { accept: "text/html", "sec-fetch-dest": "document" }, cookie: device });
check("tras revocar, el telefono ya no entra", after.body.includes("Acceso pendiente"), `status=${after.status}`);

// 11. H-08: un rechazo es de la SOLICITUD concreta, no de la IP. Otro equipo
// detras del mismo NAT (la misma IPv4 de loopback en CI) debe seguir pudiendo
// pedir acceso; antes el rechazo bloqueaba a todos los equipos de esa IP.
const QA_UA = "Mozilla/5.0 (Linux; Android 7X.X; Pixel QA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const rejectAgent = QA_UA.replace("7X.X", "77.7");
const otherAgent = QA_UA.replace("7X.X", "76.6");
// El flujo anterior deja una solicitud sin User-Agent (documento sin UA): se
// parte de un registro limpio, igual que hace el runner entre suites, para que
// la solicitud de esta prueba sea reconocible por su agente.
if (REGISTRY) {
  fs.rmSync(REGISTRY, { force: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
}
const rejectPoll = await call(BRIDGE, "/dsh-companion/status", { headers: { "user-agent": rejectAgent } });
const rejectClaimCookie = cookiePair(rejectPoll.setCookie, "dsh-companion-claim");
const rejectPage = await call(PANEL, "/pair", { cookie });
const rejectId = pendingIdFor(rejectPage.body, "Teléfono Android 77.7");
const rejectAction = await call(PANEL, "/pair/reject", { method: "POST", cookie, body: `id=${encodeURIComponent(rejectId)}` });
const rejectedState = await call(BRIDGE, "/dsh-companion/pair-state", { cookie: rejectClaimCookie || null });
const otherState = await call(BRIDGE, "/dsh-companion/pair-state", { headers: { "user-agent": otherAgent } });
check("H-08: el rechazado ve rejected y otro equipo de la misma IP sigue pendiente",
  rejectAction.status === 303 && String(rejectAction.headers.location || "").includes("flash=reject") &&
    rejectedState.body.includes('"rejected":true') &&
    otherState.status === 200 && otherState.body.includes('"rejected":false') &&
    otherState.body.includes('"pending":true'),
  `id=${rejectId} reject=${rejectAction.status} ${rejectAction.headers.location} ` +
    `rechazado=${rejectedState.body.slice(0, 60)} otro=${otherState.body.slice(0, 60)}`);

// 12. H-10: "no existe" y "no se pudo guardar" no pueden traducirse ambos a
// "expired". Sin sesion de panel nada de esto toca dispositivos reales.
const missingApprove = await call(PANEL, "/pair/approve", { method: "POST", cookie, body: "id=no-existe-qa" });
check("H-10: aprobar una solicitud inexistente se muestra como 'expired'",
  missingApprove.status === 303 && String(missingApprove.headers.location || "").includes("flash=expired"),
  `status=${missingApprove.status} loc=${missingApprove.headers.location}`);
if (!REGISTRY) {
  console.log("SKIP  H-10 fallo de disco: DSH_HOME no apunta a una instancia aislada");
} else {
  const diskFailAgent = QA_UA.replace("7X.X", "66.6");
  // Registro limpio: la prueba anterior dejo una solicitud pendiente de otro
  // agente y el sondeo por loopback la reutilizaria (la solicitud se ata a IP +
  // agente; aqui hace falta una propia).
  fs.rmSync(REGISTRY, { force: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await call(BRIDGE, "/dsh-companion/status", { headers: { "user-agent": diskFailAgent } });
  const failPage = await call(PANEL, "/pair", { cookie });
  const failId = pendingIdFor(failPage.body, "Teléfono Android 66.6");
  const originalRegistry = fs.readFileSync(REGISTRY);
  let failedAction = { status: 0, headers: {} };
  // Un registro que no se puede reescribir (ruta ocupada por un directorio)
  // simula el fallo de disco sin tocar nada fuera del DSH_HOME temporal.
  fs.rmSync(REGISTRY, { force: true });
  fs.mkdirSync(REGISTRY);
  try {
    failedAction = await call(PANEL, "/pair/approve", { method: "POST", cookie, body: `id=${encodeURIComponent(failId)}` });
  } finally {
    fs.rmSync(REGISTRY, { recursive: true, force: true });
    fs.writeFileSync(REGISTRY, originalRegistry);
  }
  check("H-10: un fallo de disco al aprobar se muestra como 'failed' (no 'expired')",
    failedAction.status === 303 && String(failedAction.headers.location || "").includes("flash=failed"),
    `status=${failedAction.status} loc=${failedAction.headers.location}`);
}

// 13. H-01: rotacion real de la clave. Con clave en archivo el kill switch debe
// rotarla; con DSH_ACCESS_KEY no debe fingir (respuesta y log explicitos).
const bridgeTarget = (b) => ({ host: "127.0.0.1", port: b.bridgePort });
const basicAuth = (key) => ({ authorization: `Basic ${Buffer.from(`dsh:${key}`, "utf8").toString("base64")}` });
const fileBridge = await startBridge({ accessKeyMode: "file" });
const fileRotation = {};
try {
  const beforeKey = fileBridge.accessKey;
  fileRotation.kill = await call(bridgeTarget(fileBridge), "/dsh-companion/kill-switch", { method: "POST", headers: basicAuth(beforeKey) });
  fileRotation.afterKey = fs.readFileSync(path.join(fileBridge.dshHome, "companion-access-key"), "utf8").trim();
  fileRotation.oldAuth = await call(bridgeTarget(fileBridge), "/dsh-companion/status", { headers: basicAuth(beforeKey) });
  fileRotation.newAuth = await call(bridgeTarget(fileBridge), "/dsh-companion/status", { headers: basicAuth(fileRotation.afterKey) });
  fileRotation.beforeKey = beforeKey;
  fileRotation.log = fileBridge.output();
} finally {
  await fileBridge.stop();
}
check("H-01: con clave en archivo el kill switch rota de verdad (rotated:true)",
  fileRotation.kill.status === 200 && fileRotation.kill.body.includes('"rotated":true') &&
    fileRotation.afterKey !== fileRotation.beforeKey && fileRotation.log.includes("Clave de acceso rotada"),
  `status=${fileRotation.kill.status} body=${fileRotation.kill.body.slice(0, 120)}`);
check("H-01: la clave vieja deja de autorizar y la nueva si autoriza",
  fileRotation.oldAuth.status === 200 && fileRotation.oldAuth.body.includes('"status":"pairing"') &&
    fileRotation.newAuth.status === 200 && !fileRotation.newAuth.body.includes('"status":"pairing"'),
  `vieja=${fileRotation.oldAuth.body.slice(0, 50)} nueva=${fileRotation.newAuth.body.slice(0, 50)}`);
const envBridge = await startBridge();
const envRotation = {};
try {
  envRotation.kill = await call(bridgeTarget(envBridge), "/dsh-companion/kill-switch", { method: "POST", headers: basicAuth(envBridge.accessKey) });
  envRotation.stillValid = await call(bridgeTarget(envBridge), "/dsh-companion/status", { headers: basicAuth(envBridge.accessKey) });
  await new Promise((resolve) => setTimeout(resolve, 150));
  envRotation.log = envBridge.output();
} finally {
  await envBridge.stop();
}
check("H-01: con DSH_ACCESS_KEY el kill switch NO finge (rotated:false, reason:env) y lo registra",
  envRotation.kill.status === 200 && envRotation.kill.body.includes('"rotated":false') &&
    envRotation.kill.body.includes('"rotationReason":"env"') &&
    envRotation.stillValid.status === 200 && !envRotation.stillValid.body.includes('"status":"pairing"') &&
    envRotation.log.includes("no rotada: la fija DSH_ACCESS_KEY"),
  `body=${envRotation.kill.body.slice(0, 140)} log=${envRotation.log.includes("DSH_ACCESS_KEY")}`);

// 14. Regresion 5.3.2: tras el kill switch, la pestana del panel que ya estaba
// abierta no puede impedir que el telefono pida abrir el panel otra vez. Antes
// su sesion moria pero su SSE seguia contando como "panel abierto": open-panel
// respondia 200 sin abrir ninguna ventana con boleto, y la solicitud pendiente
// del telefono se perdia (sondeo throttled) hasta un minuto despues del kill.
// Instancia aislada; el spawn de la ventana se intercepta con un colector
// temporal para registrar el boleto sin abrir navegadores durante la prueba.
const spawnRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-panel-spawn-"));
const spawnStub = path.join(spawnRoot, "stub.cjs");
const spawnLog = path.join(spawnRoot, "spawn.log");
fs.writeFileSync(spawnStub, `const cp=require("node:child_process"),fs=require("node:fs"),original=cp.spawn;
const fake=()=>({unref(){},on(){},once(){},kill(){}});
cp.spawn=function(file,args){const a=Array.isArray(args)?args.map(String):[];
if(/^cmd$/i.test(file)&&a[1]==="start"){try{fs.appendFileSync(process.env.DSH_TEST_SPAWN_LOG,"panel "+a.slice(2).join(" ")+"\\n");}catch{}return fake();}
if(/^powershell$/i.test(file))return fake();return original.apply(this,arguments);};`, "utf8");
const spawns = () => {
  try { return fs.readFileSync(spawnLog, "utf8").trim().split(/\r?\n/).filter(Boolean); } catch { return []; }
};
process.env.DSH_TEST_SPAWN_LOG = spawnLog;
process.env.DSH_ALLOW_PROXY_ACCESS = "1"; // el telefono se simula con cabeceras de proxy
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ""} --require ${spawnStub}`.trim();
const killBridge = await startBridge();
const killFlow = { sseClosed: false };
try {
  const panelTarget = { host: "127.0.0.1", port: killBridge.panelPort };
  const login = await call(panelTarget, `/pair?t=${encodeURIComponent(killBridge.panelToken)}`);
  const oldCookie = cookiePair(login.setCookie, "dsh-panel");
  killFlow.page = await call(panelTarget, "/pair", { cookie: oldCookie });
  await new Promise((resolve) => {
    const req = http.get({ hostname: "127.0.0.1", port: killBridge.panelPort, path: "/pair/events", headers: { cookie: oldCookie } }, (res) => {
      res.once("data", resolve);
      res.on("close", () => { killFlow.sseClosed = true; });
    });
    req.on("error", resolve);
  });
  fs.writeFileSync(spawnLog, ""); // la ventana del sondeo de arranque no cuenta
  const phone = { "x-forwarded-for": "203.0.113.20", "user-agent": OWN_AGENT, accept: "text/html", "sec-fetch-dest": "document" };
  const waiting = await call(bridgeTarget(killBridge), "/", { headers: phone });
  const claim = cookiePair(waiting.setCookie, "dsh-companion-claim");
  killFlow.polled = await call(bridgeTarget(killBridge), "/dsh-companion/pair-state", { headers: phone, cookie: claim });
  killFlow.kill = await call(bridgeTarget(killBridge), "/dsh-companion/kill-switch", { method: "POST", headers: basicAuth(killBridge.accessKey) });
  await new Promise((resolve) => setTimeout(resolve, 400));
  killFlow.stale = await call(panelTarget, "/pair", { cookie: oldCookie });
  killFlow.polledAgain = await call(bridgeTarget(killBridge), "/dsh-companion/pair-state", { headers: phone, cookie: claim });
  killFlow.open = await call(bridgeTarget(killBridge), "/dsh-companion/open-panel", { method: "POST", headers: phone, cookie: claim });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const urls = spawns().filter((line) => line.startsWith("panel ")).map((line) => (line.match(/http:\/\/\S+/) || [""])[0]).filter(Boolean);
  const ticket = urls.length ? new URL(urls[urls.length - 1]).searchParams.get("t") : "";
  killFlow.redeem = ticket ? await call(panelTarget, `/pair?t=${encodeURIComponent(ticket)}`) : { status: 0, setCookie: [] };
  const freshCookie = cookiePair(killFlow.redeem.setCookie, "dsh-panel");
  killFlow.fresh = freshCookie ? await call(panelTarget, "/pair", { cookie: freshCookie }) : { body: "" };
  killFlow.urls = urls.length;
} finally {
  await killBridge.stop();
  fs.rmSync(spawnRoot, { recursive: true, force: true });
}
check("kill switch: sesion y pestana viejas del panel dejan de contar como panel abierto",
  killFlow.kill.status === 200 && /"panelTabsClosed":[1-9]/.test(killFlow.kill.body) &&
    /"panelSessionsClosed":[1-9]/.test(killFlow.kill.body) && killFlow.sseClosed &&
    killFlow.stale.body.includes("Falta la credencial"),
  `body=${killFlow.kill.body.slice(0, 120)} sseCerrado=${killFlow.sseClosed}`);
check("kill switch -> el telefono conserva su solicitud pendiente y open-panel responde 200",
  killFlow.polledAgain.status === 200 && killFlow.open.status === 200 &&
    (process.platform !== "win32" || killFlow.open.body.includes('"ok":true')),
  `poll=${killFlow.polledAgain.status} open=${killFlow.open.status} ${killFlow.open.body.slice(0, 90)}`);
if (process.platform === "win32") {
  check("kill switch -> open-panel abre ventana con boleto nuevo y el boleto canjea sesion",
    killFlow.urls > 0 && killFlow.redeem.status === 303 &&
      killFlow.fresh.body.includes("Dispositivos autorizados"),
    `boletos=${killFlow.urls} redeem=${killFlow.redeem.status}`);
} else {
  console.log("OMITIDO  ventana del panel tras el kill switch: solo Windows abre ventanas");
}

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
