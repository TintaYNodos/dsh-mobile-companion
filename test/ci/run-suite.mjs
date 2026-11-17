/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Runner de la suite que sí puede correr en CI.
 *
 *   npm run test:ci
 *
 * Arranca un puente aislado (test/ci/start-bridge.mjs: HOME y DSH_HOME
 * temporales, puertos libres de loopback, backend DSH mínimo de pruebas), corre
 * las suites que no necesitan un DeepSeek Harness real, resume PASS/FAIL/SKIP y
 * devuelve código 1 si algo falla. Al terminar cierra el puente y COMPRUEBA
 * (H-17) que el synced_chats/ y el bridge.log del repositorio no cambiaron: la
 * suite escribe en DSH_SYNC_DIR/DSH_LOG_FILE temporales, nunca en los del
 * usuario.
 *
 * Las suites que exigen el backend real o son destructivas se declaran omitidas
 * con su motivo: no se finge que corren.
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, pingPanel, startBridge } from "./start-bridge.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(here, "..");
const REPO_SYNC_DIR = path.join(REPO_ROOT, "synced_chats");
const REPO_BRIDGE_LOG = path.join(REPO_ROOT, "bridge.log");

/** Orden equivalente al de test/run-all.mjs para estas suites. */
const SUITES = [
  "verify_config_guard.mjs",
  "verify_injection.mjs",
  "verify_access_key.mjs",
  "verify_registry_safety.mjs",
  "verify_bridge.mjs",
  "verify_notes.mjs",
  "verify_battery_and_landscape.mjs",
  "verify_subagente_a.mjs",
  "verify_panel.mjs",
  "verify_log_rotation.mjs",
  "verify_vpn_detection.mjs",
  "verify_device_profiles.mjs",
];

/**
 * Suites fuera de CI, con el motivo real. `verify_kill_switch.mjs` imprime su
 * propio omitido, pero se excluye el archivo entero: su valor está en la parte
 * destructiva que CI no debe ejecutar.
 */
const SKIPPED = [
  {
    file: "verify_sync_ws.mjs",
    reason: "necesita el WebSocket del backend DeepSeek Harness real; el doble de CI no habla WS",
  },
  {
    file: "verify_kill_switch.mjs",
    reason: "destructiva: revoca dispositivos y rota la clave de acceso (solo con DSH_TEST_DESTRUCTIVE=1)",
  },
  {
    file: "verify_approval.mjs",
    reason:
      "duplica el flujo de aprobación de verify_panel.mjs y su boleto de panel es de un solo uso: " +
      "dos suites no pueden canjear el mismo DSH_PANEL_TOKEN sin reiniciar el puente",
  },
];

const listFiles = (dir, prefix = "") => {
  const files = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(dir, entry.name), relative));
    else files.push(relative);
  }
  return files;
};

/**
 * H-17: huella de solo lectura del synced_chats/ y del bridge.log DEL
 * REPOSITORIO (los del usuario). No se escribe ni se restaura nada: si la
 * huella cambia al correr la suite, es un fallo (la suite toco los del usuario).
 */
const hashFile = (file) => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return "ausente";
  }
};

const fingerprintRepo = () => {
  const files = listFiles(REPO_SYNC_DIR).sort();
  const manifest = files.map((relative) => `${relative}:${hashFile(path.join(REPO_SYNC_DIR, ...relative.split("/")))}`);
  let logSignal = "ausente";
  try {
    const stat = fs.statSync(REPO_BRIDGE_LOG);
    logSignal = `${stat.size}:${stat.mtimeMs}:${hashFile(REPO_BRIDGE_LOG)}`;
  } catch {
    logSignal = "ausente";
  }
  return {
    sync: crypto.createHash("sha256").update(manifest.join("\n")).digest("hex"),
    files: files.length,
    log: logSignal,
  };
};

/**
 * Aísla cada suite con un registro vacío. verify_registry_safety.mjs restaura
 * al salir el registro que encontró (con un dispositivo de prueba de otra
 * dirección), y sin este reinicio verify_panel.mjs revocaría ese dispositivo
 * ajeno en vez del que acaba de aprobar. Todo ocurre en el DSH_HOME temporal.
 */
const resetRegistry = (dshHome) => {
  for (const name of ["companion-devices.json", "companion-devices.json.corrupt"]) {
    try {
      fs.rmSync(path.join(dshHome, name), { force: true });
    } catch {
      // Si no existe, ya está en el estado deseado.
    }
  }
};

/** Mantiene despierto el panel en Windows para que el puente no abra ventanas. */
const startPanelPing = (panelPort) => {
  if (process.platform !== "win32") return null;
  void pingPanel(panelPort);
  const timer = setInterval(() => void pingPanel(panelPort), 3000);
  timer.unref?.();
  return timer;
};

/** Ejecuta un archivo verify_*.mjs, reenvía su salida y cuenta PASS/FAIL/SKIP. */
const SUITE_TIMEOUT_MS = 180_000;
const runSuite = (file, env) =>
  new Promise((resolve) => {
    const counts = { pass: 0, fail: 0, skip: 0 };
    const child = spawn(process.execPath, [path.join(TEST_DIR, file)], {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const scan = (stream) => {
      const lines = readline.createInterface({ input: stream });
      lines.on("line", (line) => {
        process.stdout.write(`${line}\n`);
        if (/^PASS\b/.test(line)) counts.pass += 1;
        else if (/^FAIL\b/.test(line)) counts.fail += 1;
        else if (/^(SKIP|OMITIDO)\b/.test(line)) counts.skip += 1;
      });
    };
    scan(child.stdout);
    scan(child.stderr);

    const watchdog = setTimeout(() => {
      console.log(`\n[ci] TIMEOUT ${file}: ${SUITE_TIMEOUT_MS / 1000}s, se mata el proceso`);
      try {
        child.kill("SIGKILL");
      } catch {
        // El proceso ya terminó.
      }
    }, SUITE_TIMEOUT_MS);
    watchdog.unref?.();

    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      // Deja que readline entregue las últimas líneas antes de resolver.
      setTimeout(() => resolve({ code: code ?? 1, checks: { ...counts } }), 50);
    };
    child.on("error", () => finish(1));
    child.on("close", (code) => finish(code));
  });

const main = async () => {
  console.log(`[ci] Node ${process.version} · ${process.platform}`);
  const repoBefore = fingerprintRepo();
  const bridge = await startBridge();
  console.log(`[ci] Puente aislado en http://127.0.0.1:${bridge.bridgePort} (panel ${bridge.panelPort}, backend de pruebas ${bridge.stubPort})`);
  console.log(`[ci] DSH_HOME temporal: ${bridge.dshHome}`);

  const testEnv = {
    ...bridge.env,
    DSH_TEST_HOST: "127.0.0.1",
    DSH_TEST_PORT: String(bridge.bridgePort),
    DSH_PANEL_PORT: String(bridge.panelPort),
  };

  const pinger = startPanelPing(bridge.panelPort);
  const totals = { pass: 0, fail: 0, skip: 0 };
  const suites = { pass: 0, fail: 0 };
  const failed = [];

  try {
    for (const file of SUITES) {
      resetRegistry(bridge.dshHome);
      console.log(`\n[ci] === ${file} ===`);
      const result = await runSuite(file, testEnv);
      totals.pass += result.checks.pass;
      totals.fail += result.checks.fail;
      totals.skip += result.checks.skip;
      const ok = result.code === 0 && result.checks.fail === 0;
      if (ok) {
        suites.pass += 1;
        console.log(`[ci] PASS ${file} (exit ${result.code})`);
      } else {
        suites.fail += 1;
        failed.push(file);
        console.log(`[ci] FAIL ${file} (exit ${result.code})`);
      }
    }
  } finally {
    if (pinger) clearInterval(pinger);
    await bridge.stop();
    const exitCode = bridge.exitCode();
    console.log(`[ci] Puente cerrado tras SIGTERM${exitCode === null ? "" : ` (exit=${exitCode})`}`);
  }

  // H-17: el synced_chats/ del repositorio no debe cambiar y el log del puente
  // de prueba debe ser temporal. El bridge.log del repo puede cambiar por el
  // puente REAL del usuario (que sigue escribiendo mientras corre la suite), asi
  // que compararlo daba falsos positivos: lo que se comprueba es que ESTA suite
  // no apunta su log al del repo.
  const repoAfter = fingerprintRepo();
  const logIsolated = path.resolve(bridge.env.DSH_LOG_FILE || "") !== path.resolve(REPO_BRIDGE_LOG);
  const isolationOk = repoBefore.sync === repoAfter.sync && logIsolated;
  console.log(
    `${isolationOk ? "PASS" : "FAIL"}  H-17 aislamiento: synced_chats/ (${repoAfter.files} archivos) intacto y bridge.log de la suite en temporal`,
    `sync=${repoAfter.sync.slice(0, 12)} log=${logIsolated ? "temporal" : "DEL REPO"}`
  );
  if (!isolationOk) process.exitCode = 1;

  console.log("\n[ci] === Resumen ===");
  console.log(`[ci] Suites: ${suites.pass} PASS, ${suites.fail} FAIL, ${SKIPPED.length} SKIP`);
  console.log(`[ci] Comprobaciones: ${totals.pass} PASS, ${totals.fail} FAIL, ${totals.skip} SKIP`);
  for (const item of SKIPPED) console.log(`[ci] SKIP ${item.file}: ${item.reason}`);

  if (failed.length) {
    console.log(`[ci] Fallaron: ${failed.join(", ")}`);
    const tail = bridge.output();
    if (tail) console.log(`\n[ci] Salida del puente (cola):\n${tail}`);
    process.exitCode = 1;
  } else {
    console.log("[ci] Todo lo que corre en CI pasó.");
  }
};

try {
  await main();
} catch (error) {
  console.error(`[ci] Error del runner: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
}
