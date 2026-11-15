/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Verifica los perfiles por dispositivo:
 *   - un registro anterior a los perfiles se lee como `full` / puerto por defecto;
 *   - `viewer` recibe 403 en escrituras y el allowlist de lecturas sigue pasando;
 *   - `full` escribe igual que siempre;
 *   - `targetPort` fijo lleva HTTP y WebSocket a otro backend de prueba;
 *   - si ese puerto no responde se cae al backend por defecto y se registra;
 *   - las acciones nuevas del panel (`/pair/set-role`, `/pair/set-target`)
 *     guardan el cambio, validan el puerto y exigen sesion de panel.
 *
 * Levanta su propio puente aislado (test/ci/start-bridge.mjs: DSH_HOME
 * temporal, HOME temporal, puertos libres y backend doble), asi que no toca la
 * instalacion real ni el puente de 57420/57421.
 *
 *   node test/verify_device_profiles.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { startBridge } from "./ci/start-bridge.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = (port, pathname, { method = "GET", headers = {}, body = null, timeout = 8000 } = {}) =>
  new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers, agent: false, timeout },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, headers: {}, body: "timeout" });
    });
    req.on("error", (error) => resolve({ status: 0, headers: {}, body: error.code || error.message }));
    if (body !== null) req.write(body);
    req.end();
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

/** Segundo backend de prueba: pagina con el marcador de DSH y upgrade WS. */
const startAltBackend = () =>
  new Promise((resolve) => {
    const state = { port: 0, upgraded: false };
    const tunnels = new Set();
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(`<!doctype html><html><head><title>alt</title></head><body>__DSH_BOOT__ ALT_${state.port}</body></html>`);
    });
    server.on("upgrade", (req, socket) => {
      state.upgraded = true;
      tunnels.add(socket);
      socket.on("close", () => tunnels.delete(socket));
      socket.on("error", () => tunnels.delete(socket));
      socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    });
    server.listen(0, "127.0.0.1", () => {
      state.port = server.address().port;
      resolve({
        state,
        close: () =>
          new Promise((done) => {
            for (const tunnel of tunnels) tunnel.destroy();
            tunnels.clear();
            server.close(() => done());
            if (typeof server.closeAllConnections === "function") server.closeAllConnections();
          }),
      });
    });
  });

/** Handshake WebSocket crudo contra el puente; devuelve lo que contesta. */
const wsHandshake = (port, cookie) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.write(
        [
          "GET /api/remote.mux HTTP/1.1",
          `Host: 127.0.0.1:${port}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version: 13",
          `Cookie: ${cookie}`,
          "",
          "",
        ].join("\r\n")
      );
    });
    let data = "";
    const finish = () => {
      socket.destroy();
      resolve(data);
    };
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.includes("\r\n")) finish();
    });
    socket.on("error", finish);
    socket.on("close", () => resolve(data));
    setTimeout(finish, 6000).unref?.();
  });

const registryPath = (bridge) => path.join(bridge.dshHome, "companion-devices.json");
const cookieOf = (device) => `dsh-companion-device=${device.id}`;
const makeDevice = (overrides = {}) => ({
  id: crypto.randomBytes(12).toString("base64url"),
  name: "",
  address: "10.9.9.9",
  agent: "prueba-perfiles",
  approvedAt: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  lastRefresh: new Date().toISOString(),
  claimed: true,
  ...overrides,
});
const writeRegistry = async (bridge, devices) => {
  fs.writeFileSync(registryPath(bridge), JSON.stringify({ devices, pending: [], history: [], denied: [] }, null, 2));
  await sleep(15); // deja que el puente note el cambio de mtime
};
const readRegistry = (bridge) => JSON.parse(fs.readFileSync(registryPath(bridge), "utf8"));

const bridge = await startBridge();
const alt = await startAltBackend();
const deadPort = await freePort();
const basic = { authorization: `Basic ${Buffer.from(`dsh:${bridge.accessKey}`).toString("base64")}` };

try {
  // 1. Registro vacio: comportamiento identico al anterior (backend por defecto).
  const empty = await request(bridge.bridgePort, "/", { headers: { ...basic, accept: "text/html" } });
  check("registro vacio usa el backend por defecto", empty.status === 200 && empty.body.includes("doble de CI"), `status=${empty.status}`);

  // 2. Registro antiguo (sin role/targetPort) se lee como `full`: la escritura
  //    llega al backend (404 del doble, NO el 403 de solo lectura).
  const oldDevice = makeDevice({ name: "registro-viejo" });
  await writeRegistry(bridge, [oldDevice]);
  const oldWrite = await request(bridge.bridgePort, "/api/session/prompt", {
    method: "POST",
    headers: { cookie: cookieOf(oldDevice), "content-type": "application/json" },
    body: '{"args":{}}',
  });
  check("registro antiguo se lee como full (escritura permitida)", oldWrite.status === 404, `status=${oldWrite.status}`);

  // 3. `viewer` no puede escribir.
  const viewer = makeDevice({ name: "solo-lectura", role: "viewer" });
  await writeRegistry(bridge, [viewer]);
  const viewerWrite = await request(bridge.bridgePort, "/api/session/prompt", {
    method: "POST",
    headers: { cookie: cookieOf(viewer), "content-type": "application/json" },
    body: '{"args":{}}',
  });
  check(
    "viewer rechazado al escribir (403 solo lectura)",
    viewerWrite.status === 403 && viewerWrite.body.includes("dispositivo en solo lectura"),
    `status=${viewerWrite.status} body=${viewerWrite.body.slice(0, 70)}`
  );

  // 4. El allowlist de lecturas sigue pasando (404 del doble = llego al backend).
  const viewerRead = await request(bridge.bridgePort, "/api/session/list", {
    method: "POST",
    headers: { cookie: cookieOf(viewer), "content-type": "application/json" },
    body: '{"args":{}}',
  });
  check("viewer puede leer por POST del allowlist", viewerRead.status === 404, `status=${viewerRead.status}`);

  // 5. Rutas de mutacion del puente rechazadas para viewer.
  const viewerSync = await request(bridge.bridgePort, "/dsh-companion/sync", {
    method: "POST",
    headers: { cookie: cookieOf(viewer), "content-type": "application/json" },
    body: '{"messages":[]}',
  });
  check("viewer rechazado en /sync", viewerSync.status === 403 && viewerSync.body.includes("dispositivo en solo lectura"), `status=${viewerSync.status}`);

  const viewerAbsorb = await request(bridge.bridgePort, "/dsh-companion/absorb-satellite", {
    method: "POST",
    headers: { cookie: cookieOf(viewer), "content-type": "application/json" },
    body: '{"satelliteId":"demo","messages":[]}',
  });
  check("viewer rechazado en absorb-satellite", viewerAbsorb.status === 403 && viewerAbsorb.body.includes("dispositivo en solo lectura"), `status=${viewerAbsorb.status}`);

  const viewerKill = await request(bridge.bridgePort, "/dsh-companion/kill-switch", {
    method: "POST",
    headers: { cookie: cookieOf(viewer) },
  });
  check("viewer rechazado en kill switch", viewerKill.status === 403 && viewerKill.body.includes("dispositivo en solo lectura"), `status=${viewerKill.status}`);
  check("kill switch del viewer no revoco el registro", readRegistry(bridge).devices.some((d) => d.id === viewer.id), "dispositivo sigue en el registro");

  const viewerAction = await request(bridge.bridgePort, "/dsh-companion/notification-action", {
    method: "POST",
    headers: { cookie: cookieOf(viewer), "content-type": "application/json" },
    body: '{"action":"approve_device","id":"x"}',
  });
  check("viewer rechazado en notification-action", viewerAction.status === 403 && viewerAction.body.includes("dispositivo en solo lectura"), `status=${viewerAction.status}`);

  // 6. `full` escribe igual que siempre.
  const full = makeDevice({ name: "control-total", role: "full" });
  await writeRegistry(bridge, [full]);
  const fullWrite = await request(bridge.bridgePort, "/api/session/prompt", {
    method: "POST",
    headers: { cookie: cookieOf(full), "content-type": "application/json" },
    body: '{"args":{}}',
  });
  check("full puede escribir", fullWrite.status === 404, `status=${fullWrite.status}`);

  // 7. `targetPort` por dispositivo: HTTP va al segundo backend.
  const targeted = makeDevice({ name: "otra-instancia", targetPort: alt.state.port });
  await writeRegistry(bridge, [targeted]);
  const targetPage = await request(bridge.bridgePort, "/", {
    headers: { cookie: cookieOf(targeted), accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120" },
  });
  check(
    "targetPort por dispositivo se usa en HTTP",
    targetPage.status === 200 && targetPage.body.includes(`ALT_${alt.state.port}`),
    `status=${targetPage.status} puerto=${alt.state.port}`
  );

  // 8. El mismo perfil se aplica al WebSocket.
  const wsResponse = await wsHandshake(bridge.bridgePort, cookieOf(targeted));
  check("targetPort por dispositivo se usa en WebSocket", wsResponse.startsWith("HTTP/1.1 101") && alt.state.upgraded, wsResponse.split("\r\n")[0] || "sin respuesta");

  // 9. Puerto fijo que no responde: fallback al backend por defecto y log.
  const broken = makeDevice({ name: "puerto-muerto", targetPort: deadPort });
  await writeRegistry(bridge, [broken]);
  const fallback = await request(bridge.bridgePort, "/", {
    headers: { cookie: cookieOf(broken), accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120" },
  });
  await sleep(50);
  const logs = bridge.output();
  check("fallback al backend por defecto si el puerto no responde", fallback.status === 200 && fallback.body.includes("doble de CI"), `status=${fallback.status}`);
  check("fallback registrado en el log", logs.includes(String(deadPort)) && logs.includes("no responde"), "log del puente");

  // 10. Panel: acciones nuevas con sesion de panel y validacion de puerto.
  const panelDevice = makeDevice({ name: "panel-perfiles" });
  await writeRegistry(bridge, [panelDevice]);
  const redeem = await request(bridge.panelPort, `/pair?t=${encodeURIComponent(bridge.panelToken)}`);
  const panelCookie = (redeem.headers["set-cookie"] || []).map((value) => value.split(";")[0]).find((value) => value.startsWith("dsh-panel=")) || "";
  check("panel entrega cookie de sesion", redeem.status === 303 && Boolean(panelCookie), `status=${redeem.status}`);

  const panelPage = await request(bridge.panelPort, "/pair", { headers: { cookie: panelCookie } });
  check(
    "panel muestra selector de rol y puerto destino",
    panelPage.status === 200 &&
      panelPage.body.includes('action="/pair/set-role"') &&
      panelPage.body.includes('action="/pair/set-target"') &&
      panelPage.body.includes("Solo lectura"),
    `status=${panelPage.status}`
  );

  const postPanel = (pathname, body) =>
    request(bridge.panelPort, pathname, {
      method: "POST",
      headers: { cookie: panelCookie },
      body,
    });

  const deadTarget = await postPanel("/pair/set-target", `id=${encodeURIComponent(panelDevice.id)}&targetPort=${deadPort}`);
  const afterDead = readRegistry(bridge).devices[0].targetPort ?? null;
  check(
    "panel no guarda un puerto que no responde",
    deadTarget.status === 303 && String(deadTarget.headers.location || "").includes("flash=target-down") && afterDead === null,
    `status=${deadTarget.status} flash=${deadTarget.headers.location || ""} targetPort=${afterDead}`
  );

  const liveTarget = await postPanel("/pair/set-target", `id=${encodeURIComponent(panelDevice.id)}&targetPort=${alt.state.port}`);
  check(
    "panel guarda el puerto destino comprobado",
    liveTarget.status === 303 && String(liveTarget.headers.location || "").includes("flash=target-set") && readRegistry(bridge).devices[0].targetPort === alt.state.port,
    `status=${liveTarget.status} flash=${liveTarget.headers.location || ""}`
  );

  const setViewer = await postPanel("/pair/set-role", `id=${encodeURIComponent(panelDevice.id)}&role=viewer`);
  check(
    "panel guarda el rol viewer",
    setViewer.status === 303 && String(setViewer.headers.location || "").includes("flash=role-viewer") && readRegistry(bridge).devices[0].role === "viewer",
    `status=${setViewer.status} flash=${setViewer.headers.location || ""}`
  );

  const afterPanel = await request(bridge.bridgePort, "/api/session/prompt", {
    method: "POST",
    headers: { cookie: cookieOf(panelDevice), "content-type": "application/json" },
    body: '{"args":{}}',
  });
  check("el rol cambiado desde el panel surte efecto", afterPanel.status === 403 && afterPanel.body.includes("dispositivo en solo lectura"), `status=${afterPanel.status}`);

  // 11. Sin sesion de panel las acciones nuevas no hacen nada.
  const noSession = await request(bridge.panelPort, "/pair/set-role", {
    method: "POST",
    body: `id=${encodeURIComponent(panelDevice.id)}&role=full`,
  });
  check("acciones nuevas exigen sesion de panel", noSession.status === 403, `status=${noSession.status}`);
} finally {
  // Primero el puente: al terminar, sus tuneles WS sueltan el backend de prueba.
  await bridge.stop();
  await alt.close();
}

const failed = checks.filter((ok) => !ok).length;
console.log(`\nRESULTADO: ${checks.length - failed}/${checks.length}`);
if (failed) process.exitCode = 1;
