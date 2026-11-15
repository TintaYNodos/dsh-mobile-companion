/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Rotacion en caliente de bridge.log (5.1.5).
 *
 *   node test/verify_log_rotation.mjs
 *
 * No necesita el puente real ni el puerto 57420: usa un bridge.log aislado en un
 * directorio temporal. En Windows arranca el hijo con `cmd.exe /c node fixture.mjs
 * >> bridge.log 2>&1`, que es la redireccion de run-hidden.vbs (cmd mantiene el
 * archivo abierto: el caso dificil). En POSIX le pasa un descriptor append.
 *
 * Comprueba: valores por defecto/minimos/maximos y avisos de DSH_LOG_MAX_MB y
 * DSH_LOG_KEEP; rotacion al arrancar (copy-truncate con el descriptor heredado) y
 * desplazamiento .1->.2->.3; rotacion EN CALIENTE sin reiniciar, con el archivo
 * actual por debajo del limite y cada linea exactamente una vez; el limite de
 * retencion DSH_LOG_KEEP; el camino sin redireccion (rename atomico); y que un
 * valor invalido solo avise y no rompa el arranque.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readLogLimits } from "../src/log.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const logModuleUrl = pathToFileURL(path.join(path.resolve(here, ".."), "src", "log.mjs")).href;
const NODE = process.execPath;
const MB = 1024 * 1024;
const MAX_MB = 1;
const KEEP = 10;
const MARKER_BEFORE = "MARCADOR-PREVIO";
const MARKER_START = "MARCADOR-INICIAL";
const OLD_ARCHIVE = "ARCHIVO-VIEJO-1";

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};
const countOccurrences = (text, needle) => {
  let total = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) return total;
    total += 1;
    from = at + needle.length;
  }
};

/** Proceso hijo aislado que usa src/log.mjs igual que bridge.mjs. */
const FIXTURE = `
import fs from "node:fs";
import path from "node:path";

const dir = process.env.DSH_LOG_PROBE_DIR;
const logFile = path.join(dir, "bridge.log");
const { rotateBridgeLog, log } = await import(process.env.DSH_LOG_PROBE_MODULE);

const rotation = rotateBridgeLog(logFile);
log("probe", "MARCADOR-PREVIO");

const lines = Number(process.env.DSH_LOG_PROBE_LINES || "0");
const pad = "x".repeat(Number(process.env.DSH_LOG_PROBE_PAD || "0"));
for (let index = 0; index < lines; index += 1) log("probe", \`LINEA-\${index} \${pad}\`);

fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify({ rotation }));
`;

/** Arranca el fixture con bridge.log redirigido (cmd.exe en Windows). */
function runFixture(dir, { env = {}, lines = 0, pad = 0, redirect = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const fixture = path.join(dir, "fixture.mjs");
  const logFile = path.join(dir, "bridge.log");
  fs.writeFileSync(fixture, FIXTURE);
  const childEnv = {
    ...process.env,
    DSH_LOG_PROBE_DIR: dir,
    DSH_LOG_PROBE_MODULE: logModuleUrl,
    DSH_LOG_PROBE_LINES: String(lines),
    DSH_LOG_PROBE_PAD: String(pad),
    ...env,
  };
  if (!redirect) {
    return spawnSync(NODE, [fixture], { cwd: dir, env: childEnv, stdio: "ignore", timeout: 60_000, windowsHide: true });
  }
  if (process.platform === "win32") {
    // La redireccion real de run-hidden.vbs: cmd.exe abre bridge.log y lo mantiene abierto.
    const commandFile = path.join(dir, "run.cmd");
    fs.writeFileSync(commandFile, `@echo off\r\n"${NODE}" "${fixture}" >> "${logFile}" 2>&1\r\n`);
    return spawnSync("cmd.exe", ["/c", commandFile], { cwd: dir, env: childEnv, stdio: "ignore", timeout: 60_000, windowsHide: true });
  }
  const fd = fs.openSync(logFile, "a");
  try {
    return spawnSync(NODE, [fixture], { cwd: dir, env: childEnv, stdio: ["ignore", fd, fd], timeout: 60_000 });
  } finally {
    fs.closeSync(fd);
  }
}

/** bridge.log actual primero y despues .1, .2, ... */
function readLogs(dir, keepCount) {
  const files = [];
  const current = path.join(dir, "bridge.log");
  if (fs.existsSync(current)) files.push({ name: "bridge.log", buffer: fs.readFileSync(current) });
  for (let index = 1; index <= keepCount; index += 1) {
    const file = path.join(dir, `bridge.log.${index}`);
    if (fs.existsSync(file)) files.push({ name: `bridge.log.${index}`, buffer: fs.readFileSync(file) });
  }
  return files;
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-log-rotation-"));
const readReport = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8"));
  } catch {
    return null;
  }
};
const asMap = (files) => new Map(files.map((entry) => [entry.name, entry.buffer.toString("utf8")]));
const lineIds = (text) => [...text.matchAll(/LINEA-(\d+) /g)].map((match) => Number(match[1]));

console.log(`Rotacion en caliente de bridge.log (${process.platform}, node ${process.version})\n`);

try {
  // 1. Validacion de variables (puro, sin procesos).
  const defaults = readLogLimits({});
  check("readLogLimits: por defecto 5 MB y 3 archivos",
    defaults.maxBytes === 5 * MB && defaults.keep === 3 && defaults.warnings.length === 0,
    JSON.stringify({ maxBytes: defaults.maxBytes, keep: defaults.keep }));
  const custom = readLogLimits({ DSH_LOG_MAX_MB: "2", DSH_LOG_KEEP: "5" });
  check("readLogLimits: valores validos se respetan",
    custom.maxBytes === 2 * MB && custom.keep === 5 && custom.warnings.length === 0);
  const belowMin = readLogLimits({ DSH_LOG_MAX_MB: "0.5" });
  check("readLogLimits: DSH_LOG_MAX_MB por debajo del minimo sube a 1 MB con aviso",
    belowMin.maxBytes === 1 * MB && belowMin.warnings.length === 1, belowMin.warnings[0]);
  const badMax = ["abc", "0", "-3"].every((value) => {
    const limits = readLogLimits({ DSH_LOG_MAX_MB: value });
    return limits.maxBytes === 5 * MB && limits.warnings.length === 1 && limits.warnings[0].includes("DSH_LOG_MAX_MB");
  });
  check("readLogLimits: DSH_LOG_MAX_MB invalido usa 5 MB y avisa", badMax);
  const badKeep = ["abc", "0", "-2", "2.5"].every((value) => {
    const limits = readLogLimits({ DSH_LOG_KEEP: value });
    return limits.keep === 3 && limits.warnings.length === 1 && limits.warnings[0].includes("DSH_LOG_KEEP");
  });
  check("readLogLimits: DSH_LOG_KEEP invalido usa 3 y avisa", badKeep);
  const keepTopped = readLogLimits({ DSH_LOG_KEEP: "99" });
  check("readLogLimits: DSH_LOG_KEEP por encima del maximo baja a 10 con aviso",
    keepTopped.keep === 10 && keepTopped.warnings.length === 1, keepTopped.warnings[0]);
  const empty = readLogLimits({ DSH_LOG_MAX_MB: "", DSH_LOG_KEEP: "  " });
  check("readLogLimits: variables vacias no avisan ni cambian el default",
    empty.maxBytes === 5 * MB && empty.keep === 3 && empty.warnings.length === 0);

  // 2. Rotacion al arrancar + EN CALIENTE con cmd.exe manteniendo el archivo abierto.
  const hotDir = path.join(tempRoot, "hot");
  fs.mkdirSync(hotDir, { recursive: true });
  const hotLog = path.join(hotDir, "bridge.log");
  fs.writeFileSync(hotLog, `${MARKER_START}\n${"x".repeat(Math.round(1.2 * MB))}\n`); // > limite: rota al arrancar
  fs.writeFileSync(path.join(hotDir, "bridge.log.1"), `${OLD_ARCHIVE}\n`); // debe desplazarse a .2
  const prefillSize = fs.statSync(hotLog).size;
  const hotRun = runFixture(hotDir, { env: { DSH_LOG_MAX_MB: String(MAX_MB), DSH_LOG_KEEP: String(KEEP) }, lines: 20, pad: 65536 });
  check("caliente: el proceso aislado termina bien", hotRun.status === 0,
    `status=${hotRun.status} signal=${hotRun.signal ?? "-"} error=${hotRun.error?.message ?? "-"}`);

  const hotReport = readReport(hotDir);
  check("arranque: rota con el descriptor heredado (copy-truncate) y deja la rotacion caliente instalada",
    hotReport?.rotation?.rotated === true && hotReport.rotation.mode === "copy-truncate" &&
      hotReport.rotation.hot === true && hotReport.rotation.hotMode === "positioned",
    `mode=${hotReport?.rotation?.mode} hot=${hotReport?.rotation?.hot}`);
  check("arranque: aplica DSH_LOG_MAX_MB/DSH_LOG_KEEP y archiva los bytes previos",
    hotReport?.rotation?.bytes === prefillSize && hotReport.rotation.maxBytes === MAX_MB * MB &&
      hotReport.rotation.keep === KEEP && hotReport.rotation.warnings.length === 0,
    `bytes=${hotReport?.rotation?.bytes}/${prefillSize} max=${hotReport?.rotation?.maxBytes} keep=${hotReport?.rotation?.keep}`);

  const files = readLogs(hotDir, KEEP);
  const names = files.map((entry) => entry.name);
  const text = asMap(files);
  const allText = [...text.values()].join("");
  check("caliente: aparecen bridge.log.1 y .2 sin reiniciar y el .1 viejo pasa a .3",
    names.includes("bridge.log.1") && names.includes("bridge.log.2") && countOccurrences(text.get("bridge.log.3") ?? "", OLD_ARCHIVE) === 1,
    names.join(", "));
  check("desplazamiento: el contenido inicial acaba en bridge.log.2", countOccurrences(text.get("bridge.log.2") ?? "", MARKER_START) === 1);
  check("no quedan temporales de rotacion", !fs.existsSync(`${hotLog}.1.tmp`));
  const currentSize = fs.existsSync(hotLog) ? fs.statSync(hotLog).size : -1;
  check("caliente: el archivo actual queda por debajo del limite", currentSize >= 0 && currentSize < MAX_MB * MB,
    `${currentSize} bytes < ${MAX_MB * MB}`);
  let holes = files.filter((entry) => entry.buffer.includes(0)).map((entry) => entry.name);
  check("caliente: ningun archivo tiene huecos de ceros (puntero compartido)", holes.length === 0, holes.join(", "));
  check("sin perdidas: el marcador previo a la rotacion sigue en un archivo (archivado en .1)",
    countOccurrences(allText, MARKER_BEFORE) === 1 && countOccurrences(text.get("bridge.log.1") ?? "", MARKER_BEFORE) === 1,
    `ocurrencias=${countOccurrences(allText, MARKER_BEFORE)}`);
  const ids = lineIds(allText);
  const expected = Array.from({ length: 20 }, (_, index) => index);
  check("sin perdidas ni duplicados: las 20 lineas aparecen exactamente una vez",
    ids.length === expected.length && expected.every((id) => ids.filter((value) => value === id).length === 1),
    `total=${ids.length} unicas=${new Set(ids).size}`);
  check("caliente: hay rotaciones en el aire (aviso en el log)", countOccurrences(allText, "bytes movidos a bridge.log.1") >= 2,
    `avisos=${countOccurrences(allText, "bytes movidos a bridge.log.1")}`);

  // 3. DSH_LOG_KEEP limita cuantos archivos rotados se conservan.
  const keepDir = path.join(tempRoot, "keep-cap");
  const keepRun = runFixture(keepDir, { env: { DSH_LOG_MAX_MB: String(MAX_MB), DSH_LOG_KEEP: "2" }, lines: 52, pad: 65536 });
  check("keep: el proceso aislado termina bien", keepRun.status === 0, `status=${keepRun.status}`);
  const keepFiles = readLogs(keepDir, 4);
  const keepNames = keepFiles.map((entry) => entry.name);
  const keepText = asMap(keepFiles);
  const keepAll = [...keepText.values()].join("");
  check("keep=2: conserva bridge.log.1 y .2 y descarta bridge.log.3",
    keepNames.includes("bridge.log.1") && keepNames.includes("bridge.log.2") && !keepNames.includes("bridge.log.3"),
    keepNames.join(", "));
  check("keep=2: reparte las lineas entre .2, .1 y el actual sin duplicarlas",
    countOccurrences(keepText.get("bridge.log.2") ?? "", "LINEA-16 ") === 1 &&
      countOccurrences(keepText.get("bridge.log.1") ?? "", "LINEA-32 ") === 1 &&
      countOccurrences(keepText.get("bridge.log") ?? "", "LINEA-51 ") === 1 &&
      new Set(lineIds(keepAll)).size === lineIds(keepAll).length);
  check("keep=2: sin huecos, el mas viejo se descarta por retencion y el actual sigue bajo el limite",
    keepFiles.every((entry) => !entry.buffer.includes(0)) &&
      countOccurrences(keepAll, MARKER_BEFORE) === 0 &&
      fs.statSync(path.join(keepDir, "bridge.log")).size < MAX_MB * MB);

  // 4. Sin redireccion (sin handle heredado) la rotacion es un rename atomico.
  const renameDir = path.join(tempRoot, "rename");
  fs.mkdirSync(renameDir, { recursive: true });
  fs.writeFileSync(path.join(renameDir, "bridge.log"), `${MARKER_START}\n${"x".repeat(Math.round(1.2 * MB))}\n`);
  fs.writeFileSync(path.join(renameDir, "bridge.log.1"), `${OLD_ARCHIVE}\n`);
  const renameRun = runFixture(renameDir, { redirect: false, env: { DSH_LOG_MAX_MB: String(MAX_MB), DSH_LOG_KEEP: "3" } });
  const renameReport = readReport(renameDir);
  check("renombrar: rota con rename atomico al arrancar sin redireccion",
    renameRun.status === 0 && renameReport?.rotation?.rotated === true && renameReport.rotation.mode === "rename",
    `status=${renameRun.status} mode=${renameReport?.rotation?.mode}`);
  check("renombrar: .1 recibe el contenido previo, .2 el archivo viejo y no queda bridge.log",
    fs.existsSync(path.join(renameDir, "bridge.log.1")) &&
      fs.readFileSync(path.join(renameDir, "bridge.log.1"), "utf8").includes(MARKER_START) &&
      fs.readFileSync(path.join(renameDir, "bridge.log.2"), "utf8").includes(OLD_ARCHIVE) &&
      !fs.existsSync(path.join(renameDir, "bridge.log")));

  // 5. Variables invalidas: aviso y default, el arranque no se rompe.
  const badDir = path.join(tempRoot, "invalid-env");
  const badRun = runFixture(badDir, { env: { DSH_LOG_MAX_MB: "abc", DSH_LOG_KEEP: "99" }, lines: 2 });
  const badReport = readReport(badDir);
  check("variables invalidas: el arranque no falla y usa los defaults 5 MB / 10",
    badRun.status === 0 && badReport?.rotation?.maxBytes === 5 * MB && badReport.rotation.keep === 10,
    `status=${badRun.status} max=${badReport?.rotation?.maxBytes} keep=${badReport?.rotation?.keep}`);
  const warned = Array.isArray(badReport?.rotation?.warnings) && badReport.rotation.warnings.length === 2 &&
    badReport.rotation.warnings.some((message) => message.includes("DSH_LOG_MAX_MB")) &&
    badReport.rotation.warnings.some((message) => message.includes("DSH_LOG_KEEP"));
  check("variables invalidas: avisa de las dos variables", warned, JSON.stringify(badReport?.rotation?.warnings));
  const badLog = path.join(badDir, "bridge.log");
  const badText = fs.existsSync(badLog) ? fs.readFileSync(badLog, "utf8") : "";
  check("variables invalidas: el aviso queda en bridge.log y se siguen escribiendo las lineas",
    badText.includes("aviso:") && badText.includes("DSH_LOG_MAX_MB") && badText.includes("DSH_LOG_KEEP") &&
      badText.includes(MARKER_BEFORE) && badText.includes("LINEA-0") && badText.includes("LINEA-1"));
} finally {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
}

const failed = results.filter((result) => !result.ok);
console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} pruebas correctas`);
if (failed.length) process.exitCode = 1;
