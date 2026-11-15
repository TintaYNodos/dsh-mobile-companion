#!/usr/bin/env node
/*
 * Verifica el mapa de soluciones de DSH Mobile Companion y lo usa para mapear un
 * informe real de doctor.ps1.
 *
 *   node scripts/verify-fixes.mjs static
 *   node scripts/verify-fixes.mjs report <doctor-report.json | ->
 *   node scripts/verify-fixes.mjs --root <ruta-del-repo> static
 *
 * Modos:
 *   static  Comprueba que cada llamada Bad/Warn/F de doctor.ps1 tiene una entrada
 *           en doctor-fixes.json, que el match aparece literal en el script y que
 *           la estructura del mapa es válida.
 *   report  Lee el JSON de `doctor.ps1 -Json` y mapea cada FAIL/AVISO a un fix.
 *           Falla con SIN MAPA si algún mensaje no tiene solución verificada.
 *
 * Sin dependencias: solo Node (>=22).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    const hasDoctor = fs.existsSync(path.join(dir, "doctor.ps1"));
    const hasFixes = fs.existsSync(path.join(dir, "doctor-fixes.json"));
    if (hasDoctor && hasFixes) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parseArgs(argv) {
  const args = { mode: "static", reportPath: null, root: null };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { mode: "help", reportPath: null, root: null };
    if (arg === "--root") {
      const value = argv[++i];
      if (!value) throw new Error("--root necesita una ruta");
      args.root = value;
      continue;
    }
    positionals.push(arg);
  }
  if (positionals.length > 0) args.mode = positionals[0];
  if (args.mode === "report") {
    args.reportPath = positionals[1] ?? "-";
  } else if (positionals.length > 1) {
    throw new Error(`argumentos de más: ${positionals.slice(1).join(" ")}`);
  }
  if (!["static", "report", "help"].includes(args.mode)) {
    throw new Error(`modo desconocido "${args.mode}" (usa static o report)`);
  }
  return args;
}

function readJson(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function extractDoctorCalls(source) {
  const calls = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("#")) continue;
    const re = /\b(Bad|Warn|F)\s*\(?\s*"((?:[^"\\]|\\.)*)"/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      calls.push({
        level: match[1] === "Warn" ? "WARN" : "FAIL",
        callee: match[1],
        message: match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
        line: i + 1,
      });
    }
  }
  return calls;
}

const REQUIRED_KEYS = ["id", "match", "matchRuntime", "title", "command", "docs", "blocking"];

function validateFix(id, fix, problems) {
  if (typeof fix !== "object" || fix === null || Array.isArray(fix)) {
    problems.push(`fix "${id}": no es un objeto`);
    return;
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in fix)) problems.push(`fix "${id}": falta "${key}"`);
  }
  if (fix.id !== id) problems.push(`fix "${id}": id interno "${fix.id}" no coincide con la clave`);
  for (const key of ["match", "title", "docs"]) {
    if (typeof fix[key] !== "string" || fix[key].length === 0) problems.push(`fix "${id}": "${key}" debe ser texto no vacío`);
  }
  if (!(fix.command === null || typeof fix.command === "string")) problems.push(`fix "${id}": command debe ser texto o null`);
  if (typeof fix.blocking !== "boolean") problems.push(`fix "${id}": blocking debe ser booleano`);
  const runtime = Array.isArray(fix.matchRuntime) ? fix.matchRuntime : [fix.matchRuntime];
  if (!Array.isArray(fix.matchRuntime) && typeof fix.matchRuntime !== "string") {
    problems.push(`fix "${id}": matchRuntime debe ser texto o lista de textos`);
  }
  if (runtime.length === 0 || runtime.some((part) => typeof part !== "string" || part.length === 0)) {
    problems.push(`fix "${id}": matchRuntime necesita fragmentos no vacíos`);
  }
}

function runStatic({ root }) {
  const problems = [];
  const doctorPath = path.join(root, "doctor.ps1");
  const fixesPath = path.join(root, "doctor-fixes.json");
  const doctorSource = fs.readFileSync(doctorPath, "utf8").replace(/^\uFEFF/, "");
  const map = readJson(fixesPath);

  if (map.version !== 1) problems.push(`version del mapa: se esperaba 1, hay ${JSON.stringify(map.version)}`);
  if (!map.fixes || typeof map.fixes !== "object" || Array.isArray(map.fixes)) {
    problems.push("el mapa no tiene un objeto fixes");
  }
  const fixes = map.fixes ?? {};
  const ids = Object.keys(fixes);
  if (ids.length === 0) problems.push("el mapa no tiene ningún fix");

  const seenMatches = new Set();
  for (const [id, fix] of Object.entries(fixes)) {
    validateFix(id, fix, problems);
    if (typeof fix?.match !== "string") continue;
    if (!doctorSource.includes(fix.match)) {
      problems.push(`fix "${id}": match no aparece literalmente en doctor.ps1`);
    }
    if (seenMatches.has(fix.match)) {
      problems.push(`match duplicado entre fixes: ${JSON.stringify(fix.match)}`);
    }
    seenMatches.add(fix.match);
  }

  const calls = extractDoctorCalls(doctorSource);
  const fails = calls.filter((call) => call.level === "FAIL");
  const warns = calls.filter((call) => call.level === "WARN");
  const matchedMatches = new Set();
  for (const call of calls) {
    const entry = Object.entries(fixes).find(([, fix]) => fix?.match === call.message);
    if (!entry) {
      problems.push(`doctor.ps1:${call.line}: ${call.callee} sin entrada en el mapa: ${JSON.stringify(call.message)}`);
      continue;
    }
    matchedMatches.add(call.message);
    const [id, fix] = entry;
    const expectedBlocking = call.level === "FAIL";
    if (fix.blocking !== expectedBlocking) {
      problems.push(`fix "${id}": blocking=${fix.blocking} pero el mensaje es ${call.level}`);
    }
  }
  for (const [id, fix] of Object.entries(fixes)) {
    if (typeof fix?.match === "string" && !matchedMatches.has(fix.match)) {
      problems.push(`fix "${id}": su match no corresponde a ninguna llamada Bad/Warn/F de doctor.ps1`);
    }
  }

  console.log(`doctor.ps1: ${fails.length} FAIL + ${warns.length} AVISO (${calls.length} mensajes)`);
  console.log(`doctor-fixes.json: ${ids.length} fixes`);
  if (problems.length > 0) {
    console.log(`\nHALLAZGOS (${problems.length}):`);
    for (const problem of problems) console.log(`  · ${problem}`);
    return 1;
  }
  console.log("\nstatic check OK: todos los mensajes de doctor.ps1 tienen fix y el match es literal.");
  return 0;
}

function normalizeRuntime(fix) {
  return Array.isArray(fix.matchRuntime) ? fix.matchRuntime : [fix.matchRuntime];
}

function matchFix(fix, message) {
  const parts = normalizeRuntime(fix).filter((part) => typeof part === "string" && part.length > 0);
  if (parts.length === 0) return null;
  if (!parts.every((part) => message.includes(part))) return null;
  return parts.reduce((total, part) => total + part.length, 0);
}

function mapMessage(fixes, message) {
  let best = null;
  let tie = false;
  for (const [id, fix] of Object.entries(fixes)) {
    const score = matchFix(fix, message);
    if (score === null) continue;
    if (best === null || score > best.score) {
      best = { id, fix, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }
  if (best === null) return { state: "unmapped" };
  if (tie) return { state: "ambiguous", best };
  return { state: "mapped", best };
}

function runReport({ root, reportPath }) {
  const map = readJson(path.join(root, "doctor-fixes.json"));
  const fixes = map.fixes ?? {};
  const report = reportPath === "-" ? readJsonFromStdin() : readJson(path.resolve(reportPath));
  const problems = [];

  if (report.tool !== undefined && report.tool !== "dsh-companion-doctor") {
    problems.push(`el informe no es de doctor.ps1: tool=${JSON.stringify(report.tool)}`);
  }
  const blockers = Array.isArray(report.blockers) ? report.blockers : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  if (!Array.isArray(report.blockers)) problems.push("el informe no trae blockers[]");
  if (!Array.isArray(report.warnings)) problems.push("el informe no trae warnings[]");

  const rows = [
    ...blockers.map((message) => ({ level: "FAIL", message })),
    ...warnings.map((message) => ({ level: "WARN", message })),
  ];
  let mapped = 0;
  let unmapped = 0;
  for (const row of rows) {
    if (typeof row.message !== "string") {
      problems.push(`mensaje ${row.level} no textual: ${JSON.stringify(row.message)}`);
      unmapped++;
      continue;
    }
    const result = mapMessage(fixes, row.message);
    if (result.state === "mapped") {
      mapped++;
      const { id, fix } = result.best;
      console.log(`[${row.level}] ${row.message}`);
      console.log(`        -> ${id}: ${fix.title}`);
      if (fix.command) console.log(`        -> ${fix.command}`);
      if (fix.docs) console.log(`        -> docs: ${fix.docs}`);
    } else if (result.state === "ambiguous") {
      unmapped++;
      problems.push(`mensaje ${row.level} ambiguo (varios fixes): ${JSON.stringify(row.message)}`);
      console.log(`[${row.level}] ${row.message}`);
      console.log("        -> AMBIGUO: varios fixes encajan; ajusta matchRuntime");
    } else {
      unmapped++;
      problems.push(`mensaje ${row.level} sin mapa: ${JSON.stringify(row.message)}`);
      console.log(`[${row.level}] ${row.message}`);
      console.log("        -> SIN MAPA: detente y reporta el mensaje exacto");
    }
  }

  const failCount = blockers.length;
  const ok = report.ok === true;
  if (ok && (!report.phoneUrl || !report.tunnel)) {
    problems.push("ok=true pero phoneUrl/tunnel vacíos: el informe no es coherente");
  }
  if (!ok && failCount === 0) {
    problems.push("ok=false sin blockers: el informe no es coherente");
  }
  if (ok && failCount > 0) problems.push("ok=true con blockers: el informe no es coherente");
  if (report.bridgePort !== undefined && String(report.bridgePort) !== "57420") {
    console.log(`nota: bridgePort=${report.bridgePort} (distinto del predeterminado 57420)`);
  }

  console.log(`\nresumen: ${mapped} mapeados, ${unmapped} sin mapa (${failCount} FAIL, ${warnings.length} AVISO)`);
  if (report.generatedAt) console.log(`informe generado: ${report.generatedAt}`);
  if (ok) console.log(`ok=true, phoneUrl=${report.phoneUrl}, tunnel=${report.tunnel}`);
  if (problems.length > 0) {
    console.log(`\nHALLAZGOS (${problems.length}):`);
    for (const problem of problems) console.log(`  · ${problem}`);
    return 1;
  }
  console.log("\nreport check OK: todos los mensajes del informe tienen fix verificado.");
  return 0;
}

function readJsonFromStdin() {
  const raw = fs.readFileSync(0, "utf8").replace(/^\uFEFF/, "");
  if (raw.trim().length === 0) throw new Error("no hay JSON en la entrada estándar");
  return JSON.parse(raw);
}

const HELP = `Verifica y usa el mapa de soluciones de DSH Mobile Companion.

Uso:
  node scripts/verify-fixes.mjs static                 audita doctor-fixes.json contra doctor.ps1
  node scripts/verify-fixes.mjs report <informe.json>  mapea un informe real de doctor.ps1
  node scripts/verify-fixes.mjs report -               lee el informe por la entrada estándar
  node scripts/verify-fixes.mjs --root <repo> <modo>   fija la raíz del repo

Códigos de salida: 0 correcto, 1 hallazgos, 2 error de uso o de lectura.
`;

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
  if (args.mode === "help") {
    console.log(HELP);
    return 0;
  }
  const root = args.root ? path.resolve(args.root) : findRepoRoot(scriptDir);
  if (!root) {
    console.error("ERROR: no encuentro la raíz del repo (doctor.ps1 + doctor-fixes.json). Usa --root.");
    return 2;
  }
  try {
    return args.mode === "report" ? runReport({ root, reportPath: args.reportPath }) : runStatic({ root });
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
}

process.exitCode = main();
