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
import { execSync } from "node:child_process";

let lastCpus = os.cpus();
let lastCpuTime = Date.now();
let lastCpuPercent = 0;

let lastTempC = null;
let lastTempSampleTime = 0;

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
  const now = Date.now();
  if (now - lastTempSampleTime < 5000 && lastTempC !== null) {
    return lastTempC;
  }
  lastTempSampleTime = now;

  if (process.platform === "win32") {
    try {
      const output = execSync(
        "powershell.exe -NoProfile -Command \"(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1).Temperature\"",
        { encoding: "utf8", timeout: 1200, stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      const kelvin = Number.parseInt(output, 10);
      if (Number.isFinite(kelvin) && kelvin > 200 && kelvin < 400) {
        lastTempC = Math.round(kelvin - 273.15);
        return lastTempC;
      }
    } catch {}
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

export function collectSystemStats() {
  const cpuPercent = calculateCpuPercent();
  const tempC = queryTemperature();

  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();
  const usedMemBytes = totalMemBytes - freeMemBytes;

  const ramTotalGb = Number((totalMemBytes / (1024 ** 3)).toFixed(1));
  const ramUsedGb = Number((usedMemBytes / (1024 ** 3)).toFixed(1));
  const ramPercent = Math.round((usedMemBytes / totalMemBytes) * 100);

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
    uptime: formatUptime(os.uptime()),
    timestamp: Date.now(),
  };
}
