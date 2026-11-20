/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/*
 * Auditoría del árbol publicado. Sin dependencias: usa git y Node.
 *
 *   node tools/audit-repo.mjs
 *
 * Revisa lo que un contribuidor recibe de verdad (`git ls-files`), no lo que hay
 * en tu carpeta de trabajo: codificación, sintaxis, enlaces, versiones, datos
 * privados y afirmaciones de la documentación que el código no respalde.
 *
 * Sale con código 1 si encuentra algo. Es lo que ejecuta la CI.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const fail = [];
const info = [];
const F = (m) => fail.push(m);
const I = (m) => info.push(m);

const isText = (f) =>
  /\.(mjs|js|java|md|html|css|json|xml|yml|yaml|bat|vbs|sh|plist|webmanifest|svg|gitattributes|gitignore|dockerignore)$/.test(f);

const read = (f) => fs.readFileSync(f, "utf8");

// 1. Codificación: BOM, texto roto y mojibake
const MOJI = /Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]|â[\u0080-\u009F\u20AC\u201A-\u2122]/;
for (const f of tracked.filter(isText)) {
  const buf = fs.readFileSync(f);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) F(`BOM UTF-8: ${f}`);
  const text = buf.toString("utf8");
  if (text.includes("\uFFFD")) F(`texto con U+FFFD: ${f}`);
  text.split("\n").forEach((line, i) => {
    if (MOJI.test(line)) F(`mojibake: ${f}:${i + 1}`);
  });
}

// 2. Sintaxis de Node y del navegador
for (const f of tracked.filter((x) => x.endsWith(".mjs"))) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch {
    F(`sintaxis Node: ${f}`);
  }
}
for (const f of tracked.filter((x) => x.endsWith(".js"))) {
  try {
    new Function(read(f));
  } catch (error) {
    F(`sintaxis navegador: ${f} (${error.message})`);
  }
}
I(`${tracked.filter((x) => x.endsWith(".mjs")).length} módulos .mjs con sintaxis válida`);

// 3. JSON válido
for (const f of tracked.filter((x) => /\.(json|webmanifest)$/.test(x))) {
  try {
    JSON.parse(read(f));
  } catch {
    F(`JSON inválido: ${f}`);
  }
}

// 4. Markdown: enlaces relativos y tablas
for (const f of tracked.filter((x) => x.endsWith(".md"))) {
  const text = read(f);
  for (const m of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    const target = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), target))) F(`enlace roto: ${f} -> ${target}`);
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\|.*\|$/.test(lines[i]) || !/^\|[\s:-]+\|$/.test(lines[i + 1] || "")) continue;
    const columns = lines[i].split("|").length;
    let j = i + 2;
    while (j < lines.length && /^\|.*\|$/.test(lines[j])) {
      if (lines[j].split("|").length !== columns) F(`tabla descuadrada: ${f}:${j + 1}`);
      j++;
    }
    i = j;
  }
}
I(`${tracked.filter((x) => x.endsWith(".md")).length} documentos markdown revisados`);

// 5. offline.html: recursos locales y estructura
if (fs.existsSync("offline.html")) {
  const offline = read("offline.html");
  for (const m of offline.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = m[1];
    if (/^https?:/.test(target)) F(`offline.html carga un recurso externo: ${target}`);
    else if (!fs.existsSync(target)) F(`offline.html referencia un archivo ausente: ${target}`);
  }
  const open = (offline.match(/<section\b/g) || []).length;
  const close = (offline.match(/<\/section>/g) || []).length;
  if (open !== close) F(`offline.html: <section> desbalanceados (${open}/${close})`);
}

// 6. CSS: llaves equilibradas
for (const f of tracked.filter((x) => x.endsWith(".css"))) {
  const text = read(f);
  if ((text.match(/{/g) || []).length !== (text.match(/}/g) || []).length) F(`CSS con llaves desbalanceadas: ${f}`);
}

// 7. Versiones coherentes
if (fs.existsSync("package.json") && fs.existsSync("src/config.mjs") && fs.existsSync("android_src/AndroidManifest.xml")) {
  const pkg = JSON.parse(read("package.json"));
  const cfg = read("src/config.mjs");
  const manifest = read("android_src/AndroidManifest.xml");
  const version = (cfg.match(/version:\s*"([^"]+)"/) || [])[1];
  const apkVersion = (cfg.match(/apkVersion:\s*"([^"]+)"/) || [])[1];
  const apkCode = (cfg.match(/apkVersionCode:\s*(\d+)/) || [])[1];
  const manifestName = (manifest.match(/versionName="([^"]+)"/) || [])[1];
  const manifestCode = (manifest.match(/versionCode="(\d+)"/) || [])[1];
  if (pkg.version !== version) F(`package.json (${pkg.version}) != config.mjs (${version})`);
  if (apkVersion !== manifestName) F(`apkVersion (${apkVersion}) != versionName (${manifestName})`);
  if (apkCode !== manifestCode) F(`apkVersionCode (${apkCode}) != versionCode (${manifestCode})`);
  I(`versión coherente: ${version} / versionCode ${manifestCode}`);
  // La checklist se usa desde el telefono para verificar el build: su ejemplo
  // JSON no puede pedir un versionCode distinto al real.
  const checklistPath = path.join(process.cwd(), "CHECKLIST-ESTABLE.md");
  if (fs.existsSync(checklistPath)) {
    const checklistText = fs.readFileSync(checklistPath, "utf8");
    for (const match of checklistText.matchAll(/"apkVersionCode":\s*(\d+)/g)) {
      if (match[1] !== apkCode) F(`CHECKLIST-ESTABLE.md pide apkVersionCode ${match[1]} (config: ${apkCode})`);
    }
  }

}

// 7b. La documentación publica la misma versión que el código: los 7 README
// (badge + declaración de la versión actual + versionCode) y la última entrada
// del CHANGELOG. Antes solo se comparaban package/config/manifest; una release
// podía salir con los README en otra versión.
if (fs.existsSync("src/config.mjs") && fs.existsSync("CHANGELOG.md")) {
  const cfgDoc = read("src/config.mjs");
  const version = (cfgDoc.match(/version:\s*"([^"]+)"/) || [])[1];
  const apkCode = (cfgDoc.match(/apkVersionCode:\s*(\d+)/) || [])[1];
  const readmes = tracked.filter((f) => /^README(\.[a-z]{2})?\.md$/.test(f)).sort();
  if (readmes.length !== 7) F(`se esperaban 7 README versionados, hay ${readmes.length}`);
  for (const f of readmes) {
    const text = read(f);
    const badge = (text.match(/badge\/version-(\d+\.\d+\.\d+)-/) || [])[1];
    if (badge !== version) F(`${f}: badge de versión (${badge || "ausente"}) != config.version (${version})`);
    // Declaraciones de la versión actual: "**5.4.0** ... `versionCode` 66".
    // Se exige al menos una y que todas coincidan (la prosa "Current version",
    // "Versión actual", etc. cambia de idioma, pero el par versión+code no).
    const declarations = [...text.matchAll(/\*\*(\d+\.\d+\.\d+)\*\*[^\n]*?`versionCode`\s+(\d+)/g)];
    if (declarations.length === 0) F(`${f}: no declara la versión actual con su versionCode`);
    for (const [, declaredVersion, declaredCode] of declarations) {
      if (declaredVersion !== version) F(`${f}: declara la versión (${declaredVersion}) != config.version (${version})`);
      if (declaredCode !== apkCode) F(`${f}: versionCode (${declaredCode}) != apkVersionCode (${apkCode})`);
    }
  }
  const changelog = read("CHANGELOG.md");
  const lastEntry = changelog.match(/^##\s+(\d+\.\d+\.\d+)\s+—[^\n]*?`versionCode`\s+(\d+)/m) || [];
  if (!lastEntry[1]) {
    F("CHANGELOG.md: no hay entrada '## <version> — `versionCode` <n>'");
  } else {
    if (lastEntry[1] !== version) F(`CHANGELOG.md: última versión (${lastEntry[1]}) != config.version (${version})`);
    if (lastEntry[2] !== apkCode) F(`CHANGELOG.md: versionCode (${lastEntry[2]}) != apkVersionCode (${apkCode})`);
  }
  I(`documentación coherente: ${readmes.length} README y CHANGELOG en ${version} / versionCode ${apkCode}`);
}

// 8. Nombres de archivo que la documentación afirma
const allText = tracked.filter((x) => /\.(md|mjs|java|html)$/.test(x)).map(read).join("\n");
// Archivos que la documentacion menciona pero viven en el HOME del usuario en
// tiempo de ejecucion, no en el repositorio.
const RUNTIME_FILES = new Set([
  "companion-devices.json", "companion-access-key", "companion-panel-token",
  "companion-panel-url.txt", "bridge.log", "session.v4.jsonl.zstd",
  ".credentials.yaml", "dsh-companion.service", "doctor-report.json",
  // Indice id -> archivo que crea el puente en synced_chats/notes/ (idempotencia
  // de las notas del telefono): vive en el HOME del usuario, no en el repo.
  "notes.json", "org.json", "ids.json",
]);
for (const m of allText.matchAll(/`([A-Za-z0-9_.\/-]+\.(?:mjs|java|json|md|html|css|js|yml|bat|vbs|sh|plist|svg|webmanifest))`/g)) {
  const name = m[1];
  if (name.includes("/") || RUNTIME_FILES.has(path.basename(name))) continue;
  if (tracked.some((f) => path.basename(f) === name)) continue;
  F(`documentación menciona un archivo inexistente: ${name}`);
}

// 9. Rutas y variables documentadas frente al código
const readme = fs.existsSync("README.md") ? read("README.md") : "";
const sourceText = tracked.filter((x) => x.endsWith(".mjs") && !x.startsWith("test/")).map(read).join("\n");
for (const m of readme.matchAll(/`(?:GET|POST) (\/[^`]+)`/g)) {
  const route = m[1].split("?")[0].split(":")[0];
  if (!sourceText.includes(route)) F(`ruta documentada y ausente del código: ${m[1]}`);
}
for (const v of [...new Set([...readme.matchAll(/`(DSH_[A-Z_]+)`/g)].map((m) => m[1]))]) {
  if (!sourceText.includes(v)) F(`variable documentada y no leída en el código: ${v}`);
}

// 10. Datos privados y secretos
for (const f of tracked.filter(isText)) {
  const text = read(f);
  if (/10\.173\.252\.\d+/.test(text)) F(`IP privada del autor en ${f}`);
  if (/DSH_ACCESS_KEY\s*[:=]\s*["'][A-Za-z0-9_-]{16,}["']/.test(text)) F(`clave de acceso en claro en ${f}`);
  if (/(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(text)) F(`clave privada en ${f}`);
}

// 11. Licencia: la documentación no debe afirmar "open source" con BSL/PolyForm
for (const f of tracked.filter((x) => x.endsWith(".md"))) {
  const text = read(f);
  // NEGACION: "no es código abierto" o "not open source" son correctos; solo se
  // marca una afirmacion.
  const NEGACION = /no (es|somos|pretende ser)|not |no longer|nunca|jamás|не |不是|ではない|아닙니다/i;
  const lineas = text.split("\n").filter((line) => /open[- ]source|código abierto|código aberto|オープンソース|开源|Open-Source/i.test(line));
  for (const line of lineas) {
    if (NEGACION.test(line)) continue;
    F(`afirma "open source" y la licencia es Business Source License 1.1: ${f}`);
  }
}

// 12. Restos de desarrollo
for (const f of tracked.filter((x) => /\.(mjs|java)$/.test(x) && !x.startsWith("tools/"))) {
  read(f).split("\n").forEach((line, i) => {
    if (/(?<![\w.])(TODO|FIXME|XXX)(?!\w)/.test(line)) F(`marcador pendiente: ${f}:${i + 1}`);
    if (/debugger\s*;/.test(line)) F(`debugger en producción: ${f}:${i + 1}`);
  });
}

// 13. Regla del proyecto: ningún archivo de código por encima de 400 líneas
for (const f of tracked.filter((x) => /\.(mjs|java|js|css|html)$/.test(x))) {
  const lines = read(f).split("\n").length;
  if (lines > 400) F(`más de 400 líneas (${lines}): ${f}`);
}

console.log(`Archivos versionados: ${tracked.length}`);
for (const m of info) console.log(`  · ${m}`);
if (fail.length === 0) {
  console.log("\nAuditoría correcta: sin hallazgos.");
} else {
  console.log(`\nHALLAZGOS (${fail.length}):`);
  for (const m of fail) console.log(`  · ${m}`);
  process.exitCode = 1;
}
