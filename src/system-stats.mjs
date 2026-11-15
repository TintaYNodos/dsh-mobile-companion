/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1) / PolyForm Noncommercial 1.0.0.
 * See companion/LICENSE or LICENSE for license terms.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

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

function queryTemperature() {
  if (hasThermalZone === false) return null;

  const now = Date.now();
  if (now - lastTempSampleTime < 5000 && lastTempC !== null) {
    return lastTempC;
  }
  lastTempSampleTime = now;

  if (process.platform === "win32") {
    try {
      const output = execSync(
        "powershell.exe -NoProfile -Command \"(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1).Temperature\"",
        { encoding: "utf8", timeout: 800, stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      const kelvin = Number.parseInt(output, 10);
      if (Number.isFinite(kelvin) && kelvin > 200 && kelvin < 400) {
        hasThermalZone = true;
        lastTempC = Math.round(kelvin - 273.15);
        return lastTempC;
      }
      if (hasThermalZone === null) {
        hasThermalZone = false;
      }
    } catch {
      if (hasThermalZone === null) {
        hasThermalZone = false;
      }
    }
  } else {
    hasThermalZone = false;
  }
  return lastTempC;
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

export function queryBattery() {
  if (hasBattery === false) return null;

  const now = Date.now();
  if (hasBattery === true && now - lastBatterySampleTime < BATTERY_CACHE_MS && lastBattery !== null) {
    return lastBattery;
  }

  let result = null;

  if (process.platform === "win32") {
    try {
      const res = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1 -Property EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", timeout: 2500, stdio: ["ignore", "pipe", "ignore"] }
      );
      const out = res.stdout ? res.stdout.trim() : "";
      if (out) {
        const parsed = JSON.parse(out);
        const percent = Number(parsed.EstimatedChargeRemaining);
        const statusNum = Number(parsed.BatteryStatus);
        if (Number.isFinite(percent)) {
          const charging = statusNum >= 6 && statusNum <= 9;
          const plugged = charging || statusNum === 2 || statusNum === 3;
          let status = "discharging";
          if (charging) status = "charging";
          else if (statusNum === 3) status = "full";
          else if (plugged) status = "plugged";
          else if (statusNum === 1 || statusNum === 4 || statusNum === 5) status = "discharging";
          else status = "unknown";

          result = { percent, plugged, charging, status };
        }
      }
    } catch {
      if (hasBattery === true) return lastBattery;
    }
  } else if (process.platform === "linux") {
    try {
      const base = "/sys/class/power_supply";
      if (fs.existsSync(base)) {
        const entries = fs.readdirSync(base).filter((e) => e.startsWith("BAT"));
        if (entries.length > 0) {
          const batPath = path.join(base, entries[0]);
          const capFile = path.join(batPath, "capacity");
          const statFile = path.join(batPath, "status");
          if (fs.existsSync(capFile)) {
            const percent = parseInt(fs.readFileSync(capFile, "utf8").trim(), 10);
            const rawStatus = fs.existsSync(statFile)
              ? fs.readFileSync(statFile, "utf8").trim().toLowerCase()
              : "unknown";
            const charging = rawStatus === "charging";
            const plugged = charging || rawStatus === "full" || rawStatus === "not charging";
            result = {
              percent: Number.isFinite(percent) ? percent : 0,
              plugged,
              charging,
              status: rawStatus,
            };
          }
        }
      }
    } catch {
      if (hasBattery === true) return lastBattery;
    }
  } else if (process.platform === "darwin") {
    try {
      const out = execSync("pmset -g batt", {
        encoding: "utf8",
        timeout: 1500,
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (out.includes("InternalBattery") || out.includes("Battery")) {
        const match = out.match(/(\d+)%\s*;\s*([^;]+);/);
        if (match) {
          const percent = parseInt(match[1], 10);
          const raw = match[2].trim().toLowerCase();
          const charging = raw.includes("charging");
          const plugged = charging || raw.includes("charged") || out.includes("'AC Power'");
          const status = charging ? "charging" : raw.includes("charged") ? "full" : "discharging";
          result = { percent, plugged, charging, status };
        }
      }
    } catch {
      if (hasBattery === true) return lastBattery;
    }
  }

  if (result === null) {
    if (hasBattery === null) {
      hasBattery = false;
    }
    return null;
  }

  hasBattery = true;
  lastBattery = result;
  lastBatterySampleTime = now;
  return lastBattery;
}

// Inicialización temprana para detectar presencia de batería al arrancar
try {
  queryBattery();
} catch {}

export function collectSystemStats() {
  const cpuPercent = calculateCpuPercent();
  const tempC = queryTemperature();

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
    battery: queryBattery(),
    uptime: formatUptime(os.uptime()),
    timestamp: Date.now(),
  };
}
