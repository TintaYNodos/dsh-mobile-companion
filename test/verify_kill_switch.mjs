import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HOST, PORT, accessKey, authHeader } from "./_harness.mjs";

const call = (pathname, { method = "GET", headers = {}, body = null, cookie = null } = {}) =>
  new Promise((resolve) => {
    const merged = { ...headers };
    if (cookie) merged.cookie = cookie;
    if (body) merged["content-type"] = "application/x-www-form-urlencoded";
    const req = http.request({ hostname: HOST, port: PORT, path: pathname, method, headers: merged, agent: false, timeout: 8000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers || {},
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });
    req.on("error", (e) => resolve({ status: 0, headers: {}, body: e.code }));
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, body: "timeout" }); });
    if (body) req.write(body);
    req.end();
  });

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// 1. Sin autorizacion se rechaza con 403
const unauth = await call("/dsh-companion/kill-switch", { method: "POST" });
check("kill-switch sin autorizacion rechazado", unauth.status === 403, `status=${unauth.status}`);

// 2. La ejecucion real es DESTRUCTIVA: revoca los dispositivos de la instancia
//    viva y rota la clave de acceso (deja fuera al telefono emparejado). Por eso
//    solo corre cuando se pide de forma explicita.
if (process.env.DSH_TEST_DESTRUCTIVE !== "1") {
  console.log("OMITIDO  kill-switch real: revoca dispositivos y rota la clave. Usa DSH_TEST_DESTRUCTIVE=1 para ejecutarlo.");
} else {
  const key = accessKey();
  const authed = await call("/dsh-companion/kill-switch", {
    method: "POST",
    headers: authHeader(key),
  });
  check("kill-switch con accessKey aceptado", authed.status === 200 && authed.body.includes('"ok":true'), authed.body);
  // Tras girar la clave, la anterior deja de autorizar.
  const stale = await call("/dsh-companion/status", { headers: authHeader(key) });
  check("la clave anterior deja de servir tras el kill switch", stale.body.includes('"status":"pairing"') || stale.status === 403, `status=${stale.status}`);
}

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
