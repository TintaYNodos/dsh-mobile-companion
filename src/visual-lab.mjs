/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CAPTURES_DIR = path.join(ROOT_DIR, "simulator", "captures");

if (!fs.existsSync(CAPTURES_DIR)) {
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });
}

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const USER_AGENT_MOBILE = "Mozilla/5.0 (Linux; Android 15; SM-G996U1 Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36";
const USER_AGENT_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function runCapture({ name, url, width, height, userAgent, delayMs = 2500 }) {
  const outputPath = path.join(CAPTURES_DIR, name);
  const tempProfile = path.join(process.env.TEMP || "C:\\Temp", `chrome_vis_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--window-size=${width},${height}`,
    `--user-agent=${userAgent}`,
    "--hide-scrollbars",
    `--user-data-dir=${tempProfile}`,
    `--virtual-time-budget=${delayMs}`,
    `--screenshot=${outputPath}`,
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(CHROME_PATH, args, { stdio: "ignore" });
    proc.on("close", (code) => {
      try {
        fs.rmSync(tempProfile, { recursive: true, force: true });
      } catch {}

      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        resolve({ name, path: outputPath, bytes: stats.size, width, height });
      } else {
        reject(new Error(`Fallo captura ${name} (exit code ${code})`));
      }
    });
    proc.on("error", reject);
  });
}

function visualBaseUrl() {
  return (process.env.DSH_VISUAL_URL || "http://127.0.0.1:57420").replace(/\/+$/, "");
}

export async function runAllVisualAudits() {
  console.log("Iniciando Laboratorio Visual Autonomo (DSH Mobile Companion)...");

  let pairUrl = "http://127.0.0.1:57421/pair";
  try {
    // El panel ya no se abre con una URL con token permanente: se usa el boleto
    // de arranque de un solo uso (companion-panel-token).
    const ticketFile = path.join(process.env.USERPROFILE || "", ".dsh", "companion-panel-token");
    if (fs.existsSync(ticketFile)) {
      const ticket = fs.readFileSync(ticketFile, "utf8").trim();
      if (ticket) pairUrl = "http://127.0.0.1:57421/pair?t=" + ticket;
    }
  } catch {}

  const tasks = [
    {
      name: "00_simulator_desktop.png",
      url: "http://127.0.0.1:57420/simulator",
      width: 1280,
      height: 850,
      userAgent: USER_AGENT_DESKTOP,
    },
    {
      name: "01_simulator_landscape.png",
      url: "http://127.0.0.1:57420/simulator?orient=landscape",
      width: 1280,
      height: 850,
      userAgent: USER_AGENT_DESKTOP,
    },
    {
      name: "02_simulator_keyboard.png",
      url: "http://127.0.0.1:57420/simulator?ime=on",
      width: 1280,
      height: 850,
      userAgent: USER_AGENT_DESKTOP,
    },
    {
      name: "03_simulator_notification.png",
      url: "http://127.0.0.1:57420/simulator?notif=on",
      width: 1280,
      height: 850,
      userAgent: USER_AGENT_DESKTOP,
    },
    {
      name: "04_mobile_portrait.png",
      url: visualBaseUrl() + "/?dshc=on",
      width: 412,
      height: 915,
      userAgent: USER_AGENT_MOBILE,
    },
    {
      name: "05_mobile_landscape.png",
      url: visualBaseUrl() + "/?dshc=on",
      width: 915,
      height: 412,
      userAgent: USER_AGENT_MOBILE,
    },
    {
      name: "06_pair_panel.png",
      url: pairUrl,
      width: 412,
      height: 915,
      userAgent: USER_AGENT_MOBILE,
    },
  ];

  const results = [];
  for (const t of tasks) {
    try {
      console.log(`Capturando ${t.name} (${t.width}x${t.height})...`);
      const r = await runCapture(t);
      console.log(`  -> OK: ${r.bytes} bytes guardados en ${r.name}`);
      results.push(r);
    } catch (err) {
      console.error(`  -> ERROR en ${t.name}: ${err.message}`);
    }
  }

  console.log(`Capturas completadas: ${results.length}/${tasks.length}`);
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllVisualAudits().catch(console.error);
}
