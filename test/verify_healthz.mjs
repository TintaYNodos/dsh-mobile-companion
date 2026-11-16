/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Verificacion 5.2.1 de /healthz y del contrato con DeepSeek Harness.
 *
 * Fuera del conteo historico 14 suites / 235 (local) y 203 (CI): se ejecuta como
 * comprobacion adicional para no romper la comparabilidad de esa cifra.
 *
 *   node test/verify_healthz.mjs
 *
 * - La funcion pura computeHealth() se prueba con estados inyectados.
 * - Un puente aislado con el doble de Harness demuestra el camino sano
 *   (`ok`/`degraded`, HTTP 200) y que /status expone el contrato.
 * - Un segundo puente aislado apuntando a un puerto muerto demuestra el camino
 *   caido (`down`, HTTP 503): /healthz distingue sano de caido.
 *
 * Nunca toca el DSH_HOME ni los puertos del usuario.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "..");
const { computeHealth, isTrueLoopback, redactHealth } = await import(pathToFileURL(path.join(REPO, "src", "healthz.mjs")).href);
const { config } = await import(pathToFileURL(path.join(REPO, "src", "config.mjs")).href);
const { startBridge } = await import(pathToFileURL(path.join(here, "ci", "start-bridge.mjs")).href);

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const get = (port, pathname, headers = {}) =>
  new Promise((resolve) => {
    const request = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method: "GET", headers, timeout: 6000, agent: false },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    request.on("timeout", () => { request.destroy(); resolve({ status: 0, headers: {}, body: "" }); });
    request.on("error", () => resolve({ status: 0, headers: {}, body: "" }));
    request.end();
  });

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

// ---------------------------------------------------------------------------
// 1. computeHealth: estados inyectados (sin puente).
// ---------------------------------------------------------------------------
const healthyContract = {
  checkedAt: new Date().toISOString(),
  running: false,
  ok: true,
  degraded: [],
  unknown: [],
  checks: [{ id: "port", title: "puerto", status: "ok", detail: "", critical: true }],
};
const apk = { sha256: "a".repeat(64) };
const bridgeInfo = { listenPort: 57420, panelPort: 57421, bindHost: "127.0.0.1" };

const okHealth = computeHealth({ bridge: bridgeInfo, harness: { ok: true, port: 52710, identity: "confirmed", httpStatus: 200 }, contract: healthyContract, apk });
check("computeHealth: sano -> status ok", okHealth.status === "ok" && okHealth.ok === true, okHealth.status);
check("computeHealth: incluye version y sha256 del APK", okHealth.version === config.version && okHealth.apkSha256 === apk.sha256, `${okHealth.version}/${okHealth.apkSha256.slice(0, 8)}`);
check("computeHealth: incluye puertos del puente", okHealth.bridge.listenPort === 57420 && okHealth.bridge.panelPort === 57421);

const downHealth = computeHealth({ bridge: bridgeInfo, harness: { ok: false, port: 52710, identity: "none", httpStatus: 0 }, contract: healthyContract, apk });
check("computeHealth: Harness caido -> status down", downHealth.status === "down" && downHealth.ok === false, downHealth.status);
check("computeHealth: caido no se disfraza de sano", downHealth.harness.ok === false && downHealth.harness.httpStatus === 0);

const degradedContract = { ...healthyContract, ok: true, degraded: ["approval-key"], unknown: [] };
const degradedHealth = computeHealth({ bridge: bridgeInfo, harness: { ok: true, port: 52710, identity: "confirmed", httpStatus: 200 }, contract: degradedContract, apk });
check("computeHealth: contrato degradado -> status degraded (no down)", degradedHealth.status === "degraded" && degradedHealth.ok === false, degradedHealth.status);
check("computeHealth: contrato sin comprobar aun -> degraded", computeHealth({ bridge: bridgeInfo, harness: { ok: true }, contract: null, apk }).status === "degraded");

// ---------------------------------------------------------------------------
// 2. Puente aislado con el doble de Harness: camino sano.
// ---------------------------------------------------------------------------
const bridge = await startBridge();
try {
  // El contrato se comprueba en segundo plano al arrancar (empieza a los 1,5 s).
  let health = await get(bridge.bridgePort, "/healthz");
  let body = JSON.parse(health.body || "{}");
  const contractDeadline = Date.now() + 15_000;
  while (Date.now() < contractDeadline && !(body.contract && body.contract.checkedAt)) {
    await sleep(250);
    health = await get(bridge.bridgePort, "/healthz");
    body = JSON.parse(health.body || "{}");
  }
  check("/healthz responde 200 sin credenciales", health.status === 200, `status=${health.status}`);
  check("/healthz se identifica como dsh-companion", body.service === "dsh-companion" && body.version === config.version, `${body.service}/${body.version}`);
  check("/healthz dice que Harness responde (doble)", body.harness && body.harness.ok === true && body.harness.port === bridge.stubPort, `port=${body.harness && body.harness.port}`);
  check("/healthz no esta 'down'", body.status !== "down", `status=${body.status}`);
  check("/healthz espera a comprobar el contrato", Boolean(body.contract && body.contract.checkedAt), `${body.contract && body.contract.checkedAt}`);
  check("/healthz expone el contrato con sus piezas", Boolean(body.contract) && Array.isArray(body.contract.checks) && body.contract.checks.length === 5, `${body.contract && body.contract.checks.length} checks`);
  const ids = (body.contract?.checks || []).map((item) => item.id).join(",");
  check("/healthz: contrato incluye cookie, boot, turn/end y aprobaciones", ["port", "auth-cookie", "boot-marker", "turn/end", "approval-key"].every((id) => ids.includes(id)), ids);
  check("/healthz: cookie y marcador de arranque confirmados con el doble", (body.contract?.checks || []).filter((item) => item.critical).every((item) => item.status === "ok"));
  check("/healthz no filtra la cookie firmada", !/dsh-auth-[A-Za-z0-9_-]{43}=/.test(health.body) && !/secret:/i.test(health.body));
  check("/healthz pide no cachear", String(health.headers["cache-control"] || "").includes("no-store"));

  const auth = `Basic ${Buffer.from(`dsh:${bridge.accessKey}`, "utf8").toString("base64")}`;
  const status = await get(bridge.bridgePort, "/dsh-companion/status", { authorization: auth });
  const statusBody = JSON.parse(status.body || "{}");
  check("/status autorizado expone el contrato", status.status === 200 && Boolean(statusBody.contract) && Array.isArray(statusBody.contract.checks), `status=${status.status}`);
  check("/status conserva los campos de siempre", statusBody.version === config.version && statusBody.apkVersionCode === config.apkVersionCode && statusBody.dshOnline === true);
  const anon = JSON.parse((await get(bridge.bridgePort, "/dsh-companion/status")).body || "{}");
  check("/status anonimo NO expone el contrato", anon.contract === undefined && anon.status === "pairing", `status=${anon.status}`);
} finally {
  await bridge.stop();
}

// ---------------------------------------------------------------------------
// 3. Puente aislado con un Harness muerto: el puente sigue arriba y /healthz
//    responde 503. Se usa un puerto libre que nadie escucha.
// ---------------------------------------------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-healthz-down-"));
const home = path.join(root, "home");
const dshHome = path.join(home, ".dsh");
fs.mkdirSync(dshHome, { recursive: true });
fs.writeFileSync(
  path.join(dshHome, ".credentials.yaml"),
  `client-connection/browser-session:\n  secret: ${crypto.randomBytes(32).toString("base64url")}\n`,
  { encoding: "utf8", mode: 0o600 }
);
const [deadBridgePort, deadPanelPort, deadTargetPort] = [await freePort(), await freePort(), await freePort()];
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  DSH_HOME: dshHome,
  DSH_BIND_HOST: "127.0.0.1",
  DSH_LISTEN_PORT: String(deadBridgePort),
  DSH_PANEL_PORT: String(deadPanelPort),
  DSH_TARGET_PORT: String(deadTargetPort),
  DSH_ACCESS_KEY: crypto.randomBytes(24).toString("base64url"),
  DSH_BROWSER_SECRET: "",
  DSH_ACCESS_DISABLE: "0",
};
for (const name of ["DSH_COMPANION_TOKEN", "DSH_ALLOWED_HOSTS", "DSH_ALLOW_CIDR", "DSH_VPN_IP", "DSH_PANEL_TOKEN"]) delete env[name];
const child = spawn(process.execPath, [path.join(REPO, "bridge.mjs")], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let exited = false;
child.on("exit", () => { exited = true; });
const output = [];
child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));
let ready = false;
const deadline = Date.now() + 20_000;
while (Date.now() < deadline && !exited) {
  const status = await get(deadBridgePort, "/dsh-companion/status");
  if (status.status === 200) { ready = true; break; }
  await sleep(100);
}
try {
  check("puente sin Harness: el puente arranca igual", ready && !exited);
  const health = await get(deadBridgePort, "/healthz");
  const body = JSON.parse(health.body || "{}");
  // Si esta maquina tiene un DeepSeek Harness real en marcha, el descubrimiento
  // dinamico de puertos lo encuentra y el estado es sano: en ese caso el camino
  // "caido" no es observable aqui (lo cubre la funcion pura y la CI, que no
  // tiene Harness real). Se declara SKIP, no se finge un PASS.
  if (body.harness?.port === deadTargetPort) {
    check("puente sin Harness: /healthz responde 503", health.status === 503, `status=${health.status}`);
    check("puente sin Harness: status 'down' y no 'ok'", body.status === "down" && body.ok === false, `status=${body.status}`);
    check("puente sin Harness: harness.ok=false y puerto informado", body.harness?.ok === false && body.harness?.port === deadTargetPort, `port=${body.harness?.port}`);
  } else {
    console.log(
      `SKIP  puente sin Harness: esta maquina tiene un Harness real y el descubrimiento lo encontro en ${body.harness?.port}; ` +
        "el camino caido lo ejercitan la funcion pura computeHealth y la CI sin Harness"
    );
  }
  const status = await get(deadBridgePort, "/dsh-companion/status");
  check("puente sin Harness: /status sigue respondiendo (no muere)", status.status === 200, `status=${status.status}`);
} finally {
  try { child.kill("SIGTERM"); } catch {}
  const stopDeadline = Date.now() + 5000;
  while (!exited && Date.now() < stopDeadline) await sleep(50);
  if (!exited) { try { child.kill("SIGKILL"); } catch {} }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { fs.rmSync(root, { recursive: true, force: true }); break; } catch { await sleep(100); }
  }
  if (!ready) console.log(output.join("").split(/\r?\n/).slice(-12).join("\n"));
}

check("isTrueLoopback: 127.0.0.1", isTrueLoopback("127.0.0.1"));
check("isTrueLoopback: ::1", isTrueLoopback("::1"));
check("isTrueLoopback: ::ffff:127.0.0.1", isTrueLoopback("::ffff:127.0.0.1"));
check("isTrueLoopback: IP de la VPN no es loopback", isTrueLoopback("192.0.2.10") === false);
check("isTrueLoopback: vacio no es loopback", isTrueLoopback("") === false);
const fullHealth = computeHealth({
  bridge: bridgeInfo,
  harness: { ok: true, port: 52710, identity: "confirmed", httpStatus: 200 },
  contract: { ok: true, degraded: [], unknown: [], checks: [] },
  apk,
});
const redacted = redactHealth(fullHealth, false);
check("redactHealth: fuera de loopback no revela bindHost", redacted.bindHost === undefined);
check("redactHealth: fuera de loopback no revela puerto de Harness", redacted.harness === undefined);
check("redactHealth: fuera de loopback no revela contrato", redacted.contract === undefined);
check("redactHealth: fuera de loopback conserva estado", redacted.status === "ok" && redacted.ok === true);
check("redactHealth: loopback conserva el detalle", redactHealth(fullHealth, true).bridge.bindHost !== undefined);

const passed = checks.filter(Boolean).length;
console.log(`\nRESULTADO: ${passed}/${checks.length} comprobaciones correctas`);
if (checks.some((item) => !item)) process.exitCode = 1;
