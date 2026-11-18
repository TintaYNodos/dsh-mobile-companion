/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Ejecuta toda la suite de verificacion MANUAL contra un puente ya levantado.
 *
 *   DSH_TEST_HOST=127.0.0.1 DSH_TEST_PORT=<libre> DSH_PANEL_PORT=<libre> \
 *     node test/run-all.mjs
 *
 * A diferencia de la suite de CI (`npm run test:ci`), estas pruebas hablan con
 * una instancia viva. Para que nunca puedan golpear la instalacion real del
 * usuario (paso: verify_panel revoco el telefono real porque revocaba "el
 * primer id" del panel):
 *
 *   1. DSH_TEST_HOST y DSH_TEST_PORT son OBLIGATORIOS: sin ellos no se ejecuta
 *      nada. Ya no hay valores por defecto silenciosos a 57420/57421.
 *   2. Se aborta si el registro de dispositivos del HOME real tiene algun
 *      dispositivo emparejado: esa es la senal de que se apunta a la
 *      instalacion real. Para probar, usa una instancia aislada
 *      (`node test/ci/start-bridge.mjs` imprime host/puertos/token) con su
 *      propio DSH_HOME temporal.
 *   3. Se aborta si el puente no responde en el host/puerto indicados.
 *
 * DSH_PANEL_PORT es opcional: por defecto se usa DSH_TEST_PORT + 1, igual que
 * el puente.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  "verify_config_guard.mjs",
  "verify_injection.mjs",
  "verify_client_ux.mjs",
  "verify_access_key.mjs",
  "verify_registry_safety.mjs",
  "verify_bridge.mjs",
  "verify_sync_ws.mjs",
  "verify_notes.mjs",
  "verify_battery_and_landscape.mjs",
  "verify_subagente_a.mjs",
  "verify_approval.mjs",
  "verify_panel.mjs",
  "verify_kill_switch.mjs",
  "verify_log_rotation.mjs",
  "verify_vpn_detection.mjs",
  "verify_device_profiles.mjs",
];

const abort = (message) => {
  console.error(`[run-all] ABORTADO: ${message}`);
  console.error("[run-all] Usa una instancia AISLADA (node test/ci/start-bridge.mjs) y su DSH_HOME temporal.");
  process.exit(1);
};

const host = String(process.env.DSH_TEST_HOST || "").trim();
const rawPort = String(process.env.DSH_TEST_PORT || "").trim();
if (!host) abort("falta DSH_TEST_HOST explicito (no hay valor por defecto).");
if (!rawPort) abort("falta DSH_TEST_PORT explicito (no hay valor por defecto).");
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) abort(`DSH_TEST_PORT="${rawPort}" no es un puerto valido.`);
const panelPort = String(process.env.DSH_PANEL_PORT || port + 1);

// Un registro con dispositivos equivale a "instalacion real en uso": la suite
// manual escribe y revoca dispositivos, asi que no se toca.
const dshHome = String(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"));
const registryPath = path.join(dshHome, "companion-devices.json");
const realDeviceCount = () => {
  let raw;
  try {
    raw = fs.readFileSync(registryPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    abort(`no se pudo leer el registro ${registryPath}: ${error.code || error.message}`);
  }
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    return Array.isArray(parsed.devices) ? parsed.devices.length : 0;
  } catch {
    abort(`el registro ${registryPath} no es JSON valido: no se puede comprobar que sea una instancia limpia.`);
  }
};
const devices = realDeviceCount();
if (devices > 0) {
  abort(
    `el registro de ${dshHome} tiene ${devices} dispositivo(s) emparejado(s): se apunta a la instalacion real. ` +
      "Respalda/renombra el registro o usa una instancia aislada con DSH_HOME temporal."
  );
}

const probe = (pathname) =>
  new Promise((resolve) => {
    const request = http.request(
      { hostname: host, port, path: pathname, method: "GET", timeout: 4000, agent: false },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode || 0));
      }
    );
    request.on("timeout", () => { request.destroy(); resolve(0); });
    request.on("error", () => resolve(0));
    request.end();
  });
const statusCode = await probe("/dsh-companion/status");
if (statusCode !== 200) {
  abort(`no hay un puente respondiendo en http://${host}:${port} (status=${statusCode}).`);
}

console.log(`[run-all] Puente explicito: http://${host}:${port} (panel ${panelPort})`);
console.log(`[run-all] Registro sin dispositivos: ${registryPath}`);
console.log("[run-all] Nota: la suite modifica el registro y synced_chats de ESTA instancia aislada.");

const childEnv = {
  ...process.env,
  DSH_TEST_HOST: host,
  DSH_TEST_PORT: String(port),
  DSH_PANEL_PORT: panelPort,
};

let passed = 0;
let failed = 0;

for (const file of FILES) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], {
      stdio: "inherit",
      env: childEnv,
    });
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
    child.on("error", () => resolve(1));
  });
  if (code === 0) passed++;
  else failed++;
}

console.log(`\n${passed}/${FILES.length} archivos correctos, ${failed} con fallos`);
if (failed > 0) process.exitCode = 1;
