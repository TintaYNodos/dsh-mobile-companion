import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { HOST, PORT, authHeader } from "./_harness.mjs";
import { buildAllowedSets } from "../src/routes.mjs";
import { isSameOriginRequest } from "../src/http.mjs";
import { QR_MAX_BYTES, generateQrSvg } from "../src/qr.mjs";
import { apkAnchorStatus, apkSha256 } from "../src/static.mjs";
import { REPO_ROOT, startBridge } from "./ci/start-bridge.mjs";



const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

function request(path, { method = "GET", headers = {}, body = null, withAuth = true } = {}) {
  if (withAuth) headers = { ...authHeader(), ...headers };
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path, method, headers, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers || {}, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, error: "timeout" }); });
    req.on("error", (e) => resolve({ status: 0, error: e.code || e.message }));
    if (body) req.write(body);
    req.end();
  });
}

const results = [];
const skipped = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};
/** Omite una comprobacion que depende de algo externo (no cuenta como fallo). */
const skip = (name, detail) => {
  skipped.push(name);
  console.log(`SKIP  ${name}${detail ? "  ->  " + detail : ""}`);
};

const safe = (response) => response || { status: 0, headers: {}, body: "" };

// 1. Estado
const status = await request("/dsh-companion/status");
let statusJson = {};
try { statusJson = JSON.parse(status.body); } catch {}
check("status 200 + json", status.status === 200 && statusJson.service === "dsh-companion", `dshOnline=${statusJson.dshOnline} port=${statusJson.targetPort}`);

// 2. Root mobile: inyeccion
const mobile = await request("/", { headers: { "user-agent": MOBILE_UA, accept: "text/html" } });
check("raiz movil 200", mobile.status === 200, `content-type=${mobile.headers["content-type"]}`);
check("viewport movil inyectado", mobile.body.includes("viewport-fit=cover"));
check("stylesheet companion inyectado", mobile.body.includes("dsh-companion-mobile"));
check("manifiesto unico (no duplica el del producto)", (mobile.body.match(/rel="manifest"/gi) || []).length <= 1);
check("sin encoding comprimido", !mobile.headers["content-encoding"], `encoding=${mobile.headers["content-encoding"] || "identity"}`);

// 3. Escritorio: sin inyeccion
const desktop = await request("/", { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", accept: "text/html" } });
check("raiz escritorio 200", desktop.status === 200);
check("escritorio sin inyeccion movil", !desktop.body.includes("dsh-companion-mobile"));

// 4. ?dshc=off
const optOut = await request("/?dshc=off", { headers: { "user-agent": MOBILE_UA, accept: "text/html" } });
check("opt-out ?dshc=off respeta", optOut.status === 200 && !optOut.body.includes("dsh-companion-mobile"));

// 5. Origin cruzado rechazado
const badOrigin = await request("/", { headers: { origin: "https://evil.example", accept: "text/html" } });
check("origin cruzado 403", badOrigin.status === 403, `status=${badOrigin.status}`);

// 6. Origin propio permitido
const goodOrigin = await request("/dsh-companion/status", { headers: { origin: `http://${HOST}:${PORT}` } });
check("origin propio 200", goodOrigin.status === 200);

// 7. Framing ambiguo
const ambiguous = await request("/dsh-companion/status", {
  headers: { "content-length": "0", "transfer-encoding": "chunked" },
});
check("framing ambiguo rechazado", ambiguous.status === 400, `status=${ambiguous.status}`);

// 8. /m redirige
const legacy = await request("/m");
check("/m -> 308 a /", legacy.status === 308 && legacy.headers.location === "/");

// 9. offline
const offline = await request("/offline", { headers: { "user-agent": MOBILE_UA } });
check("offline 200 html", offline.status === 200 && offline.body.includes("El puente esta activo"));

// 10. manifest
const manifest = await request("/companion.webmanifest");
check("manifest 200", manifest.status === 200 && manifest.body.includes("DSH Mobile Companion"));

// 11. sync valido
const payload = JSON.stringify({ sessionTitle: "Prueba de sincronizacion ñ áé", messages: [{ role: "user", content: "Hola <script>alert(1)</script>", timestamp: Date.now() }] });
const sync = await request("/dsh-companion/sync", { method: "POST", headers: { "content-type": "application/json" }, body: payload });
let syncJson = {};
try { syncJson = JSON.parse(sync.body); } catch {}
check("sync valido 200", sync.status === 200 && syncJson.ok === true, `id=${syncJson.id}`);

// 12. sync payload invalido
const badSync = await request("/dsh-companion/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [] }) });
check("sync vacio 400", badSync.status === 400);

// 13. sync JSON corrupto
const corrupt = await request("/dsh-companion/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{no-json" });
check("sync JSON invalido 400", corrupt.status === 400);

// 14. metodo no permitido
const wrongMethod = await request("/dsh-companion/sync", { method: "POST_NO_ALLOWED" });

// 14b. listado de chats sincronizados (/dsh-companion/chats)
const listChats = await request("/dsh-companion/chats");
let chatsJson = {};
try { chatsJson = JSON.parse(listChats.body); } catch {}
check("chats 200 lista", listChats.status === 200 && Array.isArray(chatsJson.chats) && chatsJson.chats.length > 0, `total=${chatsJson.total}`);

const sampleChat = chatsJson.chats?.[0];
check("chat item metadatos", Boolean(sampleChat?.id && sampleChat?.title && sampleChat?.markdownFile && Number.isInteger(sampleChat?.messageCount)));

// 14c. lectura de chat individual (/dsh-companion/chat/:id)
const chatDetail = await request(`/dsh-companion/chat/${sampleChat.id}`);
let chatDetailJson = {};
try { chatDetailJson = JSON.parse(chatDetail.body); } catch {}
check("chat detail 200 JSON", chatDetail.status === 200 && chatDetailJson.ok === true && Array.isArray(chatDetailJson.chat?.messages));

// 14d. lectura en formato markdown
const chatMd = await request(`/dsh-companion/chat/${sampleChat.id}?format=md`);
check("chat detail markdown 200", chatMd.status === 200 && chatMd.headers["content-type"]?.includes("text/markdown") && chatMd.body.includes("Sesion sincronizada"));

// 14e. chat inexistente 404
const chat404 = await request("/dsh-companion/chat/sync_inexistente_99999");
check("chat inexistente 404", chat404.status === 404);

// 14f. proteccion path traversal en chat/:id
const chatTraversal = await request("/dsh-companion/chat/..%2F..%2Fetc%2Fpasswd");
check("chat traversal 400 rechazado", chatTraversal.status === 400);

// 14g. chats metodo no permitido
const wrongChatsMethod = await request("/dsh-companion/chats", { method: "POST" });
check("chats POST 405", wrongChatsMethod.status === 405);

// 15. asset del backend proxificado.
// Depende del backend de DSH: si esta apagado o su interfaz no publica una hoja
// en /assets, la comprobacion se omite en vez de fallar (el nombre del asset
// cambia con cada build de DSH y no es parte del contrato del puente).
const cssMatch = mobile.body.match(/href="(\.?\/assets\/[^"]+\.css)"/);
if (statusJson.dshOnline !== true || !cssMatch) {
  skip(
    "asset CSS proxificado",
    statusJson.dshOnline !== true ? "backend DSH no disponible" : "la pagina no expone un CSS de /assets"
  );
} else {
  const cssPath = cssMatch[1].replace(/^\./, "");
  const css = await request(cssPath);
  if (css.status === 200 && css.body.length > 1000) {
    check("asset CSS proxificado", true, `${css.body.length} bytes`);
  } else {
    skip("asset CSS proxificado", `el backend no sirve ${cssPath} (status=${css.status})`);
  }
}

// 16. cabeceras de seguridad
check("nosniff presente", String(mobile.headers["x-content-type-options"] || "").includes("nosniff"));
check("sin x-forwarded expuesto", mobile.headers["x-forwarded-for"] === undefined);

// 17. H-02: al reconstruir los conjuntos de Host/Origin tras un cambio de IP no
// se deben perder los alias de loopback (watchBinding los olvidaba: 403 tras
// cambiar la IP del tunel).
const rebuilt = buildAllowedSets("192.0.2.50", PORT);
check("H-02: tras cambiar la IP siguen permitidos 127.0.0.1/localhost/[::1]",
  ["127.0.0.1", "localhost", "[::1]"].every((alias) =>
    rebuilt.allowedHosts.has(`${alias}:${PORT}`) && rebuilt.allowedOrigins.has(`http://${alias}:${PORT}`)) &&
    rebuilt.allowedHosts.has(`192.0.2.50:${PORT}`),
  [...rebuilt.allowedHosts].join(","));
check("H-02: isSameOriginRequest acepta el loopback con los conjuntos reconstruidos",
  isSameOriginRequest({ headers: { host: `127.0.0.1:${PORT}` } }, rebuilt.allowedOrigins, rebuilt.allowedHosts));

// 18. M3: /healthz pasa por la frontera de Host/Origin que antes se saltaba.
const foreignHost = await request("/healthz", { withAuth: false, headers: { host: `evil.example:${PORT}` } });
check("M3: /healthz con Host ajeno responde 403", foreignHost.status === 403, `status=${foreignHost.status}`);
const nullOrigin = await request("/healthz", { withAuth: false, headers: { origin: "null" } });
check("M3: /healthz con Origin:null responde 403", nullOrigin.status === 403, `status=${nullOrigin.status}`);
const crossOrigin = await request("/healthz", { withAuth: false, headers: { origin: "https://evil.example" } });
check("M3: /healthz cross-site responde 403", crossOrigin.status === 403, `status=${crossOrigin.status}`);
const ownHealth = await request("/healthz", { withAuth: false });
check("M3: /healthz con Host legitimo responde 200 (doctor/Docker siguen igual)",
  ownHealth.status === 200, `status=${ownHealth.status}`);

// 19. H-07: un GET/HEAD con content-length y sin cuerpo no debe reenviarse al
// backend: lo dejaba esperando bytes y envenenaba su keep-alive (+6 s).
const auth = authHeader();
const bodyless = await new Promise((resolve) => {
  const socket = net.connect(PORT, HOST);
  let data = "";
  let settled = false;
  const timer = setTimeout(() => done(0), 5000);
  const done = (status) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { socket.destroy(); } catch {}
    resolve({ status, bytes: data.length });
  };
  socket.on("connect", () => {
    socket.write(
      `GET / HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\nAuthorization: ${auth.authorization}\r\n` +
        "Content-Length: 5\r\nAccept: text/html\r\nConnection: close\r\n\r\n"
    );
  });
  socket.on("data", (chunk) => {
    data += chunk.toString("utf8");
    const match = /^HTTP\/1\.[01] (\d+)/.exec(data);
    if (match && data.includes("\r\n\r\n")) done(Number(match[1]));
  });
  socket.on("error", () => done(0));
});
check("H-07: GET con content-length y sin cuerpo responde sin colgar el backend",
  bodyless.status === 200, `status=${bodyless.status} bytes=${bodyless.bytes}`);

// 20. H-05/H-06: el QR falla de forma explicita si el texto no cabe; dos textos
// largos distintos no pueden producir el mismo codigo.
const fits = generateQrSvg("http://192.0.2.50:57420");
const tooLongA = `http://192.0.2.50:57420/${"a".repeat(QR_MAX_BYTES)}`;
const tooLongB = `http://192.0.2.50:57420/${"b".repeat(QR_MAX_BYTES)}`;
check("H-05/H-06: un texto que cabe genera SVG", typeof fits === "string" && fits.startsWith("<svg"));
check("H-05/H-06: dos textos >134 B no producen el mismo QR (fallo explicito)",
  Buffer.byteLength(tooLongA) > 134 && Buffer.byteLength(tooLongB) > 134 &&
    generateQrSvg(tooLongA) === null && generateQrSvg(tooLongB) === null,
  `A=${Buffer.byteLength(tooLongA)} B=${Buffer.byteLength(tooLongB)}`);
check("H-05/H-06: dos textos distintos que caben generan QR distintos",
  generateQrSvg("http://192.0.2.50:57420/uno") !== generateQrSvg("http://192.0.2.50:57420/dos"));
// H-06 llamadores: si el QR no cabe, el panel muestra la URL en texto y NUNCA
// un SVG de QR invalido.
const { approvalPage } = await import("../src/pairing.mjs");
const longUrl = `http://${"a".repeat(160)}.example:57420`;
const longPage = approvalPage({ bunkerUrl: longUrl });
check("H-06: el panel muestra la URL en texto cuando el QR no cabe",
  longPage.includes(longUrl) && longPage.includes("demasiado larga para un codigo QR") &&
    !longPage.includes('aria-label="Codigo QR'), `urlLarga=${longUrl.length}B`);

// 21. M5/H-14: una entera de entorno invalida avisa (valor rechazado + default).
const envProbe = spawnSync(
  process.execPath,
  ["--input-type=module", "-e", "const { config } = await import('./src/config.mjs'); console.log('port=' + config.targetPort);"],
  { cwd: REPO_ROOT, env: { ...process.env, DSH_TARGET_PORT: "abc" }, encoding: "utf8", timeout: 20_000, windowsHide: true }
);
check("M5: DSH_TARGET_PORT invalida avisa con el valor y el default aplicado",
  envProbe.status === 0 && String(envProbe.stdout).includes("port=52710") &&
    String(envProbe.stderr).includes('DSH_TARGET_PORT="abc"'),
  `exit=${envProbe.status} err=${String(envProbe.stderr).trim().slice(0, 120)}`);

// 21b. H-09: con la clave desactivada (clave vacia), cualquier Authorization
// marcaba "autenticado por clave". Debe ser false aunque la puerta de
// DSH_ACCESS_DISABLE siga abierta por su camino explicito.
const disableProbe = spawnSync(
  process.execPath,
  ["--input-type=module", "-e",
    "const { resolveAccessKey, hasValidAccessKey, accessKeyEnabled } = await import('./src/crypto.mjs');" +
      "const authorization = 'Basic ' + Buffer.from('dsh:lo-que-sea').toString('base64');" +
      "console.log(JSON.stringify({ keyLen: resolveAccessKey().length, enabled: accessKeyEnabled(), ok: hasValidAccessKey({ headers: { authorization } }) }));"],
  {
    cwd: REPO_ROOT,
    env: { ...process.env, DSH_ACCESS_DISABLE: "1", DSH_ACCESS_KEY: "", DSH_BIND_HOST: "127.0.0.1" },
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
  }
);
let disableState = {};
try { disableState = JSON.parse(String(disableProbe.stdout).trim().split(/\r?\n/).pop()); } catch {}
check("H-09: con clave vacia hasValidAccessKey=false (no marca autenticado) y la puerta sigue abierta",
  disableProbe.status === 0 && disableState.keyLen === 0 && disableState.enabled === false && disableState.ok === false,
  `exit=${disableProbe.status} ${JSON.stringify(disableState)}`);

// 22. M1/H-06: cierre ordenado por la bandera companion.stop (Windows no
// ejecuta los handlers de SIGTERM). Se prueba en un puente aislado propio.
const own = await startBridge();
try {
  fs.writeFileSync(own.stopFlag, "");
  const stopCode = await own.waitForExit(6000);
  const closed = await new Promise((resolve) => {
    const probe = http.request(
      { hostname: "127.0.0.1", port: own.bridgePort, path: "/dsh-companion/status", timeout: 1500, agent: false },
      (res) => { res.resume(); resolve(false); }
    );
    probe.on("timeout", () => { probe.destroy(); resolve(true); });
    probe.on("error", () => resolve(true));
    probe.end();
  });
  check("M1: companion.stop cierra el puente con exit 0 y suelta el puerto",
    stopCode === 0 && closed && own.output().includes("bandera companion.stop"),
    `exit=${stopCode} puertoCerrado=${closed}`);
} finally {
  await own.stop();
}

// 23. 5.3.4: ancla del APK. El SHA-256 debe calcularse sobre config.root y no
// depender del CWD del proceso; si falta el archivo, /status debe avisar con
// apkAnchorMissing=true en vez de que el telefono caiga en `no-anchor` y instale
// sin verificar.
const sha256Of = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const realApk = path.join(REPO_ROOT, "DSH-Companion.apk");
const realApkSha = sha256Of(realApk);
const originalCwd = process.cwd();
let cwdApkSha = "";
try {
  process.chdir(os.tmpdir());
  cwdApkSha = apkSha256();
} finally {
  process.chdir(originalCwd);
}
check("5.3.4 ancla APK: apkSha256() no depende del CWD (mismo SHA con CWD distinto)",
  cwdApkSha.length === 64 && cwdApkSha === realApkSha,
  `sha=${cwdApkSha.slice(0, 12)}… real=${realApkSha.slice(0, 12)}… cwd=${os.tmpdir()}`);
check("5.3.4 ancla APK: /status publica el SHA del APK real y apkAnchorMissing=false",
  statusJson.apkSha256 === realApkSha && statusJson.apkAnchorMissing === false,
  `sha=${String(statusJson.apkSha256).slice(0, 12)}… missing=${statusJson.apkAnchorMissing}`);

const anchorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-apk-anchor-"));
try {
  const missing = apkAnchorStatus(anchorRoot);
  check("5.3.4 ancla APK: sin el archivo apkSha256 queda vacio y apkAnchorMissing=true",
    missing.apkSha256 === "" && missing.apkAnchorMissing === true, JSON.stringify(missing));
  const fakeApk = path.join(anchorRoot, "DSH-Companion.apk");
  fs.writeFileSync(fakeApk, "apk-de-prueba");
  const present = apkAnchorStatus(anchorRoot);
  check("5.3.4 ancla APK: con el archivo en la raiz indicada el SHA es el del archivo servido",
    present.apkSha256 === sha256Of(fakeApk) && present.apkAnchorMissing === false,
    `sha=${present.apkSha256.slice(0, 12)}…`);
} finally {
  fs.rmSync(anchorRoot, { recursive: true, force: true });
}

// 24. 5.3.4: /status ya no bloquea con PowerShell sincrono. Antes la primera
// consulta pagaba ~2 s (spawnSync de bateria); ahora hay cache y refresco en
// segundo plano. Se mide la misma ruta repetida en el puente aislado.
const statusTimes = [];
for (let index = 0; index < 15; index += 1) {
  const started = performance.now();
  const measured = await request("/dsh-companion/status");
  statusTimes.push(performance.now() - started);
  if (measured.status !== 200) break;
}
const statusSorted = [...statusTimes].sort((a, b) => a - b);
const statusP50 = statusSorted[Math.floor(statusSorted.length / 2)] || 0;
const statusP95 = statusSorted[Math.min(statusSorted.length - 1, Math.floor(statusSorted.length * 0.95))] || 0;
const statusMax = statusSorted.at(-1) || 0;
check("5.3.4 /status: 15 consultas consecutivas no superan 200 ms (sin PowerShell bloqueante)",
  statusTimes.length === 15 && statusP95 < 200 && statusMax < 200,
  `p50=${statusP50.toFixed(1)}ms p95=${statusP95.toFixed(1)}ms max=${statusMax.toFixed(1)}ms`);

const failed = results.filter((r) => !r.ok);
const suffix = skipped.length ? ` (${skipped.length} omitida${skipped.length === 1 ? "" : "s"})` : "";
console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} pruebas correctas${suffix}`);
if (failed.length) process.exitCode = 1;
