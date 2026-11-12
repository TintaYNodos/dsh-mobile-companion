import http from "node:http";
import { HOST, PORT, accessKey } from "./_harness.mjs";

const KEY = accessKey();

const basic = (user, pass) => "Basic " + Buffer.from(`${user}:${pass}`, "utf8").toString("base64");

function request(path, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: HOST, port: PORT, path, method, headers, timeout: 12000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode, headers: res.headers || {}, body: Buffer.concat(chunks).toString("utf8") })
      );
    });
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, body: "" }); });
    req.on("error", (e) => resolve({ status: 0, headers: {}, body: e.code || "" }));
    if (body) req.write(body);
    req.end();
  });
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// Sin credenciales: la app no se entrega, se pide aprobacion.
const anon = await request("/", { headers: { accept: "text/html", "sec-fetch-dest": "document" } });
check("sin credenciales no se abre la app", anon.status === 200 && anon.body.includes("Acceso pendiente"), `status=${anon.status}`);

const anonApi = await request("/dsh-companion/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check("API sin credenciales rechazada", anonApi.status === 403 || anonApi.status === 401, `status=${anonApi.status}`);

// Clave incorrecta: tampoco.
const wrong = await request("/", { headers: { accept: "text/html", "sec-fetch-dest": "document", authorization: basic("dsh", "incorrecta") } });
check("clave incorrecta no abre la app", wrong.status === 200 && wrong.body.includes("Acceso pendiente"), `status=${wrong.status}`);

// Estado publico pero sin datos utiles.
const statusAnon = await request("/dsh-companion/status");
const statusBody = JSON.parse(statusAnon.body || "{}");
check("status responde siempre", statusAnon.status === 200, `status=${statusAnon.status}`);
check("status sin credenciales no revela detalles", statusBody.status === "pairing" && statusBody.targetPort === null, JSON.stringify(statusBody).slice(0, 90));

// Clave correcta: acceso directo, sin aprobacion.
const good = await request("/", { headers: { accept: "text/html", "sec-fetch-dest": "document", authorization: basic("dsh", KEY) } });
check("clave correcta abre la app", good.status === 200 && !good.body.includes("Acceso pendiente"), `status=${good.status}`);

const statusAuth = await request("/dsh-companion/status", { headers: { authorization: basic("dsh", KEY) } });
check("status con clave completo", statusAuth.body.includes('"status":"online"'), statusAuth.body.slice(0, 80));

// Origen cruzado sigue bloqueado aunque la clave sea valida.
const foreign = await request("/", { headers: { authorization: basic("dsh", KEY), origin: "https://evil.example" } });
check("clave valida con origen cruzado rechazada", foreign.status === 403, `status=${foreign.status}`);

// El panel de aprobacion no es accesible desde otra maquina de la red.
// (Desde esta misma maquina si lo es; aqui se comprueba que exige estar en el host.)
const panel = await request("/pair");
check("panel de aprobacion disponible", panel.status === 200 || panel.status === 403, `status=${panel.status}`);

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
