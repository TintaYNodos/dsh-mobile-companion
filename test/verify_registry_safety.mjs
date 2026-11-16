/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * P2: la prueba escribe en el registro REAL de dispositivos del usuario porque
 * el puente ya esta arrancado y lee ese mismo archivo; no se puede mover a un
 * DSH_HOME temporal sin reiniciar el puente. Por eso el aislamiento es
 * crash-safe:
 *   - antes de tocar nada se guarda un respaldo `.test-bak` (fsync) y un
 *     periodico `.test-in-progress`;
 *   - si un intento anterior murio a lo bruto, al arrancar se restaura solo
 *     desde el respaldo (nunca se confia en el registro a medias);
 *   - al terminar (normal, error o senal) se restaura el original y se verifica
 *     byte a byte; se conserva el respaldo para el siguiente intento.
 * En CI el HOME/DSH_HOME ya son temporales, asi que solo se ejercita el camino
 * normal. Lo que se prueba sigue siendo lo mismo: que un registro ilegible no
 * se sobrescribe y que el dispositivo sobrevive al ciclo.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { HOST, PORT } from "./_harness.mjs";

const dshHome = String(process.env.DSH_HOME || "").trim() || path.join(os.homedir(), ".dsh");
const registryPath = path.join(dshHome, "companion-devices.json");
const corruptPath = `${registryPath}.corrupt`;
const backupPath = `${registryPath}.test-bak`;
const journalPath = `${registryPath}.test-in-progress`;
const bridge = { host: HOST, port: PORT };

const call = (pathname, headers = {}) =>
  new Promise((resolve) => {
    const req = http.request({ hostname: bridge.host, port: bridge.port, path: pathname, agent: false, headers, timeout: 8000 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => { req.destroy(); resolve(0); });
    req.end();
  });

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

const valid = {
  devices: [
    {
      id: "dispositivo-importante",
      name: "Teléfono",
      address: "10.9.9.9",
      agent: "Pixel",
      approvedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastRefresh: new Date().toISOString(),
      claimed: true,
    },
  ],
  pending: [],
  history: [],
  denied: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (file) => {
  try {
    fs.accessSync(file);
    return true;
  } catch {
    return false;
  }
};
const remove = (file) => {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Un archivo que ya no esta no es un problema para la restauracion.
  }
};

/**
 * El puente escribe el registro de forma atomica pero concurrente: en Windows
 * un write directo puede chocar con EBUSY. Se reintenta con una espera corta.
 */
async function writeDurable(file, data) {
  for (let intento = 1; intento <= 20; intento++) {
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      const handle = fs.openSync(temporary, "w", 0o600);
      try {
        fs.writeFileSync(handle, data);
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      fs.renameSync(temporary, file);
      return;
    } catch (error) {
      remove(temporary);
      if (error.code !== "EBUSY" && error.code !== "EPERM") throw error;
      await sleep(50);
    }
  }
  throw new Error(`no se pudo escribir ${file}: seguia ocupado`);
}

/** Foto del archivo: `present: false` tambien es un estado valido a restaurar. */
const snapshot = (file) => {
  try {
    return { present: true, data: fs.readFileSync(file) };
  } catch (error) {
    if (error.code === "ENOENT") return { present: false, data: null };
    throw error;
  }
};

const writeBackup = (registry, corrupt) =>
  writeDurable(
    backupPath,
    JSON.stringify({
      registry: registryPath,
      present: registry.present,
      data: registry.data ? registry.data.toString("base64") : null,
      corruptPresent: corrupt.present,
      corruptData: corrupt.data ? corrupt.data.toString("base64") : null,
      savedAt: new Date().toISOString(),
    })
  );

const readBackup = () => {
  try {
    return JSON.parse(fs.readFileSync(backupPath, "utf8"));
  } catch {
    return null;
  }
};

const restoreFile = (file, saved) => {
  if (saved.present) {
    try {
      fs.writeFileSync(file, Buffer.from(saved.data || "", "base64"));
      return true;
    } catch {
      return false;
    }
  }
  remove(file);
  return true;
};

/** Restauracion de emergencia: sincrona, para senales y salida anormal. */
const emergencyRestore = () => {
  const saved = readBackup();
  if (!saved) return false;
  try {
    if (saved.present) fs.writeFileSync(registryPath, Buffer.from(saved.data || "", "base64"));
    else remove(registryPath);
    restoreFile(corruptPath, { present: Boolean(saved.corruptPresent), data: saved.corruptData });
    remove(journalPath);
    return true;
  } catch {
    // El periodico se queda: el proximo intento restaura desde el respaldo.
    return false;
  }
};

/** Si un intento anterior dejo el periodico, se restaura antes de empezar. */
const recoverPreviousRun = async () => {
  if (!exists(journalPath)) return false;
  const saved = readBackup();
  if (!saved) {
    remove(journalPath);
    return false;
  }
  if (saved.present) await writeDurable(registryPath, Buffer.from(saved.data || "", "base64"));
  else remove(registryPath);
  if (saved.corruptPresent) await writeDurable(corruptPath, Buffer.from(saved.corruptData || "", "base64"));
  else remove(corruptPath);
  remove(journalPath);
  return true;
};

// --- Aislamiento -----------------------------------------------------------
fs.mkdirSync(dshHome, { recursive: true });
const isolated = dshHome.toLowerCase().startsWith(os.tmpdir().toLowerCase());
if (!isolated) {
  console.log("INFO  registro real detectado: respaldo .test-bak y restauracion al terminar activos");
}
if (await recoverPreviousRun()) {
  console.log("INFO  intento anterior interrumpido: registro restaurado desde .test-bak");
}
const original = { registry: snapshot(registryPath), corrupt: snapshot(corruptPath) };
await writeBackup(original.registry, original.corrupt);
await writeDurable(journalPath, JSON.stringify({ pid: process.pid, registry: registryPath, startedAt: new Date().toISOString() }));

let restoreStarted = false;
let restoreDone = false;
const restore = async () => {
  if (restoreStarted) return restoreDone;
  restoreStarted = true;
  if (original.registry.present) await writeDurable(registryPath, original.registry.data);
  else remove(registryPath);
  if (original.corrupt.present) await writeDurable(corruptPath, original.corrupt.data);
  else remove(corruptPath);
  remove(journalPath);
  restoreDone = true;
  return true;
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    emergencyRestore();
    process.exit(130);
  });
}
process.on("exit", () => {
  if (!restoreDone) emergencyRestore();
});

// --- Comprobaciones --------------------------------------------------------
try {
  // 1. Registro sano: el puente lo lee.
  await writeDurable(registryPath, JSON.stringify(valid, null, 2));
  await call("/dsh-companion/status", { "user-agent": "prueba" });

  // 2. Se corrompe el archivo y llega una petición del teléfono.
  await writeDurable(registryPath, '{"devices":[{"id":"dispo');
  await call("/dsh-companion/status", { "user-agent": "prueba" });
  await call("/", { accept: "text/html", "sec-fetch-dest": "document", "user-agent": "prueba" });

  const afterCorrupt = fs.readFileSync(registryPath, "utf8");
  check("un registro ilegible no se sobrescribe", afterCorrupt.startsWith('{"devices":[{"id":"dispo'), afterCorrupt.slice(0, 40));

  // 3. Al reparar el archivo, el dispositivo sigue ahí y vuelve a leerse.
  await writeDurable(registryPath, JSON.stringify(valid, null, 2));
  await call("/dsh-companion/status", { "user-agent": "prueba" });

  const repaired = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  check("el dispositivo sobrevive al ciclo", repaired.devices.some((d) => d.id === "dispositivo-importante"), `${repaired.devices.length} dispositivo(s)`);

  // 4. Archivo ausente: debe poder crear uno nuevo (el original se restaura al final).
  remove(registryPath);
  const status = await call("/dsh-companion/status", { "user-agent": "prueba" });
  check("sin archivo el puente sigue respondiendo", status === 200, `status=${status}`);
} finally {
  await restore();
}

const restoredOk = original.registry.present
  ? exists(registryPath) && fs.readFileSync(registryPath).equals(original.registry.data)
  : !exists(registryPath);
check("el registro original se restaura byte a byte", restoredOk);
if (!restoredOk) console.log(`INFO  respaldo conservado en ${path.basename(backupPath)} para recuperacion manual`);

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
