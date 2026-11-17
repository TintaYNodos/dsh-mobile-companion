/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Utilidades de test/verify_notes.mjs: cliente HTTP del puente aislado,
 * dispositivos de prueba y lectores de la bandeja y del indice de notas.
 *
 * Se separa de la suite para que verify_notes.mjs se quede por debajo del tope
 * de 400 lineas por archivo. No es una suite: run-suite.mjs y run-all.mjs solo
 * ejecutan los archivos verify_*.mjs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./ci/start-bridge.mjs";
import { repairMojibake } from "../src/text-encoding.mjs";

/**
 * H-17: rutas al arbol de sincronizacion AISLADO. Se inicializan desde
 * DSH_SYNC_DIR (lo fija run-suite/start-bridge) y verify_notes las re-apunta con
 * setNotesSyncDir() al arrancar su propio puente. Asi la suite nunca escribe en
 * companion/synced_chats.
 */
export let SYNC_DIR = path.resolve(process.env.DSH_SYNC_DIR || path.join(REPO_ROOT, "synced_chats"));
export let NOTES_DIR = path.join(SYNC_DIR, "notes");
export let INBOX = path.join(NOTES_DIR, "inbox.jsonl");
export let IDS = path.join(NOTES_DIR, "ids.json");

/** Re-apunta las rutas al synced_chats temporal de un startBridge() concreto. */
export function setNotesSyncDir(syncDir) {
  SYNC_DIR = path.resolve(syncDir);
  NOTES_DIR = path.join(SYNC_DIR, "notes");
  INBOX = path.join(NOTES_DIR, "inbox.jsonl");
  IDS = path.join(NOTES_DIR, "ids.json");
}
/** Nombre de nota: AAAA-MM-DD-HHMMSS-<slug>.md; slug solo [a-z0-9-]. */
export const NOTE_NAME_RE = /^\d{4}-\d{2}-\d{2}-\d{6}-[a-z0-9-]+\.md$/;
export const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const request = (port, pathname, { method = "GET", headers = {}, body = null } = {}) =>
  new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers, agent: false, timeout: 15000 },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          let json = null;
          const text = Buffer.concat(chunks).toString("utf8");
          try { json = JSON.parse(text); } catch { json = null; }
          resolve({ status: res.statusCode || 0, headers: res.headers || {}, body: text, json });
        });
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, body: "timeout", json: null }); });
    req.on("error", (error) => resolve({ status: 0, headers: {}, body: error.code || error.message, json: null }));
    if (body !== null) req.write(body);
    req.end();
  });

/** Cliente de notas atado al puente aislado de esta ejecucion. */
export function createNotesClient(bridge) {
  const jsonHeaders = (extra = {}) => ({ "content-type": "application/json", ...extra });
  const authHeader = () => ({ authorization: `Basic ${Buffer.from(`dsh:${bridge.accessKey}`, "utf8").toString("base64")}` });
  const postNote = (payload, headers = jsonHeaders(authHeader())) =>
    request(bridge.bridgePort, "/dsh-companion/notes", {
      method: "POST",
      headers,
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const getNotes = (headers = authHeader()) => request(bridge.bridgePort, "/dsh-companion/notes", { headers });
  /** POST /dsh-companion/sync: dispara la poda completa de retencion. */
  const syncChat = (sessionTitle) =>
    request(bridge.bridgePort, "/dsh-companion/sync", {
      method: "POST",
      headers: jsonHeaders(authHeader()),
      body: JSON.stringify({ sessionTitle, messages: [{ role: "user", content: "hola", timestamp: Date.now() }] }),
    });
  const makeDevice = (overrides = {}) => ({
    id: crypto.randomBytes(12).toString("base64url"), name: "", address: "10.9.9.9", agent: "prueba-notas",
    approvedAt: new Date().toISOString(), lastSeen: new Date().toISOString(), lastRefresh: new Date().toISOString(),
    claimed: true, ...overrides,
  });
  const registryPath = path.join(bridge.dshHome, "companion-devices.json");
  const writeRegistry = async (devices) => {
    fs.writeFileSync(registryPath, JSON.stringify({ devices, pending: [], history: [], denied: [] }, null, 2));
    await sleep(25); // deja que el puente observe el cambio de mtime
  };
  const cookieOf = (device) => `dsh-companion-device=${device.id}`;

  const createdFiles = [];
  const remember = (file) => {
    if (typeof file === "string" && file && !createdFiles.includes(file)) createdFiles.push(file);
    return file;
  };
  const notePath = (file) => (file ? path.join(NOTES_DIR, file) : "");
  const noteText = (file) => {
    try { return fs.readFileSync(notePath(file), "utf8"); } catch { return ""; }
  };
  const readIds = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(IDS, "utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  };
  /** Separa el front matter YAML del resto del Markdown. */
  const splitNote = (text) => {
    const end = text.indexOf("\n---\n");
    return end < 0 ? { front: "", markdown: "" } : { front: text.slice(0, end + 5), markdown: text.slice(end + 5) };
  };
  const inboxLines = () =>
    fs.existsSync(INBOX) ? fs.readFileSync(INBOX, "utf8").split("\n").filter((line) => line.trim() !== "") : [];
  const inboxLineFor = (file) => {
    for (const line of inboxLines()) {
      try { if (JSON.parse(line).file === file) return line; } catch { /* linea ajena */ }
    }
    return null;
  };
  const inboxRecordFor = (file) => {
    const line = inboxLineFor(file);
    try { return line ? JSON.parse(line) : null; } catch { return null; }
  };

  return {
    jsonHeaders, authHeader, postNote, getNotes, syncChat, makeDevice, writeRegistry, cookieOf,
    createdFiles, remember, notePath, noteText, readIds, splitNote, inboxLines, inboxLineFor, inboxRecordFor,
  };
}

/** Modulos que importa src/sync-retention.mjs y hay que copiar al arbol temporal. */
const RETENTION_SOURCES = ["config.mjs", "sync-retention.mjs", "sync-index.mjs", "sync-format.mjs"];
/** Tope de lineas de notes/inbox.jsonl (mismo valor que src/sync-retention.mjs). */
const INBOX_MAX_LINES = 500;

/**
 * Arboles temporales con `synced_chats/notes/` para probar la poda real de
 * retencion sin tocar el repositorio. `cleanup()` borra lo creado; la suite lo
 * llama en su bloque finally.
 */
export function createRetentionHarness() {
  const fixtures = [];
  const makeFixture = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-notes-retention-"));
    const srcDir = path.join(root, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    for (const name of RETENTION_SOURCES) fs.copyFileSync(path.join(REPO_ROOT, "src", name), path.join(srcDir, name));
    const dir = path.join(root, "synced_chats", "notes");
    fs.mkdirSync(dir, { recursive: true });
    fixtures.push(root);
    return { root, dir };
  };
  // Los arboles de retencion se prueban con el synced_chats DEL FIXTURE: se
  // limpian los overrides DSH_SYNC_DIR/DSH_LOG_FILE heredados del runner (H-17)
  // para que config.mjs vuelva a resolver ROOT/synced_chats del arbol copiado.
  const fixtureEnv = { ...process.env };
  delete fixtureEnv.DSH_SYNC_DIR;
  delete fixtureEnv.DSH_LOG_FILE;
  const runPrune = (fixture, extraEnv) =>
    spawnSync(process.execPath, ["--input-type=module", "-e",
      "const { pruneSyncedChats } = await import('./src/sync-retention.mjs'); console.log('removed=' + (await pruneSyncedChats()));"],
      { cwd: fixture.root, env: { ...fixtureEnv, ...extraEnv }, encoding: "utf8", timeout: 30000, windowsHide: true });
  const ageFile = (file, hoursAgo) => {
    const when = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    fs.utimesSync(file, when, when);
  };
  const cleanup = () => {
    for (const root of fixtures) {
      try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temporal */ }
    }
  };
  return { makeFixture, runPrune, ageFile, cleanup };
}

/**
 * Seccion de retencion de verify_notes.mjs (vive aqui para que la suite no pase
 * del tope de 400 lineas). Prueba con arboles temporales: poda por archivos, por
 * MB, tope de 500 lineas de inbox.jsonl, lineas cuyo .md ya no existe y la
 * proteccion de ids.json. `check` es el contador de la suite.
 */
export function runRetentionChecks(check, retention) {
  const filesFixture = retention.makeFixture();
  const oldNote = path.join(filesFixture.dir, "2026-01-01-000000-vieja.md");
  const newNote = path.join(filesFixture.dir, "2026-01-02-000000-nueva.md");
  const fixtureInbox = path.join(filesFixture.dir, "inbox.jsonl");
  const fixtureIds = path.join(filesFixture.dir, "ids.json");
  fs.writeFileSync(oldNote, "# vieja\n\ncuerpo viejo\n", "utf8");
  fs.writeFileSync(newNote, "# nueva\n\ncuerpo nuevo\n", "utf8");
  fs.writeFileSync(fixtureInbox, '{"file":"2026-01-02-000000-nueva.md"}\n', "utf8");
  fs.writeFileSync(fixtureIds, '{"id-viejo":"2026-01-01-000000-vieja.md"}\n', "utf8");
  retention.ageFile(oldNote, 2);
  retention.ageFile(fixtureIds, 3);
  const filesRun = retention.runPrune(filesFixture, { DSH_SYNC_MAX_FILES: "1" });
  check("retencion de archivos poda notas antiguas",
    filesRun.status === 0 && String(filesRun.stdout).includes("removed=1") && !fs.existsSync(oldNote) && fs.existsSync(newNote),
    `exit=${filesRun.status} out=${String(filesRun.stdout).trim()} err=${String(filesRun.stderr).trim().slice(0, 120)}`);
  check("la retencion conserva la linea viva de la bandeja y no poda ids.json",
    fs.existsSync(fixtureInbox) && fs.readFileSync(fixtureInbox, "utf8").includes("2026-01-02-000000-nueva.md") && fs.existsSync(fixtureIds));

  const bytesFixture = retention.makeFixture();
  const heavyNote = path.join(bytesFixture.dir, "2026-01-01-000000-pesada.md");
  const lightNote = path.join(bytesFixture.dir, "2026-01-02-000000-ligera.md");
  fs.writeFileSync(heavyNote, `# pesada\n\n${"x".repeat(1200 * 1024)}\n`, "utf8");
  fs.writeFileSync(lightNote, "# ligera\n\ncuerpo ligero\n", "utf8");
  retention.ageFile(heavyNote, 2);
  const bytesRun = retention.runPrune(bytesFixture, { DSH_SYNC_MAX_FILES: "200", DSH_SYNC_MAX_TOTAL_MB: "1" });
  check("retencion por MB cuenta el tamano de notes/",
    bytesRun.status === 0 && String(bytesRun.stdout).includes("removed=1") && !fs.existsSync(heavyNote) && fs.existsSync(lightNote),
    `exit=${bytesRun.status} out=${String(bytesRun.stdout).trim()} err=${String(bytesRun.stderr).trim().slice(0, 120)}`);

  // Bandeja: metadatos en claro acotados a 500 lineas y sin huerfanas.
  const inboxFixture = retention.makeFixture();
  const liveNote = "2026-01-02-000000-nueva.md";
  const inboxPath = path.join(inboxFixture.dir, "inbox.jsonl");
  const inboxIds = path.join(inboxFixture.dir, "ids.json");
  fs.writeFileSync(path.join(inboxFixture.dir, liveNote), "# nueva\n\ncuerpo\n", "utf8");
  const orphan = JSON.stringify({ file: "2026-01-01-000000-borrada.md", id: "id-borrado", title: "huerfana" });
  const inboxLines = Array.from({ length: INBOX_MAX_LINES + 5 }, (_, index) =>
    JSON.stringify({ file: liveNote, id: `id-${index}`, title: `nota ${index}` }));
  inboxLines.splice(5, 0, orphan);
  fs.writeFileSync(inboxPath, `${inboxLines.join("\n")}\n`, "utf8");
  fs.writeFileSync(inboxIds, '{"id-borrado":"2026-01-01-000000-borrada.md"}\n', "utf8");
  const inboxRun = retention.runPrune(inboxFixture, { DSH_SYNC_MAX_FILES: "200" });
  const keptInbox = fs.readFileSync(inboxPath, "utf8").split("\n").filter((line) => line.trim() !== "");
  check("retencion de la bandeja conserva como maximo las ultimas 500 lineas",
    inboxRun.status === 0 && keptInbox.length === INBOX_MAX_LINES &&
    keptInbox[0].includes('"nota 5"') && keptInbox[keptInbox.length - 1].includes('"nota 504"'),
    `exit=${inboxRun.status} lineas=${keptInbox.length}`);
  check("retencion de la bandeja elimina la linea cuyo .md ya no existe y protege ids.json",
    !keptInbox.some((line) => line.includes("2026-01-01-000000-borrada.md")) &&
    fs.existsSync(inboxIds) && JSON.parse(fs.readFileSync(inboxIds, "utf8"))["id-borrado"] === "2026-01-01-000000-borrada.md");
  const fixtureIndex = path.join(inboxFixture.dir, "INDICE.md");
  const fixtureIndexText = fs.existsSync(fixtureIndex) ? fs.readFileSync(fixtureIndex, "utf8") : "";
  check("retencion: el indice legible se rehace tras podar la bandeja y no lista la nota sin archivo",
    fixtureIndexText.includes(liveNote) && !fixtureIndexText.includes("2026-01-01-000000-borrada.md"),
    `bytes=${fixtureIndexText.length}`);
}

/**
 * Integracion ligera del tope de la bandeja SIN syncs de chats: con
 * inbox.jsonl lleno, un POST de nota debe dejarlo en <=500 lineas (poda rapida
 * que routes-notes.mjs ejecuta tras escribir). `seedFile` es una nota existente
 * que referencian las lineas sembradas.
 */
export async function runInboxCapCheck(check, client, seedFile) {
  const seeded = Array.from({ length: INBOX_MAX_LINES + 5 }, (_, index) =>
    JSON.stringify({ file: seedFile, id: `cap-${index}`, title: `cap ${index}` }));
  fs.writeFileSync(INBOX, `${seeded.join("\n")}\n`, "utf8");
  const res = await client.postNote({ title: "Nota que dispara la poda de la bandeja", body: "cuerpo" });
  const file = client.remember(res.json?.file);
  const lines = fs.readFileSync(INBOX, "utf8").split("\n").filter((line) => line.trim() !== "");
  check("POST de nota sin syncs poda inbox.jsonl a <=500 lineas",
    res.status === 200 && lines.length <= INBOX_MAX_LINES &&
    lines.some((line) => line.includes(`"file":"${file}"`)),
    `status=${res.status} lineas=${lines.length}`);
}

/**
 * H-13: GET devuelve las 205 notas sembradas (el tope real es 500).
 * Recibe el cliente de la suite para hablar con el puente aislado.
 */
export async function runReadLimitChecks(check, client) {
  const fileOf = (index) => `2026-01-01-000000-lectura-${String(index).padStart(3, "0")}.md`;
  const lines = Array.from({ length: 205 }, (_, index) =>
    JSON.stringify({
      file: fileOf(index),
      id: `lectura-${index}`,
      title: `lectura ${index}`,
      receivedAt: new Date(Date.now() - index * 1000).toISOString(),
    }));
  fs.writeFileSync(INBOX, `${lines.join("\n")}\n`, "utf8");
  const res = await client.getNotes();
  const notes = Array.isArray(res.json?.notes) ? res.json.notes : [];
  check("H-13: GET /notes devuelve 205 notas (tope alineado con la retencion de 500)",
    res.status === 200 && notes.length === 205, `status=${res.status} n=${notes.length}`);
}

/**
 * Indice legible para agentes (notes/INDICE.md): existe junto a las notas, la
 * cabecera explica como pedir una, cada nota aparece con fecha, titulo,
 * perfil/tipo, estado y archivo; se rehace al reenviar el mismo id, no cuenta
 * como nota en GET /notes, no lista notas podadas, tolera lineas corruptas y se
 * regenera al arrancar el puente (proceso hijo con el mismo DSH_SYNC_DIR).
 */
export async function runNotesIndexChecks(check, client, bridge) {
  const indexFile = path.join(NOTES_DIR, "INDICE.md");
  const readIndex = () => {
    try { return fs.readFileSync(indexFile, "utf8"); } catch { return ""; }
  };
  const initial = readIndex();
  check("indice: existe junto a las notas y trae la cabecera legible",
    initial.includes("# Índice de notas del teléfono") &&
    initial.includes("pídele a un agente que lea el archivo indicado"), `bytes=${initial.length}`);

  const created = await client.postNote({
    id: "indice-id_01", title: "Nota para el índice", body: "cuerpo",
    profile: "writer", type: "reunion", status: "borrador",
  });
  const file = client.remember(created.json?.file);
  const afterCreate = readIndex();
  check("indice: tras guardar una nota incluye su titulo y su nombre de archivo",
    created.status === 200 && Boolean(file) && afterCreate.includes("Nota para el índice") &&
    afterCreate.includes(`\`${file}\``), `status=${created.status} file=${file}`);
  const line = afterCreate.split("\n").find((entry) => entry.includes(`\`${file}\``)) || "";
  check("indice: la linea usa el formato fecha · titulo · perfil/tipo · estado · archivo",
    /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Nota para el índice · writer\/reunion · borrador · `[^`]+\.md`$/.test(line),
    line.slice(0, 100));

  await sleep(10);
  const updated = await client.postNote({
    id: "indice-id_01", title: "Nota para el índice v2", body: "cuerpo dos",
    profile: "writer", type: "reunion", status: "revisado",
  });
  const afterUpdate = readIndex();
  const linesForFile = afterUpdate.split("\n").filter((entry) => entry.includes(`\`${file}\``));
  check("indice: se rehace al reenviar el mismo id (titulo nuevo, una sola linea)",
    updated.status === 200 && updated.json?.updated === true && updated.json?.file === file &&
    afterUpdate.includes("Nota para el índice v2") &&
    !afterUpdate.includes("Nota para el índice · writer/reunion · borrador") &&
    linesForFile.length === 1, `status=${updated.status} lineas=${linesForFile.length}`);

  const listed = await client.getNotes();
  const listedFiles = Array.isArray(listed.json?.notes) ? listed.json.notes.map((entry) => entry.file) : [];
  check("indice: INDICE.md no se cuenta como nota en GET /dsh-companion/notes",
    listed.status === 200 && listedFiles.includes(file) && !listedFiles.includes("INDICE.md"),
    `status=${listed.status} n=${listedFiles.length}`);

  // Poda real: al borrar el .md, la poda de la bandeja quita su linea huerfana y
  // el indice se rehace sin la nota.
  const doomed = await client.postNote({ id: "indice-poda_01", title: "Nota que sera podada", body: "x" });
  const doomedFile = client.remember(doomed.json?.file);
  check("indice: lista la nota antes de la poda", readIndex().includes(`\`${doomedFile}\``), `file=${doomedFile}`);
  fs.unlinkSync(client.notePath(doomedFile));
  const sync = await client.syncChat("Poda del índice");
  const afterPrune = readIndex();
  check("indice: tras la poda de la bandeja ya no lista la nota podada",
    sync.status === 200 && !afterPrune.includes(`\`${doomedFile}\``) && !afterPrune.includes("Nota que sera podada"),
    `status=${sync.status} file=${doomedFile}`);

  // Linea corrupta en la bandeja: se omite sin romper la regeneracion.
  fs.appendFileSync(INBOX, '{"file":"roto-sin-comillas.md"\n', "utf8");
  const afterCorrupt = await client.postNote({ title: "Nota tras linea corrupta", body: "x" });
  client.remember(afterCorrupt.json?.file);
  const corruptIndex = readIndex();
  check("indice: una linea corrupta de la bandeja se omite sin romper el indice",
    afterCorrupt.status === 200 && corruptIndex.includes("Nota tras linea corrupta") &&
    !corruptIndex.includes("roto-sin-comillas"), `status=${afterCorrupt.status}`);

  // Arranque: con la carpeta de notas existente, importar el modulo rehace el
  // indice aunque el archivo se haya borrado a mano.
  fs.rmSync(indexFile, { force: true });
  const restart = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('./src/notes-store.mjs');"],
    { cwd: REPO_ROOT, env: bridge.env, encoding: "utf8", timeout: 30_000, windowsHide: true }
  );
  const afterRestart = readIndex();
  check("indice: se rehace al arrancar el puente si la carpeta de notas existe",
    restart.status === 0 && afterRestart.includes("Nota tras linea corrupta") &&
    afterRestart.includes("# Índice de notas del teléfono"),
    `exit=${restart.status} bytes=${afterRestart.length} err=${String(restart.stderr || "").trim().slice(0, 100)}`);
}

/**
 * Codificacion (mojibake): un cliente o el portapapeles puede mandar UTF-8 ya leido como Latin-1.
 * Literales escapados (`\u00C3`): audit-repo.mjs marca el mojibake en crudo. Vive aqui por el tope de 400 lineas.
 */
const [MOJI_TITLE, MOJI_BODY, CLEAN_TITLE, CLEAN_BODY, DOUBLE_MOJI] = ["r\u00C3\u00A1pido", "\u00C2\u00BFse\u00C3\u00B1or?", "r\u00E1pido", "\u00BFse\u00F1or?", "\u00C3\u0192\u00C2\u00A1"];

export async function runEncodingChecks(check, client, bridge) {
  const title = repairMojibake(MOJI_TITLE); const body = repairMojibake(MOJI_BODY);
  check("codificacion: mojibake de title/body se repara (repaired)", title.text === CLEAN_TITLE && title.repaired && title.unambiguous && body.text === CLEAN_BODY && body.repaired, `title=${title.text} body=${body.text}`);
  const clean = repairMojibake(CLEAN_TITLE); const twice = repairMojibake(title.text);
  check("codificacion: texto correcto intacto y sin doble reparacion", clean.text === CLEAN_TITLE && !clean.repaired && clean.unambiguous && twice.text === CLEAN_TITLE && !twice.repaired);
  const ambiguous = repairMojibake(DOUBLE_MOJI);
  check("codificacion: texto ambiguo (doble codificado) no se toca", ambiguous.text === DOUBLE_MOJI && !ambiguous.repaired && !ambiguous.unambiguous);
  const filesBefore = fs.readdirSync(NOTES_DIR).length; const bad = await client.postNote({ title: `${MOJI_TITLE}\u00A9`, body: "cuerpo" });
  check("codificacion: patron irreparable responde 400 sin escribir archivo", bad.status === 400 && String(bad.body).includes("texto con codificación inválida") && fs.readdirSync(NOTES_DIR).length === filesBefore, `status=${bad.status}`);
  const fixed = await client.postNote({ title: MOJI_TITLE, body: MOJI_BODY, project: MOJI_TITLE, subject: MOJI_BODY, tags: [MOJI_TITLE] });
  const file = client.remember(fixed.json?.file); const { front, markdown } = client.splitNote(client.noteText(file)); await sleep(50);
  check("codificacion: POST reparado guarda front matter, cuerpo, bandeja y log correctos",
    fixed.status === 200 && front.includes('title: "rápido"') && front.includes('project: "rápido"') &&
    front.includes('subject: "¿señor?"') && front.includes('tags: ["rápido"]') && markdown.includes("¿señor?") &&
    client.inboxRecordFor(file)?.title === CLEAN_TITLE && bridge.output().includes("texto reparado de codificación"), `status=${fixed.status} file=${file}`);
  const intact = await client.postNote({ title: CLEAN_TITLE, body: CLEAN_BODY }); const intactFile = client.remember(intact.json?.file);
  check("codificacion: POST con texto correcto se guarda igual", intact.status === 200 && client.noteText(intactFile).includes('title: "rápido"') && client.noteText(intactFile).includes("¿señor?"));
  const amb = await client.postNote({ title: DOUBLE_MOJI, body: "cuerpo" }); const ambFile = client.remember(amb.json?.file);
  check("codificacion: POST ambiguo se acepta intacto (200)", amb.status === 200 && client.noteText(ambFile).includes(DOUBLE_MOJI), `status=${amb.status}`);
}

