#!/usr/bin/env node
/*
 * Verifica backup.ps1 y restore.ps1 de DSH Mobile Companion.
 *
 *   node test/verify_backup.mjs
 *
 * Autocontenido: crea un HOME/DSH_HOME temporal con un registro, una clave y un
 * token FALSOS (aleatorios, nunca los reales) y comprueba, sin tocar jamas el
 * .dsh del usuario:
 *   1. backup.ps1 crea la carpeta con manifest.json y hashes correctos.
 *   2. -DryRun no escribe nada.
 *   3. -RegistryOnly respalda solo el registro.
 *   4. restore.ps1 devuelve los bytes originales tras corromper los vivos.
 *   5. restore.ps1 guarda el estado anterior en una carpeta -pre-restore.
 *   6. restore.ps1 rechaza un backup manipulado (fail-closed) sin tocar los vivos.
 *   7. restore.ps1 rechaza un manifest con hash invalido y nombres no permitidos.
 *   8. restore.ps1 falla con codigo 1 si no hay copias.
 *
 * Imprime PASS/FAIL por comprobacion y RESULTADO x/y. Exit 1 si algo falla.
 * En plataformas no Windows imprime SKIP y sale 0.
 * Sin dependencias npm: solo Node (>=22).
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POWERSHELL = process.env.DSH_TEST_POWERSHELL || "powershell";
const NAMES = ["companion-devices.json", "companion-access-key", "companion-panel-token"];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

function readManifest(dir) {
  const raw = fs.readFileSync(path.join(dir, "manifest.json"), "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function dirsOf(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function snapshotTree(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(path.relative(root, full), sha256File(full));
    }
  };
  walk(root);
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const childEnv = {};

function runPS(script, args) {
  const result = spawnSync(
    POWERSHELL,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, script), ...args],
    { encoding: "utf8", timeout: 180000, env: { ...process.env, ...childEnv } },
  );
  if (result.error) throw new Error(`${script}: ${result.error.message}`);
  return { code: result.status, stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

function main() {
  if (process.platform !== "win32") {
    console.log("SKIP: backup.ps1 y restore.ps1 son de Windows PowerShell; nada que probar en esta plataforma.");
    return;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-backup-test-"));
  const home = path.join(tmpRoot, "home");
  fs.mkdirSync(home, { recursive: true });
  // HOME y DSH_HOME temporales: aunque un script ignorase -DshHome, jamas
  // tocaria el .dsh real del usuario.
  childEnv.DSH_HOME = home;
  childEnv.USERPROFILE = home;
  childEnv.HOME = home;
  const state = { original: {}, corrupt: {}, backupRoot: path.join(home, "backups"), backupDir: "" };

  try {
    for (const name of NAMES) {
      state.original[name] = crypto.randomBytes(40 + name.length);
      fs.writeFileSync(path.join(home, name), state.original[name]);
    }

    check("backup.ps1 crea una copia y devuelve 0", () => {
      const r = runPS("backup.ps1", ["-DshHome", home]);
      assert(r.code === 0, `codigo ${r.code}: ${r.stdout} ${r.stderr}`);
      const dirs = dirsOf(state.backupRoot);
      assert(dirs.length === 1, `se esperaba 1 carpeta de copia, hay ${dirs.length}`);
      state.backupDir = path.join(state.backupRoot, dirs[0]);
      assert(fs.existsSync(path.join(state.backupDir, "manifest.json")), "falta manifest.json");
    });

    check("manifest.json tiene createdAt/source/files/toolVersion y hashes correctos", () => {
      assert(state.backupDir !== "", "no hay copia previa");
      const manifest = readManifest(state.backupDir);
      assert(typeof manifest.createdAt === "string" && !Number.isNaN(Date.parse(manifest.createdAt)), "createdAt invalido");
      assert(path.resolve(manifest.source).toLowerCase() === path.resolve(home).toLowerCase(), `source=${manifest.source}`);
      assert(typeof manifest.toolVersion === "string" && manifest.toolVersion.length > 0, "falta toolVersion");
      assert(Array.isArray(manifest.files) && manifest.files.length === NAMES.length, `files=${manifest.files?.length}`);
      for (const name of NAMES) {
        const entry = manifest.files.find((item) => item.name === name);
        assert(entry, `el manifest no incluye ${name}`);
        assert(entry.bytes === state.original[name].length, `${name}: bytes ${entry.bytes}`);
        assert(entry.sha256.toLowerCase() === sha256(state.original[name]), `${name}: sha256 distinto`);
        assert(sha256File(path.join(state.backupDir, name)) === sha256(state.original[name]), `${name}: copia distinta del origen`);
      }
    });

    check("-DryRun no escribe nada", () => {
      const before = snapshotTree(home);
      const r = runPS("backup.ps1", ["-DshHome", home, "-DryRun"]);
      assert(r.code === 0, `codigo ${r.code}: ${r.stdout} ${r.stderr}`);
      assert(/DRY-RUN/i.test(r.stdout), "la salida no marca DRY-RUN");
      const after = snapshotTree(home);
      assert(after.size === before.size, `numero de archivos: ${before.size} -> ${after.size}`);
      for (const [file, hash] of before) assert(after.get(file) === hash, `cambio el archivo ${file}`);
    });

    check("-RegistryOnly respalda solo el registro", () => {
      const home2 = path.join(tmpRoot, "home-registry");
      fs.mkdirSync(home2, { recursive: true });
      for (const name of NAMES) fs.writeFileSync(path.join(home2, name), crypto.randomBytes(32));
      const r = runPS("backup.ps1", ["-DshHome", home2, "-RegistryOnly"]);
      assert(r.code === 0, `codigo ${r.code}: ${r.stdout} ${r.stderr}`);
      const dirs = dirsOf(path.join(home2, "backups"));
      assert(dirs.length === 1, `se esperaba 1 carpeta, hay ${dirs.length}`);
      const dir = path.join(home2, "backups", dirs[0]);
      const manifest = readManifest(dir);
      assert(manifest.files.length === 1, `files=${manifest.files.length}`);
      assert(manifest.files[0].name === "companion-devices.json", `nombre=${manifest.files[0].name}`);
      assert(!fs.existsSync(path.join(dir, "companion-access-key")), "copio la clave con -RegistryOnly");
    });

    check("restore.ps1 restaura los bytes originales tras corromper los vivos", () => {
      for (const name of NAMES) {
        state.corrupt[name] = Buffer.from(`corrupto-${name}-${crypto.randomBytes(8).toString("hex")}`);
        fs.writeFileSync(path.join(home, name), state.corrupt[name]);
      }
      const r = runPS("restore.ps1", ["-DshHome", home]);
      assert(r.code === 0, `codigo ${r.code}: ${r.stdout} ${r.stderr}`);
      for (const name of NAMES) {
        assert(sha256File(path.join(home, name)) === sha256(state.original[name]), `${name} no quedo restaurado`);
      }
    });

    check("restore.ps1 guarda el estado anterior en -pre-restore", () => {
      const pre = dirsOf(state.backupRoot).filter((dir) => dir.includes("-pre-restore"));
      assert(pre.length === 1, `carpetas -pre-restore: ${pre.length}`);
      const dir = path.join(state.backupRoot, pre[0]);
      const manifest = readManifest(dir);
      for (const name of NAMES) {
        const entry = manifest.files.find((item) => item.name === name);
        assert(entry, `el snapshot no incluye ${name}`);
        assert(entry.sha256 === sha256(state.corrupt[name]), `el snapshot de ${name} no es el estado anterior`);
      }
    });

    check("restore.ps1 rechaza un backup manipulado sin tocar los vivos", () => {
      const tampered = path.join(tmpRoot, "backup-manipulado");
      fs.cpSync(state.backupDir, tampered, { recursive: true });
      const target = path.join(tampered, "companion-access-key");
      fs.writeFileSync(target, Buffer.concat([fs.readFileSync(target), Buffer.from("manipulado")]));
      const liveBefore = snapshotTree(home);
      const preBefore = dirsOf(state.backupRoot).filter((dir) => dir.includes("-pre-restore")).length;
      const r = runPS("restore.ps1", ["-DshHome", home, "-From", tampered]);
      assert(r.code === 1, `se esperaba codigo 1, hay ${r.code}: ${r.stdout}`);
      const liveAfter = snapshotTree(home);
      for (const [file, hash] of liveBefore) assert(liveAfter.get(file) === hash, `se modifico ${file}`);
      const preAfter = dirsOf(state.backupRoot).filter((dir) => dir.includes("-pre-restore")).length;
      assert(preAfter === preBefore, "creo el snapshot -pre-restore pese a rechazar la copia");
    });

    check("restore.ps1 rechaza un manifest con hash invalido", () => {
      const tampered = path.join(tmpRoot, "manifest-hash-malo");
      fs.cpSync(state.backupDir, tampered, { recursive: true });
      const manifest = readManifest(tampered);
      manifest.files[0].sha256 = "0".repeat(64);
      fs.writeFileSync(path.join(tampered, "manifest.json"), JSON.stringify(manifest));
      const liveBefore = snapshotTree(home);
      const r = runPS("restore.ps1", ["-DshHome", home, "-From", tampered]);
      assert(r.code === 1, `se esperaba codigo 1, hay ${r.code}: ${r.stdout}`);
      const liveAfter = snapshotTree(home);
      for (const [file, hash] of liveBefore) assert(liveAfter.get(file) === hash, `se modifico ${file}`);
    });

    check("restore.ps1 rechaza nombres fuera de la lista blanca", () => {
      const tampered = path.join(tmpRoot, "manifest-peligroso");
      fs.cpSync(state.backupDir, tampered, { recursive: true });
      const manifest = readManifest(tampered);
      manifest.files[0].name = "..\\evil.txt";
      fs.writeFileSync(path.join(tampered, "manifest.json"), JSON.stringify(manifest));
      const r = runPS("restore.ps1", ["-DshHome", home, "-From", tampered]);
      assert(r.code === 1, `se esperaba codigo 1, hay ${r.code}: ${r.stdout}`);
      assert(!fs.existsSync(path.join(home, "evil.txt")), "escribio evil.txt en DSH_HOME");
      assert(!fs.existsSync(path.join(tmpRoot, "evil.txt")), "escribio evil.txt fuera de DSH_HOME");
    });

    check("restore.ps1 falla con codigo 1 si no hay copias", () => {
      const emptyHome = path.join(tmpRoot, "home-vacio");
      fs.mkdirSync(emptyHome, { recursive: true });
      const r = runPS("restore.ps1", ["-DshHome", emptyHome]);
      assert(r.code === 1, `se esperaba codigo 1, hay ${r.code}`);
    });
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // La limpieza del temporal no debe tapar el resultado de las pruebas.
    }
  }
}

try {
  main();
} catch (error) {
  failed++;
  console.log(`FAIL preparacion: ${error.message}`);
}

console.log("");
console.log(`RESULTADO ${passed}/${passed + failed}`);
if (failed > 0) process.exitCode = 1;
