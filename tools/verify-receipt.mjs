#!/usr/bin/env node
/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/*
 * Verifica el recibo de un informe de `doctor.ps1`. Sin dependencias.
 *
 *   node tools/verify-receipt.mjs doctor-report.json
 *   node tools/verify-receipt.mjs -                          (informe por stdin)
 *   node tools/verify-receipt.mjs doctor-report.json --expect-apk-sha256 <hex>
 *   node tools/verify-receipt.mjs doctor-report.json --expect-cert <hex>
 *   node tools/verify-receipt.mjs --self-test
 *
 * QUE SE HASHEA (canon del recibo)
 * --------------------------------
 * `doctor.ps1 -Json -Report` escribe `doctor-report.json` con este campo al final:
 *
 *   "receipt": {
 *     "algorithm": "sha256",
 *     "canonical": "json-compact-sin-receipt",
 *     "sha256": "<64 hex minusculas>"
 *   }
 *
 * El hash es el SHA-256 (hex minusculas) de los bytes UTF-8 de:
 *
 *   JSON.stringify(JSON.parse(contenido_del_archivo) quitando la clave "receipt")
 *
 * es decir, del JSON compacto (sin espacios ni saltos de linea) del informe, con
 * sus claves en el orden en que aparecen en el archivo. NO se hashea el texto
 * del archivo: se hashea el valor JSON normalizado. Asi el verificador no tiene
 * que replicar el serializador de PowerShell (Windows PowerShell 5.1 y Node
 * escapan distinto `<`, `>`, `&` y la comilla simple, pero el valor es el mismo)
 * y el hash sigue siendo verificable si el archivo se reindenta.
 *
 * Lo que queda cubierto: todos los campos del informe incluidos `apkSha256`,
 * `apkVersion`, `apkVersionCode`, `certSha256Release` y `generatedAt`. Lo que no
 * queda cubierto: el propio `receipt` (por definicion) y la indentacion.
 *
 * Entrada tolerante: acepta UTF-8 con o sin BOM (el doctor actual escribe sin
 * BOM; versiones anteriores lo ponian) y UTF-16LE con BOM (redireccion
 * `powershell ... > archivo.json` en PowerShell 5.1).
 *
 * Expectativas opcionales: `--expect-apk-sha256` y `--expect-cert` comparan
 * contra el valor que espera el usuario (por ejemplo, el sha256 del APK
 * publicado en GitHub o la huella del certificado de release del README). El
 * informe se considera valido por si mismo aunque esas flags no se usen; con
 * ellas, ademas se comprueba que el entorno auditado sea el esperado.
 *
 * Codigos de salida: 0 = recibo valido, 1 = hallazgos, 2 = error de uso o de
 * lectura del archivo.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RECEIPT_ALGORITHM = "sha256";
const RECEIPT_CANONICAL = "json-compact-sin-receipt";
const HEX64 = /^[0-9a-f]{64}$/;

const HELP = `Verifica el recibo de un informe de doctor.ps1 (doctor-report.json).

Uso:
  node tools/verify-receipt.mjs <informe.json | ->   verifica el recibo
  node tools/verify-receipt.mjs <archivo> --expect-apk-sha256 <hex>
  node tools/verify-receipt.mjs <archivo> --expect-cert <hex>
  node tools/verify-receipt.mjs --self-test           autoprueba (CI, sin archivos)
  node tools/verify-receipt.mjs --help

El recibo hashea JSON.stringify(JSON.parse(archivo) quitando "receipt"): JSON
compacto del informe con sus claves en orden. El detalle completo del canon esta
en el comentario de cabecera de este archivo.

Codigos de salida: 0 valido, 1 hallazgos, 2 error de uso o de lectura.
`;

/** detecta BOM y decodifica; devuelve { text, encoding }. */
function decodeReportBytes(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf-8 con BOM" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString("utf16le"), encoding: "utf-16le con BOM" };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    if (swapped.length % 2 === 0) {
      swapped.swap16();
      return { text: swapped.toString("utf16le"), encoding: "utf-16be con BOM" };
    }
  }
  return { text: buf.toString("utf8"), encoding: "utf-8 sin BOM" };
}

function normalizeHex(value) {
  return String(value).replace(/[\s:.-]+/g, "").toLowerCase();
}

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function parseArgs(argv) {
  const args = { file: null, expectApk: null, expectCert: null, selfTest: false, help: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }
    if (arg === "--expect-apk-sha256" || arg === "--expect-cert") {
      const raw = argv[++i];
      if (!raw) throw new Error(`${arg} necesita un valor (64 hex, con o sin dos puntos)`);
      const hex = normalizeHex(raw);
      if (!HEX64.test(hex)) throw new Error(`${arg} no es un SHA-256 de 64 hex: ${JSON.stringify(raw)}`);
      if (arg === "--expect-apk-sha256") args.expectApk = hex;
      else args.expectCert = hex;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`opcion desconocida: ${arg} (usa --help)`);
    positionals.push(arg);
  }
  if (args.help || args.selfTest) return args;
  if (positionals.length === 0) throw new Error("falta el informe: pasa doctor-report.json o - (stdin)");
  if (positionals.length > 1) throw new Error(`argumentos de mas: ${positionals.slice(1).join(" ")}`);
  args.file = positionals[0];
  return args;
}

/** lee y parsea el informe; lanza Error con mensaje legible si no se puede. */
function readReport(file) {
  let buf;
  try {
    buf = file === "-" ? fs.readFileSync(0) : fs.readFileSync(path.resolve(file));
  } catch (error) {
    throw new Error(`no puedo leer ${file === "-" ? "la entrada estandar" : path.resolve(file)}: ${error.message}`);
  }
  const { text, encoding } = decodeReportBytes(buf);
  if (text.trim().length === 0) throw new Error("el informe esta vacio");
  let report;
  try {
    report = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON invalido: ${error.message}`);
  }
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw new Error("el informe debe ser un objeto JSON");
  }
  return { report, bytes: buf.length, encoding, source: file === "-" ? "(stdin)" : path.resolve(file) };
}

/**
 * Verifica un informe ya parseado. Devuelve { rows, failures } donde cada fila
 * es { ok, text }. No imprime ni sale: lo usan el CLI y la autoprueba.
 */
function verifyReport(report, expectations = {}) {
  const rows = [];
  const row = (ok, text) => {
    rows.push({ ok, text });
    return ok;
  };

  const tool = report.tool;
  row(tool === "dsh-companion-doctor", `informe de doctor.ps1 (tool=${JSON.stringify(tool ?? null)})`);
  row(
    report.reportVersion === 1 || (typeof report.reportVersion === "number" && report.reportVersion >= 1),
    `reportVersion=${JSON.stringify(report.reportVersion ?? null)}`
  );
  row(typeof report.ok === "boolean", `ok=${JSON.stringify(report.ok ?? null)}`);
  row(Array.isArray(report.blockers), "blockers[] presente");
  row(Array.isArray(report.warnings), "warnings[] presente");
  const generatedAtOk = typeof report.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt));
  row(generatedAtOk, `generatedAt ISO: ${JSON.stringify(report.generatedAt ?? null)}`);

  // Coherencia basica: ok=false debe traer blockers y ok=true no puede traerlos.
  const blockers = Array.isArray(report.blockers) ? report.blockers : null;
  if (blockers && typeof report.ok === "boolean") {
    if (report.ok === true) row(blockers.length === 0, "coherente: ok=true sin blockers");
    else row(blockers.length > 0, "coherente: ok=false con blockers");
  }

  const receipt = report.receipt;
  let receiptValid = false;
  if (receipt === undefined) {
    row(false, "receipt presente (informe generado antes del recibo o manipulado)");
  } else if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) {
    row(false, "receipt es un objeto");
  } else {
    const algorithmOk = row(receipt.algorithm === RECEIPT_ALGORITHM, `receipt.algorithm=${JSON.stringify(receipt.algorithm ?? null)}`);
    const canonicalOk = row(receipt.canonical === RECEIPT_CANONICAL, `receipt.canonical=${JSON.stringify(receipt.canonical ?? null)}`);
    const hashOk = row(typeof receipt.sha256 === "string" && HEX64.test(receipt.sha256), "receipt.sha256 es 64 hex");
    receiptValid = algorithmOk && canonicalOk && hashOk;
  }

  let computed = null;
  if (receiptValid) {
    // Canon: el informe sin la clave receipt, JSON compacto con su orden.
    const { receipt: _omit, ...body } = report;
    computed = sha256Hex(JSON.stringify(body));
    const expected = String(receipt.sha256).toLowerCase();
    row(computed === expected, `sha256 recalculado coincide (${computed})`);
    if (computed !== expected) {
      row(false, `receipt.sha256=${expected} pero el contenido hashea ${computed}`);
    }
  }

  // Campos de APK y certificado: formato, y expectativa si se pidio. Un informe
  // sin puente deja apkSha256/apkVersion vacios: eso es legitimo y el recibo lo
  // cubre igual; solo --expect-apk-sha256 exige que el APK este presente.
  const apkSha = typeof report.apkSha256 === "string" ? normalizeHex(report.apkSha256) : "";
  const apkVersion = typeof report.apkVersion === "string" ? report.apkVersion : "";
  const apkPresent = apkSha.length > 0;
  if (apkPresent) {
    row(HEX64.test(apkSha), `apkSha256 (${apkSha})`);
  } else {
    row(true, "apkSha256 vacio (el puente no respondio; usa --expect-apk-sha256 para exigirlo)");
  }
  row(apkVersion.length > 0 || !apkPresent, `apkVersion=${JSON.stringify(apkVersion || "(vacio)")}`);
  row(
    (apkVersion.length > 0) === apkPresent,
    "apkVersion y apkSha256 presentes a la vez (o ambos vacios)"
  );
  const apkCode = Number.isInteger(report.apkVersionCode) ? report.apkVersionCode : null;
  row(apkCode !== null && apkCode >= 0, `apkVersionCode=${JSON.stringify(apkCode)}`);

  const cert = typeof report.certSha256Release === "string" ? normalizeHex(report.certSha256Release) : "";
  row(HEX64.test(cert), `certSha256Release (${cert || "vacio"})`);

  if (expectations.expectApk) {
    row(apkPresent && apkSha === expectations.expectApk, `apkSha256 esperado ${expectations.expectApk}`);
  }
  if (expectations.expectCert) {
    row(cert === expectations.expectCert, `certSha256Release esperado ${expectations.expectCert}`);
  }

  const failures = rows.filter((item) => !item.ok).map((item) => item.text);
  return { rows, failures };
}

function printRows(rows) {
  for (const item of rows) console.log(`[ ${item.ok ? "OK" : "FALLA"} ] ${item.text}`);
}

const SELF_TEST_FIXTURE = {
  tool: "dsh-companion-doctor",
  reportVersion: 1,
  ok: true,
  nodeVersion: "24.21.0",
  bridgeVersion: "5.1.7",
  apkVersion: "5.1.7",
  apkVersionCode: 47,
  apkSha256: "fad7749b9bfa1c4eb130b02d5e37334056e3cc6bf54b7118fd4b130dd1c9ab98",
  certSha256Release: "4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23",
  phoneUrl: "http://192.0.2.10:57420",
  tunnel: "ZeroTier One [demo]",
  bindHost: "192.0.2.10",
  bridgePort: "57420",
  panelPort: "57421",
  checks: [{ id: "demo", level: "OK", message: "ruta C:\\Users\\demo & 'x' <y> -> \"ok\" m\u00f3vil\nfin" }],
  blockers: [],
  warnings: [],
  generatedAt: "2026-01-01T00:00:00.0000000-06:00",
};
/** Ancla de regresion: SHA-256 del canon del fixture (JSON.stringify sin receipt). */
const SELF_TEST_SHA256 = "0fe07499c55dd59aefd0d7596a6f4ac4977acf4b852a2567e674431ba0b8d415";

function runSelfTest() {
  let failures = 0;
  const check = (ok, text) => {
    console.log(`[ ${ok ? "OK" : "FALLA"} ] ${text}`);
    if (!ok) failures += 1;
  };
  const canonical = JSON.stringify(SELF_TEST_FIXTURE);
  const hash = sha256Hex(canonical);
  check(HEX64.test(SELF_TEST_SHA256) && hash === SELF_TEST_SHA256, `canon del fixture estable (${hash})`);
  const report = {
    ...SELF_TEST_FIXTURE,
    receipt: { algorithm: RECEIPT_ALGORITHM, canonical: RECEIPT_CANONICAL, sha256: hash },
  };
  const good = verifyReport(report, {
    expectApk: SELF_TEST_FIXTURE.apkSha256,
    expectCert: normalizeHex(SELF_TEST_FIXTURE.certSha256Release),
  });
  check(good.failures.length === 0, `el fixture verifica sin hallazgos (${good.rows.length} comprobaciones)`);
  const tampered = { ...report, ok: false, blockers: ["manipulado"] };
  const bad = verifyReport(tampered, {});
  check(bad.failures.length > 0, "una copia manipulada falla (hash y coherencia)");
  const noReceipt = { ...SELF_TEST_FIXTURE };
  const missing = verifyReport(noReceipt, {});
  check(missing.failures.length > 0, "un informe sin receipt falla");
  // Informe real de una maquina sin puente: apk vacio, recibo bien calculado.
  const offline = {
    ...SELF_TEST_FIXTURE,
    ok: false,
    apkVersion: "",
    apkVersionCode: 0,
    apkSha256: "",
    phoneUrl: "",
    tunnel: "",
    blockers: ["No hay ninguna interfaz de ZeroTier ni Tailscale con IP privada."],
  };
  const offlineReport = {
    ...offline,
    receipt: { algorithm: RECEIPT_ALGORITHM, canonical: RECEIPT_CANONICAL, sha256: sha256Hex(JSON.stringify(offline)) },
  };
  const offlineResult = verifyReport(offlineReport, {});
  check(offlineResult.failures.length === 0, "un informe sin puente (apk vacio) tambien verifica");
  return failures;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.selfTest) {
    const failures = runSelfTest();
    console.log(failures === 0 ? "\nAutoprueba correcta." : `\nAutoprueba con ${failures} hallazgo(s).`);
    return failures === 0 ? 0 : 1;
  }
  try {
    const { report, bytes, encoding, source } = readReport(args.file);
    console.log(`informe: ${source} (${bytes} bytes, ${encoding})`);
    const { rows, failures } = verifyReport(report, args);
    printRows(rows);
    if (failures.length > 0) {
      console.log(`\nRECIBO INVALIDO: ${failures.length} hallazgo(s). El informe fue alterado, esta incompleto o lo genero una version anterior del doctor.`);
      return 1;
    }
    console.log(`\nRECIBO VALIDO: ${rows.length} comprobaciones OK (sha256 ${report.receipt.sha256}).`);
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
}

process.exitCode = main();
