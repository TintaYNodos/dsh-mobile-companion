/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (Business Source License 1.1) / Business Source License 1.1.
 * See companion/LICENSE or LICENSE for license terms.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFile, execSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let lastCpus = os.cpus();
let lastCpuTime = Date.now();
let lastCpuPercent = 0;

let hasThermalZone = null;
let lastTempC = null;
let lastTempSampleTime = 0;

/** Búfer circular en memoria para el historial de telemetría (últimos 5 minutos: 30 puntos cada 10s) */
export const MAX_TELEMETRY_HISTORY = 30;
export const TELEMETRY_INTERVAL_MS = 10000;
export const telemetryHistory = [];
let lastHistoryRecordTime = 0;

function calculateCpuPercent() {
  const currentCpus = os.cpus();
  const now = Date.now();
  if (now - lastCpuTime < 1000) {
    return lastCpuPercent;
  }

  let totalDelta = 0;
  let idleDelta = 0;

  for (let i = 0; i < currentCpus.length; i += 1) {
    const prev = lastCpus[i]?.times || { user: 0, sys: 0, idle: 0, irq: 0 };
    const curr = currentCpus[i]?.times || { user: 0, sys: 0, idle: 0, irq: 0 };

    const prevTotal = prev.user + prev.sys + prev.idle + (prev.irq || 0);
    const currTotal = curr.user + curr.sys + curr.idle + (curr.irq || 0);

    totalDelta += currTotal - prevTotal;
    idleDelta += curr.idle - prev.idle;
  }

  lastCpus = currentCpus;
  lastCpuTime = now;

  if (totalDelta <= 0) return lastCpuPercent;
  lastCpuPercent = Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
  return lastCpuPercent;
}

const THERMAL_COMMAND =
  "(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1).Temperature";

/** Aplica una lectura termica (K) a la cache; null/ultimo valor si no sirve. */
function applyThermalSample(output) {
  const kelvin = Number.parseInt(String(output ?? "").trim(), 10);
  if (Number.isFinite(kelvin) && kelvin > 200 && kelvin < 400) {
    hasThermalZone = true;
    lastTempC = Math.round(kelvin - 273.15);
    return lastTempC;
  }
  if (hasThermalZone === null) {
    hasThermalZone = false;
  }
  return lastTempC;
}

function queryTemperature() {
  if (hasThermalZone === false) return null;

  const now = Date.now();
  if (now - lastTempSampleTime < 5000 && lastTempC !== null) {
    return lastTempC;
  }
  lastTempSampleTime = now;

  if (process.platform !== "win32") {
    hasThermalZone = false;
    return lastTempC;
  }
  try {
    return applyThermalSample(
      execSync(`powershell.exe -NoProfile -Command "${THERMAL_COMMAND}"`, {
        encoding: "utf8",
        timeout: 800,
        stdio: ["ignore", "pipe", "ignore"],
      })
    );
  } catch {
    if (hasThermalZone === null) {
      hasThermalZone = false;
    }
    return lastTempC;
  }
}

/** Igual que queryTemperature pero asincrona: no bloquea el bucle de eventos. */
async function queryTemperatureAsync() {
  if (hasThermalZone === false) return null;

  const now = Date.now();
  if (now - lastTempSampleTime < 5000 && lastTempC !== null) {
    return lastTempC;
  }
  lastTempSampleTime = now;

  if (process.platform !== "win32") {
    hasThermalZone = false;
    return lastTempC;
  }
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", THERMAL_COMMAND], {
      encoding: "utf8",
      timeout: 800,
      windowsHide: true,
    });
    return applyThermalSample(stdout);
  } catch {
    if (hasThermalZone === null) {
      hasThermalZone = false;
    }
    return lastTempC;
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

let hasBattery = null;
let lastBattery = null;
let lastBatterySampleTime = 0;
const BATTERY_CACHE_MS = 30000;

const BATTERY_COMMAND =
  "Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1 -Property EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress";

/** Interpreta la salida JSON de Win32_Battery; null si no hay datos utiles. */
function parseBatteryOutput(raw) {
  const out = String(raw ?? "").trim();
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    const percent = Number(parsed.EstimatedChargeRemaining);
    const statusNum = Number(parsed.BatteryStatus);
    if (!Number.isFinite(percent)) return null;
    const charging = statusNum >= 6 && statusNum <= 9;
    const plugged = charging || statusNum === 2 || statusNum === 3;
    let status = "discharging";
    if (charging) status = "charging";
    else if (statusNum === 3) status = "full";
    else if (plugged) status = "plugged";
    else if (statusNum === 1 || statusNum === 4 || statusNum === 5) status = "discharging";
    else status = "unknown";
    return { percent, plugged, charging, status };
  } catch {
    return null;
  }
}

/** Bateria por sysfs de Linux (lectura local, sin procesos). */
function readLinuxBattery() {
  const base = "/sys/class/power_supply";
  if (!fs.existsSync(base)) return null;
  const entries = fs.readdirSync(base).filter((e) => e.startsWith("BAT"));
  if (entries.length === 0) return null;
  const batPath = path.join(base, entries[0]);
  const capFile = path.join(batPath, "capacity");
  if (!fs.existsSync(capFile)) return null;
  const statFile = path.join(batPath, "status");
  const percent = parseInt(fs.readFileSync(capFile, "utf8").trim(), 10);
  const rawStatus = fs.existsSync(statFile) ? fs.readFileSync(statFile, "utf8").trim().toLowerCase() : "unknown";
  const charging = rawStatus === "charging";
  const plugged = charging || rawStatus === "full" || rawStatus === "not charging";
  return { percent: Number.isFinite(percent) ? percent : 0, plugged, charging, status: rawStatus };
}

/** Interpreta `pmset -g batt` de macOS; null si no hay bateria interna. */
function parsePmsetOutput(out) {
  if (!out.includes("InternalBattery") && !out.includes("Battery")) return null;
  const match = out.match(/(\d+)%\s*;\s*([^;]+);/);
  if (!match) return null;
  const charging = match[2].trim().toLowerCase().includes("charging");
  const plugged = charging || out.includes("charged") || out.includes("'AC Power'");
  const status = charging ? "charging" : out.includes("charged") ? "full" : "discharging";
  return { percent: parseInt(match[1], 10), plugged, charging, status };
}

/** Guarda el resultado de una sonda en la cache y devuelve el valor efectivo. */
function applyBatteryResult(result, sampledAt) {
  if (result === null) {
    if (hasBattery === null) hasBattery = false;
    return null;
  }
  hasBattery = true;
  lastBattery = result;
  lastBatterySampleTime = sampledAt;
  return lastBattery;
}

export function queryBattery() {
  if (hasBattery === false) return null;

  const now = Date.now();
  if (hasBattery === true && now - lastBatterySampleTime < BATTERY_CACHE_MS && lastBattery !== null) {
    return lastBattery;
  }

  let result = null;
  try {
    if (process.platform === "win32") {
      const res = spawnSync("powershell.exe", ["-NoProfile", "-Command", BATTERY_COMMAND], {
        encoding: "utf8",
        timeout: 2500,
        stdio: ["ignore", "pipe", "ignore"],
      });
      result = parseBatteryOutput(res.stdout);
    } else if (process.platform === "linux") {
      result = readLinuxBattery();
    } else if (process.platform === "darwin") {
      result = parsePmsetOutput(
        execSync("pmset -g batt", { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] })
      );
    }
  } catch {
    if (hasBattery === true) return lastBattery;
  }
  return applyBatteryResult(result, now);
}

/** Igual que queryBattery pero asincrona: no bloquea el bucle de eventos. */
async function queryBatteryAsync() {
  if (hasBattery === false) return null;

  const now = Date.now();
  if (hasBattery === true && now - lastBatterySampleTime < BATTERY_CACHE_MS && lastBattery !== null) {
    return lastBattery;
  }

  let result = null;
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", BATTERY_COMMAND], {
        encoding: "utf8",
        timeout: 2500,
        windowsHide: true,
      });
      result = parseBatteryOutput(stdout);
    } else if (process.platform === "linux") {
      result = readLinuxBattery();
    } else if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("pmset", ["-g", "batt"], {
        encoding: "utf8",
        timeout: 1500,
        windowsHide: true,
      });
      result = parsePmsetOutput(stdout);
    }
  } catch {
    if (hasBattery === true) return lastBattery;
  }
  return applyBatteryResult(result, now);
}


// P32: la sonda de bateria NO se ejecuta al importar el modulo. Antes habia
// aqui un `queryBattery()` de arranque que lanzaba powershell.exe con
// spawnSync (hasta 2,5 s en Windows) y retrasaba el arranque del puente solo
// por cargar este modulo. Ahora la recoleccion es perezosa: la primera llamada
// a collectSystemStats() (o a queryBattery() directamente) hace la sonda y el
// resultado queda cacheado como antes.

/** Compone el objeto de telemetria a partir de muestras ya recogidas. */
function composeSystemStats({ cpuPercent, tempC, battery }) {
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const usedMemBytes = totalMemBytes - freeMemBytes;

  const ramTotalGb = Number((totalMemBytes / (1024 ** 3)).toFixed(1));
  const ramUsedGb = Number((usedMemBytes / (1024 ** 3)).toFixed(1));
  const ramPercent = Math.round((usedMemBytes / totalMemBytes) * 100);

  const ramTotalMb = Math.round(totalMemBytes / (1024 * 1024));
  const ramUsedMb = Math.round(usedMemBytes / (1024 * 1024));

  const now = Date.now();
  if (now - lastHistoryRecordTime >= TELEMETRY_INTERVAL_MS) {
    lastHistoryRecordTime = now;
    telemetryHistory.push({
      time: now,
      cpuPercent,
      tempC,
      ramUsedMb,
      ramTotalMb,
    });
    if (telemetryHistory.length > MAX_TELEMETRY_HISTORY) {
      telemetryHistory.shift();
    }
  }

  let disk = null;
  try {
    const rootPath = process.platform === "win32" ? "C:\\" : "/";
    const stat = fs.statfsSync(rootPath);
    const totalGb = Number(((stat.bsize * stat.blocks) / (1024 ** 3)).toFixed(1));
    const freeGb = Number(((stat.bsize * stat.bfree) / (1024 ** 3)).toFixed(1));
    const usedGb = Number((totalGb - freeGb).toFixed(1));
    const percent = Math.round((usedGb / totalGb) * 100);
    disk = { totalGb, usedGb, freeGb, percent };
  } catch {}

  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ? cpus[0].model.replace(/\s+/g, " ").trim() : "CPU";

  return {
    cpu: {
      usagePercent: cpuPercent,
      tempC: tempC,
      cores: cpus.length,
      model: cpuModel,
    },
    ram: {
      totalGb: ramTotalGb,
      usedGb: ramUsedGb,
      percent: ramPercent,
    },
    disk,
    battery,
    uptime: formatUptime(os.uptime()),
    timestamp: Date.now(),
  };
}

/** Recoleccion SINCRONA (compatibilidad: /stats, pruebas). Puede tardar segundos. */
export function collectSystemStats() {
  return composeSystemStats({
    cpuPercent: calculateCpuPercent(),
    tempC: queryTemperature(),
    battery: queryBattery(),
  });
}

/** Recoleccion asincrona: las sondas caras (PowerShell/pmset) no bloquean. */
async function collectSystemStatsAsync() {
  const cpuPercent = calculateCpuPercent();
  const [tempC, battery] = await Promise.all([queryTemperatureAsync(), queryBatteryAsync()]);
  return composeSystemStats({ cpuPercent, tempC, battery });
}

/** Edad maxima de la instantanea de /status antes de refrescar en segundo plano. */
export const SYSTEM_STATS_SNAPSHOT_TTL_MS = 2000;
let cachedStats = null;
let lastRefreshFinishedAt = 0;
let refreshing = false;

async function refreshSystemStats() {
  if (refreshing) return;
  refreshing = true;
  try {
    cachedStats = await collectSystemStatsAsync();
  } catch {
    // Una sonda fallida conserva el ultimo valor: /status no se cae por telemetria.
  } finally {
    refreshing = false;
    lastRefreshFinishedAt = Date.now(); // edad desde el fin: sin encadenar PowerShell sin descanso
  }
}

/**
 * Instantanea NO bloqueante de /status (5.3.4): devuelve el ultimo valor cacheado
 * (null si aun no hay ninguno) y refresca en segundo plano cuando toca. Antes
 * /status lanzaba PowerShell sincrono (hasta 2 s) dentro de la propia peticion.
 */
export function systemStatsSnapshot() {
  const now = Date.now();
  if (!refreshing && (cachedStats === null || now - lastRefreshFinishedAt >= SYSTEM_STATS_SNAPSHOT_TTL_MS)) {
    void refreshSystemStats();
  }
  return cachedStats;
}

