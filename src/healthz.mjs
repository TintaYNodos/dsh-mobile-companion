/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import { config } from "./config.mjs";
import { apkSha256 } from "./static.mjs";
import { contractSnapshot } from "./dsh-contract.mjs";
import { probeDshIdentity, resolveTargetPort } from "./network.mjs";
import { sendJson } from "./http.mjs";
import { consumeAllowance } from "./ratelimit.mjs";

/**
 * /healthz (5.2.0): salud real del puente Y de DeepSeek Harness.
 *
 * Antes el healthcheck de Docker preguntaba a /dsh-companion/status, que responde
 * 200 mientras el puente esta arriba aunque Harness este caido: un contenedor
 * "sano" con el telefono incomunicado. Aqui se distinguen los tres estados:
 *
 *   - `ok`       (HTTP 200): puente arriba y Harness confirmado por identidad.
 *   - `degraded` (HTTP 200): puente y Harness arriba, pero alguna pieza del
 *                            contrato interno de Harness cambio (funcion degradada).
 *   - `down`     (HTTP 503): el puente responde pero Harness no confirma.
 *
 * La ruta no exige credenciales (la usa el healthcheck del contenedor en
 * loopback) y solo devuelve versiones, puertos privados y estado del contrato:
 * nunca claves, cookies ni secretos.
 */

const IDENTITY_TIMEOUT_MS = 900;

/** Funcion pura: decide el estado y el codigo HTTP a partir de las sondas. */
export function computeHealth({ bridge, harness, contract, apk, now = Date.now() }) {
  const coreOk = Boolean(harness?.ok);
  let status = "ok";
  if (!coreOk) status = "down";
  else if (!contract || !contract.ok || (contract.degraded && contract.degraded.length > 0) ||
           (contract.unknown && contract.unknown.length > 0)) {
    status = "degraded";
  }
  return {
    service: "dsh-companion",
    version: config.version,
    apkVersion: config.apkVersion || config.version,
    apkVersionCode: config.apkVersionCode || 0,
    apkSha256: apk?.sha256 || "",
    status,
    ok: status === "ok",
    time: now,
    bridge: {
      ok: true,
      listenPort: bridge?.listenPort ?? config.listenPort,
      panelPort: bridge?.panelPort ?? config.panelPort,
      bindHost: bridge?.bindHost || "",
      uptimeSeconds: Math.max(0, Math.round(process.uptime())),
    },
    harness: {
      ok: coreOk,
      host: config.targetHost,
      port: harness?.port ?? null,
      identity: harness?.identity || "none",
      httpStatus: harness?.httpStatus ?? 0,
    },
    contract: contract || null,
  };
}

const probeHarness = async () => {
  let port = config.targetPort;
  try {
    port = await resolveTargetPort();
  } catch {}
  try {
    const result = await probeDshIdentity(port, config.targetHost, IDENTITY_TIMEOUT_MS);
    return {
      ok: result.identity === "confirmed",
      port,
      identity: result.identity,
      httpStatus: result.status || 0,
    };
  } catch {
    return { ok: false, port, identity: "none", httpStatus: 0 };
  }
};

export async function handleHealthz(req, res, context = {}) {
  const remoteAddress = String(context.remoteAddress || "");
  if (!consumeAllowance(`healthz:${remoteAddress}`, { capacity: 120, refillPerSecond: 2 })) {
    sendJson(res, 429, { error: "Demasiadas consultas" });
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Metodo no permitido" });
    return;
  }

  const harness = await probeHarness();
  const health = computeHealth({
    bridge: {
      listenPort: config.listenPort,
      panelPort: config.panelPort,
      bindHost: String(context.bindHost || ""),
    },
    harness,
    contract: contractSnapshot(),
    apk: { sha256: apkSha256() },
  });

  sendJson(res, health.status === "down" ? 503 : 200, health, {
    "Cache-Control": "no-store",
    ...(health.status === "down" ? { "Retry-After": "10" } : {}),
  });
}
