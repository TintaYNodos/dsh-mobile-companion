/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (Business Source License 1.1) / Business Source License 1.1.
 * See companion/LICENSE or LICENSE for license terms.
 */

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const positiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const text = (value) => String(value ?? "").trim();

/**
 * P48: DSH_ACCESS_DISABLE solo significa algo con "1" (desactivar) o con
 * "0"/vacio (mantener). Un "true" o un "yes" se interpretaba en silencio como
 * "no desactivar", justo lo contrario de lo que cree quien lo escribe. Se
 * valida al importar este modulo, que en bridge.mjs ocurre antes de
 * server.listen(): un valor invalido detiene el arranque con un mensaje claro
 * en vez de fallar mas tarde dentro del callback de listen.
 */
const accessDisableRaw = text(process.env.DSH_ACCESS_DISABLE);
if (accessDisableRaw !== "" && accessDisableRaw !== "0" && accessDisableRaw !== "1") {
  throw new Error(
    `Configuracion invalida: DSH_ACCESS_DISABLE="${accessDisableRaw}". ` +
      "Usa 1 para desactivar la clave de acceso, o 0 (o dejarlo vacio) para mantenerla."
  );
}

export const config = Object.freeze({
  root: ROOT,
  version: "5.2.9",
  apkVersion: "5.2.9",
  apkVersionCode: 53,
  previousApkVersion: "5.2.8",
  previousApkVersionCode: 52,

  targetHost: "127.0.0.1",
  targetPort: positiveInt(process.env.DSH_TARGET_PORT, 52710),
  targetCandidates: [52710, 52711, 52712, 59189],

  listenPort: positiveInt(process.env.DSH_LISTEN_PORT, 57420),
  panelPort: positiveInt(process.env.DSH_PANEL_PORT, positiveInt(process.env.DSH_LISTEN_PORT, 57420) + 1),
  bindHost: text(process.env.DSH_BIND_HOST),
  // IP privada explicita cuando el adaptador tiene un nombre que no reconocemos.
  vpnIp: text(process.env.DSH_VPN_IP),
  // Los tun/tap genericos pueden ser la VPN corporativa de una oficina: solo se
  // aceptan si el operador confirma que la red es suya.
  allowGenericVpn: text(process.env.DSH_ALLOW_GENERIC_VPN) === "1",
  // Acceso a traves de un proxy/tunel (Cloudflare, nginx...). Por defecto es
  // un error de seguridad: el puente asumiria que la peticion viene de
  // loopback. Solo se permite si el operador lo pide explicitamente y pone
  // una capa de identidad delante (Cloudflare Access).
  allowProxyAccess: text(process.env.DSH_ALLOW_PROXY_ACCESS) === "1",

  syncDir: path.join(ROOT, "synced_chats"),
  maxSyncBytes: 4 * 1024 * 1024,
  maxSyncMessages: 1000,
  maxMessageChars: 200_000,

  sessionTtlMs: 12 * 60 * 60 * 1000,
  cookieRefreshWindowMs: 5 * 60 * 1000,

  headersTimeoutMs: 15_000,
  requestTimeoutMs: 30_000,
  keepAliveTimeoutMs: 65_000,
  proxyIdleMs: 60_000,
  streamIdleMs: 300_000,
  connectTimeoutMs: 8_000,
  maxConnections: 256,

  htmlBufferCap: 4 * 1024 * 1024,

  companionToken: text(process.env.DSH_COMPANION_TOKEN),
  accessKey: text(process.env.DSH_ACCESS_KEY),
  accessKeyDisabled: accessDisableRaw === "1",

  // Sesion de dispositivo: 30 dias, renovada deslizantemente con el uso.
  deviceTtlDays: positiveInt(process.env.DSH_DEVICE_TTL_DAYS, 30),
  deviceRefreshMs: positiveInt(process.env.DSH_DEVICE_REFRESH_HOURS, 24) * 60 * 60 * 1000,
  pendingTtlMs: positiveInt(process.env.DSH_PENDING_TTL_MIN, 15) * 60 * 1000,
  listenHostLabel: `${text(process.env.DSH_BIND_HOST) || "127.0.0.1"}:${positiveInt(process.env.DSH_LISTEN_PORT, 57420)}`,
  allowCidrs: text(process.env.DSH_ALLOW_CIDR)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),

  // P12: nombres DNS extra aceptados en la cabecera Host (MagicDNS de
  // Tailscale, nombre de ZeroTier, etc.). Lista separada por comas; vacia =
  // solo las IP/loopback que arma bridge.mjs, que es el comportamiento previo.
  allowedHosts: text(process.env.DSH_ALLOWED_HOSTS)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),

  dshHome: text(process.env.DSH_HOME) || path.join(process.env.USERPROFILE || os.homedir(), ".dsh"),
});

