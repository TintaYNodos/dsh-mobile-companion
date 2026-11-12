import http from "node:http";import { HOST, PORT, authHeader } from "./_harness.mjs";



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
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
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

// 15. asset del backend proxificado
const css = await request("/assets/index-lh_YM6sT.css");
check("asset CSS proxificado", css.status === 200 && css.body.length > 1000, `${css.body.length} bytes`);

// 16. cabeceras de seguridad
check("nosniff presente", String(mobile.headers["x-content-type-options"] || "").includes("nosniff"));
check("sin x-forwarded expuesto", mobile.headers["x-forwarded-for"] === undefined);

const failed = results.filter((r) => !r.ok);
console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} pruebas correctas`);
if (failed.length) process.exitCode = 1;
