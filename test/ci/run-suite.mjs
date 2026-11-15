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
 * devuelve código 1 si algo falla. Al terminar cierra el puente y restaura los
 * archivos que la suite escribe en synced_chats/.
 *
 * Las suites que exigen el backend real o son destructivas se declaran omitidas
 * con su motivo: no se finge que corren.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, pingPanel, startBridge } from "./start-bridge.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(here, "..");
const SYNC_DIR = path.join(REPO_ROOT, "synced_chats");

/** Orden equivalente al de test/run-all.mjs para estas suites. */
const SUITES = [
  "verify_config_guard.mjs",
  "verify_injection.mjs",
  "verify_access_key.mjs",
  "verify_registry_safety.mjs",
  "verify_bridge.mjs",
  "verify_satellite_and_battery.mjs",
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

/** La suite escribe chats de prueba en synced_chats/: se fotografía y restaura. */
const snapshotSyncDir = () => {
  const snapshot = { files: new Set(listFiles(SYNC_DIR)), index: null, indexMtime: null };
  const indexPath = path.join(SYNC_DIR, "index.jsonl");
  try {
    snapshot.index = fs.readFileSync(indexPath);
    snapshot.indexMtime = fs.statSync(indexPath).mtime;
  } catch {
    snapshot.index = null;
    snapshot.indexMtime = null;
  }
  return snapshot;
};

const restoreSyncDir = (snapshot) => {
  for (const relative of listFiles(SYNC_DIR)) {
    if (snapshot.files.has(relative)) continue;
    try {
      fs.rmSync(path.join(SYNC_DIR, ...relative.split("/")), { force: true });
    } catch {
      // Un archivo que ya no existe no es un problema.
    }
  }
  const indexPath = path.join(SYNC_DIR, "index.jsonl");
  try {
    if (snapshot.index) {
      // Sin cambios en los bytes no se reescribe: el archivo del usuario
      // conserva su mtime.
      let current = null;
      try {
        current = fs.readFileSync(indexPath);
      } catch {
        current = null;
      }
      if (!current || !current.equals(snapshot.index)) {
        fs.writeFileSync(indexPath, snapshot.index);
        if (snapshot.indexMtime) fs.utimesSync(indexPath, new Date(), snapshot.indexMtime);
      }
    } else if (!snapshot.files.has("index.jsonl")) {
      fs.rmSync(indexPath, { force: true });
    }
  } catch {
    // Restaurar es cortesía: si falla, CI igual termina con el resultado real.
  }
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
  const snapshot = snapshotSyncDir();
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
    restoreSyncDir(snapshot);
  }

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
