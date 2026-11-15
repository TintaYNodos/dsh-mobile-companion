/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Ejecuta toda la suite de verificacion contra un puente ya levantado.
 *
 *   node test/run-all.mjs
 *
 * Variables: DSH_TEST_HOST (por defecto 127.0.0.1), DSH_TEST_PORT (57420),
 * DSH_PANEL_PORT (57421). Necesita que el puente este corriendo: las pruebas
 * hablan con la instancia real, no con un doble. La excepcion es
 * verify_config_guard.mjs, que trabaja con subprocesos y funciones puras.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  "verify_config_guard.mjs",
  "verify_injection.mjs",
  "verify_access_key.mjs",
  "verify_registry_safety.mjs",
  "verify_bridge.mjs",
  "verify_sync_ws.mjs",
  "verify_satellite_and_battery.mjs",
  "verify_subagente_a.mjs",
  "verify_approval.mjs",
  "verify_panel.mjs",
  "verify_kill_switch.mjs",
];

let passed = 0;
let failed = 0;

for (const file of FILES) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, file)], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
    child.on("error", () => resolve(1));
  });
  if (code === 0) passed++;
  else failed++;
}

console.log(`\n${passed}/${FILES.length} archivos correctos, ${failed} con fallos`);
if (failed > 0) process.exitCode = 1;
