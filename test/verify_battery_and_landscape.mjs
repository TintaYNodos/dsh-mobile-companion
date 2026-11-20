/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Verifica lo que no depende del modo retirado:
 *   - el CSS movil no rompe el paisaje (sin `flex-direction: column` forzado en
 *     #root/#app y con reglas propias para >= 600px);
 *   - la bateria se recolecta en system-stats con el contrato esperado y con
 *     cache rapida en la segunda llamada;
 *   - la pagina /offline conserva sus dos pestañas utiles (estado del puente y
 *     lector offline) y no contiene emojis.
 *
 * No necesita el puente ni DSH: solo importa los modulos y lee offline.html.
 *
 *   node test/verify_battery_and_landscape.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { MOBILE_STYLES } from "../src/mobile-styles.mjs";
import { queryBattery, collectSystemStats } from "../src/system-stats.mjs";
import { config } from "../src/config.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// 1. CSS en modo paisaje
const destructiveRule = /#root[^}]*flex-direction:\s*column/i.test(MOBILE_STYLES) ||
  /#app[^}]*flex-direction:\s*column/i.test(MOBILE_STYLES);
check("CSS landscape: no fuerza flex-direction column en root/app", !destructiveRule);
check("CSS landscape: define reglas para >= 600px", MOBILE_STYLES.includes("@media (min-width: 600px)"));

// 2. Bateria en system-stats.
// El total de comprobaciones NO puede depender de si esta maquina tiene bateria
// (o de si WMI responde a tiempo): con el bloque condicional, dos corridas del
// mismo commit daban 413 y 416. Las cuatro comprobaciones se registran siempre y,
// sin sonda, pasan como "no aplica" con motivo explicito. DSH_TEST_BATTERY=0
// fuerza la rama sin bateria para probarla en cualquier equipo.
const forcedNoBattery = process.env.DSH_TEST_BATTERY === "0";
const battery = forcedNoBattery ? null : queryBattery();
const stats = collectSystemStats();
check("collectSystemStats incluye campo battery", "battery" in stats);
const noBatteryDetail = forcedNoBattery ? "forzado sin bateria (DSH_TEST_BATTERY=0)" : "sin bateria: no aplica";
check("battery: percent disponible o no aplica", battery === null || (typeof battery.percent === "number" && battery.percent >= 0 && battery.percent <= 100), battery === null ? noBatteryDetail : `percent=${battery.percent}`);
check("battery: plugged disponible o no aplica", battery === null || typeof battery.plugged === "boolean", battery === null ? noBatteryDetail : `plugged=${battery.plugged}`);
check("battery: charging disponible o no aplica", battery === null || typeof battery.charging === "boolean", battery === null ? noBatteryDetail : `charging=${battery.charging}`);
check("battery: status disponible o no aplica", battery === null || (typeof battery.status === "string" && battery.status.length > 0), battery === null ? noBatteryDetail : `status=${battery.status}`);

// 3. Cache de 30 segundos
const t1 = Date.now();
const b1 = queryBattery();
const t2 = Date.now();
check("segunda llamada de bateria usa cache rapido", (t2 - t1) < 50, `delta=${t2 - t1}ms`);

// 4. La pagina offline conserva la navegacion util
const offlineHtml = fs.readFileSync(path.join(config.root, "offline.html"), "utf8");
check("offline.html conserva la pestaña de estado", offlineHtml.includes('id="tabStatus"'));
check("offline.html conserva la pestaña del lector", offlineHtml.includes('id="tabReader"'));
check("offline.html conserva las dos secciones", offlineHtml.includes('id="sectionStatus"') && offlineHtml.includes('id="sectionReader"'));
check("offline.html no contiene emojis", !/\p{Extended_Pictographic}/u.test(offlineHtml));

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length} pruebas correctas`);
if (checks.some((c) => !c)) process.exitCode = 1;
