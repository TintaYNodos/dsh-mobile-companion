/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Regresiones de corrupcion y concurrencia del almacen de notas (H-18/H-19/H-20).
 *
 * Se separa de notes-harness.mjs para que ninguna suite pase del tope de 400
 * lineas. Lo importa test/verify_notes.mjs y escribe SOLO en el synced_chats
 * temporal del puente aislado (rutas vivas de notes-harness.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { REPO_ROOT } from "./ci/start-bridge.mjs";
import * as harness from "./notes-harness.mjs";

const notesDir = () => harness.NOTES_DIR;
const inboxPath = () => harness.INBOX;
const idsPath = () => harness.IDS;

/**
 * H-18/H-19 deterministico: simula los dos cortes posibles sin matar procesos.
 *  - indice con id -> archivo inexistente (corte entre ids.json y contenido);
 *  - .md de 0 bytes (reserva de una version anterior) + indice que lo apunta.
 * Reenviar el mismo id no debe duplicar ni dejar ceros.
 */
export async function runStoreCrashChecks(check, client) {
  const orphanId = "caos-indice_01";
  const orphanFile = "2026-01-01-000000-reservada.md";
  fs.writeFileSync(idsPath(), `${JSON.stringify({ [orphanId]: orphanFile }, null, 2)}\n`, "utf8");
  const orphan = await client.postNote({ id: orphanId, title: "Reenvio tras corte de indice", body: "cuerpo" });
  const orphanOut = client.remember(orphan.json?.file);
  const zeroId = "caos-cero_02";
  const zeroFile = "2026-01-01-000000-cero.md";
  fs.writeFileSync(path.join(notesDir(), zeroFile), "", "utf8");
  fs.writeFileSync(
    idsPath(),
    `${JSON.stringify({ [orphanId]: orphanOut || orphanFile, [zeroId]: zeroFile }, null, 2)}\n`,
    "utf8"
  );
  const zero = await client.postNote({ id: zeroId, title: "Reenvio tras archivo de 0 bytes", body: "cuerpo" });
  const zeroOut = client.remember(zero.json?.file);
  const files = fs.readdirSync(notesDir());
  const empty = files.filter((name) => name.endsWith(".md") && fs.statSync(path.join(notesDir(), name)).size === 0);
  check("H-19: id con entrada de indice sin archivo se recrea (200, un solo .md)",
    orphan.status === 200 && Boolean(orphanOut) && fs.existsSync(path.join(notesDir(), orphanOut)) &&
      files.filter((name) => name.includes("reenvio-tras-corte-de-indice")).length === 1,
    `status=${orphan.status} file=${orphanOut}`);
  check("H-18: el .md de 0 bytes se reemplaza con contenido completo (sin quedar ceros)",
    zero.status === 200 && Boolean(zeroOut) && fs.statSync(path.join(notesDir(), zeroOut)).size > 0 &&
      empty.length === 0,
    `status=${zero.status} ceros=${empty.length}`);
}

/** Script hijo que escribe una nota (y avisa READY justo antes de empezar). */
const CHAOS_WRITER = `
const { saveNote } = await import("./src/notes-store.mjs");
console.log("READY");
await saveNote(JSON.parse(process.env.CHAOS_NOTE));
console.log("DONE");
`;

/** Script hijo que "reinicia": importar notes-store corre el saneado, luego reenvia. */
const CHAOS_RECOVER = `
const { saveNote } = await import("./src/notes-store.mjs");
console.log(JSON.stringify(await saveNote(JSON.parse(process.env.CHAOS_NOTE))));
`;

const runChild = (code, env) =>
  spawn(process.execPath, ["--input-type=module", "-e", code], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

/**
 * Caos H-18/H-19: 20 rondas de SIGKILL a mitad de POST del mismo id. Tras cada
 * corte se "reinicia" (proceso nuevo: el saneado de arranque corre al importar
 * notes-store) y se reenvia el MISMO id. Al final: 0 .md de 0 bytes, 0 .tmp o
 * .reserve huerfanos y un unico archivo para el id (sin duplicados).
 */
export async function runChaosKillChecks(check, bridge) {
  const noteId = "caos-sigkill_01";
  const baseNote = { id: noteId, title: "Caos SIGKILL", body: "x".repeat(20_000) };
  const rounds = 20;
  let recovered = 0;
  for (let round = 0; round < rounds; round += 1) {
    const writer = runChild(CHAOS_WRITER, {
      ...bridge.env,
      CHAOS_NOTE: JSON.stringify({ ...baseNote, title: `Caos SIGKILL ${round}` }),
    });
    await new Promise((resolve) => {
      let killed = false;
      const finish = () => {
        if (killed) return;
        killed = true;
        resolve();
      };
      writer.stdout.on("data", (chunk) => {
        if (killed || !chunk.toString("utf8").includes("READY")) return;
        setTimeout(() => {
          try { writer.kill("SIGKILL"); } catch { /* ya murio */ }
        }, Math.floor(Math.random() * 15));
      });
      writer.on("exit", finish);
      setTimeout(() => { try { writer.kill("SIGKILL"); } catch {} finish(); }, 5000).unref();
    });
    const recovery = spawnSync(process.execPath, ["--input-type=module", "-e", CHAOS_RECOVER], {
      cwd: REPO_ROOT,
      env: { ...bridge.env, CHAOS_NOTE: JSON.stringify(baseNote) },
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    });
    if (recovery.status === 0) recovered += 1;
  }
  const files = fs.readdirSync(notesDir());
  const empty = files.filter((name) => name.endsWith(".md") && fs.statSync(path.join(notesDir(), name)).size === 0);
  const temp = files.filter((name) => name.includes(".tmp") || name.endsWith(".reserve"));
  const matches = files.filter((name) => name.includes("caos-sigkill"));
  check("caos: 20 rondas de SIGKILL + reinicio completadas", recovered === rounds, `reinicios=${recovered}/${rounds}`);
  check("caos: 0 .md de 0 bytes tras los 20 cortes", empty.length === 0, empty.slice(0, 3).join(",") || "ninguno");
  check("caos: 0 .tmp/.reserve huerfanos", temp.length === 0, temp.slice(0, 3).join(",") || "ninguno");
  check("caos: reenviar el mismo id deja 1 archivo (0 duplicados)", matches.length === 1, matches.join(","));
}

/**
 * H-20: 100 POST concurrentes sobre una bandeja sembrada con 505 lineas y 6
 * rondas de poda concurrente (notas + sync de chat a la vez). Cero EPERM, cero
 * .tmp y bandeja estable (<=500).
 */
export async function runConcurrencyChecks(check, client, bridge, seedFile) {
  const seedInbox = () => {
    const seeded = Array.from({ length: 505 }, (_, index) =>
      JSON.stringify({ file: seedFile, id: `conc-${index}`, title: `conc ${index}` }));
    fs.writeFileSync(inboxPath(), `${seeded.join("\n")}\n`, "utf8");
  };
  const tempFiles = () =>
    fs.readdirSync(notesDir()).filter((name) => name.includes(".tmp") || name.endsWith(".reserve"));
  seedInbox();
  const outputBefore = bridge.output().length;
  const responses = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      client.postNote({ id: `conc-id-${index}`, title: `Concurrente ${index}`, body: "cuerpo concurrente" }))
  );
  for (const res of responses) client.remember(res.json?.file);
  const okCount = responses.filter((res) => res.status === 200).length;
  const lines = fs.readFileSync(inboxPath(), "utf8").split("\n").filter((line) => line.trim() !== "");
  const newOutput = bridge.output().slice(outputBefore);
  check("H-20: 100 POST concurrentes responden 200", okCount === 100, `ok=${okCount}/100`);
  check("H-20: 100 POST concurrentes sin EPERM y sin .tmp",
    !/EPERM/.test(newOutput) && tempFiles().length === 0,
    `eperm=${/EPERM/.test(newOutput)} tmp=${tempFiles().length}`);
  check("H-20: la bandeja queda estable (<=500 lineas) tras la rafaga",
    lines.length <= 500, `lineas=${lines.length}`);
  let roundsOk = 0;
  for (let round = 0; round < 6; round += 1) {
    seedInbox();
    const batch = [
      ...Array.from({ length: 20 }, (_, index) => client.postNote({ title: `Poda ${round}-${index}`, body: "x" })),
      client.syncChat(`Poda concurrente ${round}`),
    ];
    const results = await Promise.all(batch);
    for (const res of results) client.remember(res.json?.file);
    if (results.every((res) => res.status === 200) && tempFiles().length === 0) roundsOk += 1;
  }
  check("H-20: 6 rondas de poda concurrente sin EPERM ni .tmp",
    roundsOk === 6 && !/EPERM/.test(bridge.output().slice(outputBefore)),
    `rondas=${roundsOk}/6`);
}
