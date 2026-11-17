/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { config } from "./config.mjs";
import { log, warn } from "./log.mjs";
import { createSessionCookie, getAuthority } from "./crypto.mjs";
import { resolveTargetPort } from "./network.mjs";

/**
 * Contrato con DeepSeek Harness (5.2.0).
 *
 * El puente depende de piezas internas de Harness que no forman parte de una API
 * publica: el nombre y formato de la cookie `dsh-auth-*`, el marcador
 * `__DSH_BOOT__` del HTML, el evento `turn/end` del registro de sesiones, el
 * atributo `data-approval-key` del cliente web y el descubrimiento del puerto del
 * backend. Si una de esas piezas cambia, antes se traducia en fallos silenciosos
 * (avisos que no llegan, aprobaciones que no se detectan) o en un puente muerto.
 *
 * Aqui se comprueban al arrancar, se expone su estado en `/status` y en
 * `/healthz`, y cada pieza que falla DEGRADA solo la funcion afectada con un
 * aviso claro en el log. Nada de morir ni de fingir que todo esta bien.
 */

const AUTH_MARKER = "dsh web authentication required";
const BOOT_MARKER = "__DSH_BOOT__";
const APPROVAL_ATTR = "data-approval-key";
const APPROVAL_PLUGIN = "dsh-client-ui-approval";

const HTTP_TIMEOUT_MS = 1200;
const HTML_LIMIT_BYTES = 262_144;
const ASSET_LIMIT_BYTES = 6 * 1024 * 1024;
const SESSION_TAIL_BYTES = 256 * 1024;
const SESSION_FILES = 3;
const CONTRACT_INTERVAL_MS = 10 * 60 * 1000;
const CONTRACT_START_DELAY_MS = 1500;
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const CHECKS = Object.freeze([
  { id: "port", title: "Descubrimiento del puerto de Harness", critical: true },
  { id: "auth-cookie", title: "Cookie dsh-auth-* aceptada por Harness", critical: true },
  { id: "boot-marker", title: "Marcador __DSH_BOOT__ en el HTML servido", critical: true },
  { id: "turn/end", title: "Registro de sesiones con eventos turn/end", critical: false },
  { id: "approval-key", title: "Atributo data-approval-key en el cliente de Harness", critical: false },
]);

const titleOf = (id) => CHECKS.find((check) => check.id === id)?.title || id;
const criticalOf = (id) => Boolean(CHECKS.find((check) => check.id === id)?.critical);
const entry = (id, status, detail) => ({ id, title: titleOf(id), status, detail, critical: criticalOf(id) });

const safeText = (error) => String(error?.message || error || "error desconocido").slice(0, 200);

/** GET acotado en bytes y tiempo: nunca deja que un asset enorme bloquee el arranque. */
const httpGet = (port, pathname, headers, options = {}) =>
  new Promise((resolve) => {
    const limit = options.maxBytes || HTML_LIMIT_BYTES;
    const timeout = options.timeoutMs || HTTP_TIMEOUT_MS;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = http.request(
      { hostname: config.targetHost, port, path: pathname, method: "GET", headers, timeout, agent: false },
      (response) => {
        const chunks = [];
        let size = 0;
        let truncated = false;
        response.on("data", (chunk) => {
          if (truncated) return;
          size += chunk.length;
          if (size > limit) {
            truncated = true;
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - limit))));
            request.destroy();
            finish({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8"), truncated: true });
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          finish({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8"), truncated })
        );
        response.on("error", () => finish({ status: 0, body: "", truncated }));
      }
    );
    request.on("timeout", () => { request.destroy(); finish({ status: 0, body: "", truncated: false }); });
    request.on("error", () => finish({ status: 0, body: "", truncated: false }));
    request.end();
  });

/** Analiza varias piezas del contrato con una sola descarga del HTML de Harness. */
const probeServedPage = async (port) => {
  const authority = getAuthority(config.targetHost, port);
  const checks = [];
  let cookie = "";
  try {
    cookie = createSessionCookie(authority);
    if (!/^dsh-auth-[A-Za-z0-9_-]{43}=v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cookie)) {
      checks.push(entry("auth-cookie", "degraded", "el nombre/formato interno de la cookie no es el esperado por Harness"));
      return { checks, page: null, authority, cookie: "", htmlChecksDone: false };
    }
  } catch (error) {
    checks.push(entry("auth-cookie", "degraded", `no se pudo firmar la cookie de sesion: ${safeText(error)}`));
    return { checks, page: null, authority, cookie: "", htmlChecksDone: false };
  }

  const page = await httpGet(port, "/", { host: authority, cookie, accept: "text/html" }, { maxBytes: HTML_LIMIT_BYTES });
  if (page.status === 0) {
    checks.push(entry("auth-cookie", "degraded", `Harness no respondio en 127.0.0.1:${port}`));
    checks.push(entry("boot-marker", "degraded", "sin HTML de Harness no se puede comprobar el marcador de arranque"));
    return { checks, page, authority, cookie, htmlChecksDone: false };
  }

  const rejected = page.status === 401 || page.status === 403 || page.body.includes(AUTH_MARKER);
  checks.push(
    rejected
      ? entry("auth-cookie", "degraded", `Harness rechazo la cookie firmada (HTTP ${page.status}); la sesion inyectada ya no vale`)
      : entry("auth-cookie", "ok", `cookie dsh-auth-* aceptada (HTTP ${page.status})`)
  );
  checks.push(
    page.body.includes(BOOT_MARKER)
      ? entry("boot-marker", "ok", `marcador ${BOOT_MARKER} presente en el HTML`)
      : entry("boot-marker", "degraded", `el HTML de Harness no contiene ${BOOT_MARKER}`)
  );
  return { checks, page, authority, cookie, htmlChecksDone: true };
};

/** Busca el atributo de aprobaciones en el HTML o en el modulo que Harness sirve. */
const probeApprovalAttribute = async ({ page, authority, cookie }) => {
  if (!page || page.status === 0) {
    return entry("approval-key", "degraded", "sin HTML de Harness no se puede comprobar el atributo de aprobaciones");
  }
  if (page.body.includes(APPROVAL_ATTR)) {
    return entry("approval-key", "ok", "atributo presente en el HTML servido");
  }

  const match = page.body.match(/["']([^"']*dsh-client-ui-approval\/client\.js[^"']*)["']/);
  if (!match) {
    return entry(
      "approval-key",
      "degraded",
      "Harness no referencia el modulo de aprobaciones; la deteccion de aprobaciones en el telefono puede degradarse"
    );
  }

  let target;
  try {
    target = new URL(match[1].replace(/&amp;/g, "&"), `http://${authority}/`);
  } catch {
    return entry("approval-key", "degraded", "la URL del modulo de aprobaciones de Harness no es valida");
  }

  const asset = await httpGet(
    target.port ? Number(target.port) : undefined,
    `${target.pathname}${target.search}`,
    { host: authority, cookie, accept: "*/*" },
    { maxBytes: ASSET_LIMIT_BYTES, timeoutMs: 4000 }
  );
  if (asset.status === 0) {
    return entry("approval-key", "unknown", "no se pudo descargar el modulo de aprobaciones para comprobarlo");
  }
  if (asset.body.includes(APPROVAL_ATTR)) {
    return entry("approval-key", "ok", `modulo ${APPROVAL_PLUGIN} servido con ${APPROVAL_ATTR}`);
  }
  return entry(
    "approval-key",
    "degraded",
    `el modulo ${APPROVAL_PLUGIN} ya no contiene ${APPROVAL_ATTR}; la deteccion de aprobaciones en el telefono puede degradarse`
  );
};

/** Lee los frames zstd del final de los registros de sesion y resume sus eventos. */
const probeSessionEvents = () => {
  const sessionsRoot = path.join(config.dshHome, "sessions");
  let spaces = [];
  try {
    spaces = fs.readdirSync(sessionsRoot, { withFileTypes: true }).filter((item) => item.isDirectory());
  } catch {
    return entry("turn/end", "unknown", "aun no hay sesiones de Harness; los avisos por turno se comprobaran cuando existan");
  }

  const files = [];
  for (const space of spaces) {
    const spaceDir = path.join(sessionsRoot, space.name);
    let sessions = [];
    try {
      sessions = fs.readdirSync(spaceDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const file = path.join(spaceDir, session.name, "session.v4.jsonl.zstd");
      try {
        const stat = fs.statSync(file);
        files.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {}
    }
  }
  if (files.length === 0) {
    return entry("turn/end", "unknown", "aun no hay sesiones de Harness; los avisos por turno se comprobaran cuando existan");
  }
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);

  let frames = 0;
  let turnEnds = 0;
  let turnStarts = 0;
  let records = 0;
  for (const item of files.slice(0, SESSION_FILES)) {
    let buffer;
    try {
      const start = Math.max(0, item.size - SESSION_TAIL_BYTES);
      const handle = fs.openSync(item.file, "r");
      const length = item.size - start;
      buffer = Buffer.alloc(length);
      fs.readSync(handle, buffer, 0, length, start);
      fs.closeSync(handle);
    } catch {
      continue;
    }
    const offsets = [];
    for (let index = buffer.indexOf(FRAME_MAGIC); index >= 0; index = buffer.indexOf(FRAME_MAGIC, index + 1)) {
      offsets.push(index);
    }
    for (let from = 0; from < offsets.length && from < 24; from += 1) {
      for (let to = from + 1; to <= offsets.length; to += 1) {
        const end = to < offsets.length ? offsets[to] : buffer.length;
        let text;
        try {
          text = zlib.zstdDecompressSync(buffer.subarray(offsets[from], end)).toString("utf8");
        } catch {
          continue;
        }
        frames += 1;
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const record = JSON.parse(line);
            records += 1;
            if (record?.type === "turn/end") turnEnds += 1;
            else if (record?.type === "turn/start") turnStarts += 1;
          } catch {}
        }
        from = to - 1;
        break;
      }
    }
  }

  if (frames === 0) {
    return entry(
      "turn/end",
      "degraded",
      "los registros de sesion de Harness no se pudieron descomprimir; los avisos por turno pueden no funcionar"
    );
  }
  // Un turno en curso o abortado puede dejar turn/start sin turn/end: eso NO es
  // un cambio de formato y no debe degradar el contrato (falsos positivos). Si
  // los frames se descomprimen y los registros son JSON, el formato esta bien.
  if (records === 0) {
    return entry(
      "turn/end",
      "unknown",
      `${frames} frame(s) sin registros JSON; los avisos por turno se comprobaran en la proxima ventana`
    );
  }
  const detail = `${frames} frame(s), ${records} evento(s), ${turnStarts} turn/start, ${turnEnds} turn/end`;
  return entry("turn/end", "ok", detail);
};

/** Comprueba el puerto efectivo de Harness y si responde. */
const probePort = async () => {
  let port = config.targetPort;
  try {
    port = await resolveTargetPort();
  } catch {}
  const page = await httpGet(port, "/", { accept: "text/html" }, { maxBytes: 8192, timeoutMs: 900 });
  if (page.status === 0) {
    return { entry: entry("port", "degraded", `DeepSeek Harness no responde en 127.0.0.1:${port}`), port };
  }
  return { entry: entry("port", "ok", `Harness responde en 127.0.0.1:${port} (HTTP ${page.status})`), port };
};

let latest = {
  checkedAt: 0,
  running: false,
  ok: false,
  degraded: [],
  unknown: [],
  checks: CHECKS.map((check) => entry(check.id, "unknown", "sin comprobar todavia")),
};
let watchTimer = null;
let watchStarting = null;
let previousSignature = "";

const summarize = (checks) => {
  const critical = checks.filter((check) => check.critical);
  return {
    ok: critical.every((check) => check.status === "ok"),
    degraded: checks.filter((check) => check.status === "degraded").map((check) => check.id),
    unknown: checks.filter((check) => check.status === "unknown").map((check) => check.id),
  };
};

/** Evaluacion completa; exportada para las pruebas y para /healthz. */
export async function evaluateContract() {
  const startedAt = Date.now();
  const portResult = await probePort();
  const checks = [portResult.entry];
  const served = await probeServedPage(portResult.port);
  checks.push(...served.checks);
  checks.push(await probeApprovalAttribute(served));
  checks.push(probeSessionEvents());
  const order = new Map(CHECKS.map((check, index) => [check.id, index]));
  checks.sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99));
  const summary = summarize(checks);
  latest = { checkedAt: Date.now(), running: false, ...summary, checks, durationMs: Date.now() - startedAt };
  return latest;
}

const announce = (result) => {
  const signature = result.checks.map((check) => `${check.id}:${check.status}`).join("|");
  if (signature === previousSignature) return;
  const first = previousSignature === "";
  previousSignature = signature;

  const problems = result.checks.filter((check) => check.status === "degraded");
  if (problems.length > 0) {
    for (const check of problems) warn("contract", `${check.title}: ${check.detail}`);
    const affected = problems.map((check) => check.id).join(", ");
    warn(
      "contract",
      `Contrato de Harness degradado (${affected}). El puente sigue en pie y solo se degradan las funciones afectadas; revisa /healthz.`
    );
    return;
  }
  if (!first && result.ok) log("contract", "Contrato de Harness recuperado: todas las piezas dependidas responden");
};

/** Arranca la vigilancia periodica. Idempotente y sin bloquear el arranque. */
export function startContractWatch() {
  if (watchTimer || watchStarting) return;
  const run = () => {
    if (watchStarting) return;
    watchStarting = evaluateContract()
      .then((result) => announce(result))
      .catch((error) => warn("contract", `No se pudo comprobar el contrato de Harness: ${safeText(error)}`))
      .finally(() => {
        watchStarting = null;
      });
  };
  const kickoff = setTimeout(run, CONTRACT_START_DELAY_MS);
  kickoff.unref?.();
  watchTimer = setInterval(run, CONTRACT_INTERVAL_MS);
  watchTimer.unref?.();
}

/** Estado actual del contrato, apto para /status y /healthz (sin secretos). */
export const contractSnapshot = () => ({
  checkedAt: latest.checkedAt ? new Date(latest.checkedAt).toISOString() : null,
  running: Boolean(watchStarting) || latest.running,
  ok: latest.ok,
  degraded: [...latest.degraded],
  unknown: [...latest.unknown],
  checks: latest.checks.map((check) => ({
    id: check.id,
    title: check.title,
    status: check.status,
    detail: check.detail,
    critical: check.critical,
  })),
});
