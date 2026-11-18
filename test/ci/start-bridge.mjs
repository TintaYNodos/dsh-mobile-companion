/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Crea en el directorio temporal del sistema:
 *   - un HOME temporal (para que las pruebas que usan os.homedir() no lean ni
 *     escriban %USERPROFILE%\.dsh / $HOME/.dsh);
 *   - un DSH_HOME temporal con un .credentials.yaml mínimo válido para
 *     src/crypto.mjs (se comprueba antes de arrancar el puente);
 *   - un synced_chats/ temporal (DSH_SYNC_DIR), un bridge.log temporal
 *     (DSH_LOG_FILE) y una bandera de parada temporal (DSH_STOP_FLAG): H-17, la
 *     suite NUNCA escribe ni rota los del repositorio/instalación real;
 *   - un backend DSH mínimo de pruebas (ver stub-dsh-backend.mjs).
 *
 * Después arranca bridge.mjs enlazado a 127.0.0.1 en puertos libres de
 * loopback (nunca 57420/57421 ni los candidatos de backend reales), espera a
 * que /dsh-companion/status responda y expone `stop()`, que envía SIGTERM y
 * limpia todo.
 *
 *   node test/ci/start-bridge.mjs            # uso manual: arranca y espera
 *   import { startBridge } from "./start-bridge.mjs";
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startStubDsh } from "./stub-dsh-backend.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "..", "..");

/** Puertos del puente/panel reales y candidatos de backend: jamás se usan. */
const RESERVED_PORTS = new Set([57420, 57421, 52710, 52711, 52712, 59189]);
const MAX_BRIDGE_OUTPUT = 64 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pide al sistema operativo un puerto libre de loopback. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/** Reserva `count` puertos distintos y fuera de la lista vetada. */
const pickPorts = async (count) => {
  const ports = new Set();
  while (ports.size < count) {
    const port = await freePort();
    if (!RESERVED_PORTS.has(port)) ports.add(port);
  }
  return [...ports];
};

const getJson = (port, pathname, timeoutMs = 1500) =>
  new Promise((resolve) => {
    const request = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method: "GET", timeout: timeoutMs, agent: false },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    request.on("timeout", () => {
      request.destroy();
      resolve({ status: 0, body: "" });
    });
    request.on("error", () => resolve({ status: 0, body: "" }));
    request.end();
  });

/** Mantiene vivo el ping del panel (solo Windows abre ventanas del panel). */
export async function pingPanel(panelPort) {
  return getJson(panelPort, "/pair", 1000);
}

/** Id de la conversacion sembrada en el synced_chats temporal (verify_bridge la lista). */
export const SEED_CHAT_ID = "sync_ci_seed_0001";

/**
 * Siembra una conversacion valida en el synced_chats temporal: verify_bridge
 * comprueba /dsh-companion/chats y /dsh-companion/chat/:id, y antes dependia de
 * los archivos que hubiera en el synced_chats del repositorio del usuario.
 */
const seedChats = (syncDir) => {
  fs.mkdirSync(syncDir, { recursive: true });
  const now = Date.now();
  const syncedAt = new Date(now).toISOString();
  const messages = [{ role: "user", content: "Hola desde el doble de CI", timestamp: now }];
  const document = {
    id: SEED_CHAT_ID,
    sessionTitle: "Chat de prueba CI",
    syncedAt,
    syncedTimestamp: now,
    messageCount: messages.length,
    messages,
  };
  fs.writeFileSync(path.join(syncDir, `${SEED_CHAT_ID}.json`), JSON.stringify(document, null, 2), "utf8");
  fs.writeFileSync(
    path.join(syncDir, `${SEED_CHAT_ID}.md`),
    `# Sesion sincronizada: Chat de prueba CI\n\n- Fecha: ${syncedAt}\n- Mensajes: 1\n\n---\n\n` +
      "### Usuario\n\nHola desde el doble de CI\n\n---\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(syncDir, "index.jsonl"),
    `${JSON.stringify({
      id: SEED_CHAT_ID,
      savedAt: now,
      title: "Chat de prueba CI",
      messageCount: messages.length,
      json: `${SEED_CHAT_ID}.json`,
      markdown: `${SEED_CHAT_ID}.md`,
    })}\n`,
    "utf8"
  );
};

/**
 * Arranca el puente aislado. Devuelve un manejador con puertos, credenciales,
 * entorno para las pruebas y `stop()` idempotente.
 */
export async function startBridge(options = {}) {
  // "env" (por defecto): DSH_ACCESS_KEY en el entorno (rotacion imposible).
  // "file": sin DSH_ACCESS_KEY, el puente genera companion-access-key en el
  // DSH_HOME temporal (rotacion real) — lo usa la regresion de H-01.
  const keyMode = options.accessKeyMode === "file" ? "file" : "env";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-companion-ci-"));
  const home = path.join(root, "home");
  const dshHome = path.join(home, ".dsh");
  fs.mkdirSync(dshHome, { recursive: true });
  // H-17: todo lo que el puente escribe (notas, chats, log, bandera de parada)
  // vive en este arbol temporal, nunca en el repositorio del usuario.
  const syncDir = path.join(root, "synced_chats");
  const logFile = path.join(root, "bridge.log");
  const stopFlag = path.join(root, "companion.stop");
  seedChats(syncDir);

  const [bridgePort, panelPort, stubPort] = await pickPorts(3);
  const accessKey = crypto.randomBytes(24).toString("base64url");
  const panelToken = crypto.randomBytes(24).toString("base64url");
  const browserSecret = crypto.randomBytes(32).toString("base64url");

  const credentialsPath = path.join(dshHome, ".credentials.yaml");
  fs.writeFileSync(
    credentialsPath,
    `client-connection/browser-session:\n  secret: ${browserSecret}\n`,
    { encoding: "utf8", mode: 0o600 }
  );

  const childEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    DSH_HOME: dshHome,
    DSH_BIND_HOST: "127.0.0.1",
    DSH_LISTEN_PORT: String(bridgePort),
    DSH_PANEL_PORT: String(panelPort),
    DSH_TARGET_PORT: String(stubPort),
    DSH_ACCESS_KEY: accessKey,
    DSH_PANEL_TOKEN: panelToken,
    // Vacío a propósito: loadSecret() debe leer el .credentials.yaml temporal.
    DSH_BROWSER_SECRET: "",
    DSH_ACCESS_DISABLE: "0",
    DSH_SYNC_DIR: syncDir,
    DSH_LOG_FILE: logFile,
    DSH_STOP_FLAG: stopFlag,
    // Overrides de la prueba (p. ej. limites de /notes): siempre al final.
    ...(options.env || {}),
  };
  if (keyMode === "file") delete childEnv.DSH_ACCESS_KEY;
  delete childEnv.DSH_COMPANION_TOKEN;
  delete childEnv.DSH_ALLOWED_HOSTS;
  delete childEnv.DSH_ALLOW_CIDR;
  delete childEnv.DSH_VPN_IP;

  const stub = await startStubDsh({ port: stubPort });

  // Comprueba el .credentials.yaml con el mismo parser que usa el puente antes
  // de arrancarlo: si el formato cambia, CI lo dice aquí y no en un 500 mudo.
  const secretProbe = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "const { loadSecret } = await import('./src/crypto.mjs'); console.log('secret-bytes=' + loadSecret().length);",
    ],
    { cwd: REPO_ROOT, env: childEnv, encoding: "utf8", timeout: 20_000, windowsHide: true }
  );
  if (secretProbe.status !== 0 || !String(secretProbe.stdout || "").includes("secret-bytes=32")) {
    await stub.close();
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(
      `El .credentials.yaml temporal no es válido para src/crypto.mjs (exit=${secretProbe.status}): ` +
        `${String(secretProbe.stderr || secretProbe.stdout || "").trim().split(/\r?\n/).slice(-3).join(" | ")}`
    );
  }

  const child = spawn(process.execPath, [path.join(REPO_ROOT, "bridge.mjs")], {
    cwd: REPO_ROOT,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const output = [];
  let outputBytes = 0;
  let exited = false;
  let exitCode = null;
  const collect = (chunk) => {
    if (outputBytes >= MAX_BRIDGE_OUTPUT) return;
    const text = chunk.toString("utf8");
    output.push(text);
    outputBytes += chunk.length;
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("exit", (code) => {
    exited = true;
    exitCode = code;
  });

  const describeOutput = () => output.join("").trim().split(/\r?\n/).slice(-20).join("\n");

  const deadline = Date.now() + 25_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (exited) break;
    const status = await getJson(bridgePort, "/dsh-companion/status", 1000);
    if (status.status === 200 && status.body.includes('"service":"dsh-companion"')) {
      ready = true;
      break;
    }
    await sleep(100);
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (!exited) {
      try {
        child.kill("SIGTERM");
      } catch {
        // El proceso ya no existe: nada que cerrar.
      }
      const closeDeadline = Date.now() + 5000;
      while (!exited && Date.now() < closeDeadline) await sleep(50);
      if (!exited) {
        try {
          child.kill("SIGKILL");
        } catch {
          // Igual que arriba.
        }
        const killDeadline = Date.now() + 2000;
        while (!exited && Date.now() < killDeadline) await sleep(50);
      }
    }
    await stub.close();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
        break;
      } catch {
        await sleep(100);
      }
    }
  };

  if (!ready) {
    await stop();
    throw new Error(
      `El puente no respondió en http://127.0.0.1:${bridgePort}/dsh-companion/status ` +
        `(exit=${exited ? exitCode : "sigue vivo"}).\n${describeOutput() || "(sin salida)"}`
    );
  }

  // En modo archivo la clave efectiva es la que el puente genero en DSH_HOME.
  let resolvedAccessKey = accessKey;
  if (keyMode === "file") {
    try {
      resolvedAccessKey = fs.readFileSync(path.join(dshHome, "companion-access-key"), "utf8").trim();
    } catch {
      resolvedAccessKey = "";
    }
  }

  return {
    root,
    home,
    dshHome,
    syncDir,
    logFile,
    stopFlag,
    accessKey: resolvedAccessKey,
    accessKeyMode: keyMode,
    panelToken,
    browserSecret,
    bridgePort,
    panelPort,
    stubPort,
    env: childEnv,
    output: describeOutput,
    exitCode: () => exitCode,
    waitForExit: async (timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      while (!exited && Date.now() < deadline) await sleep(50);
      return exited ? exitCode : null;
    },
    stop,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const bridge = await startBridge();
  console.log(`[ci] Puente listo en http://127.0.0.1:${bridge.bridgePort}`);
  console.log(`[ci] Panel en http://127.0.0.1:${bridge.panelPort}/pair (DSH_PANEL_TOKEN=${bridge.panelToken})`);
  console.log(`[ci] Backend de pruebas en http://127.0.0.1:${bridge.stubPort}`);
  console.log(`[ci] DSH_HOME temporal: ${bridge.dshHome}`);
  console.log("[ci] Ctrl+C o SIGTERM para cerrar.");
  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    console.log(`[ci] Cerrando por ${signal}`);
    await bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
