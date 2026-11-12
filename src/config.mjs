/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael MuÃ±oz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (BSL 1.1) / PolyForm Noncommercial 1.0.0.
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

export const config = Object.freeze({
  root: ROOT,
  version: "4.3.0",
  apkVersion: "4.3.0",
  apkVersionCode: 20,
  previousApkVersion: "4.2.2",
  previousApkVersionCode: 19,

  targetHost: "127.0.0.1",
  targetPort: positiveInt(process.env.DSH_TARGET_PORT, 52710),
  targetCandidates: [52710, 52711, 52712, 59189, 57421],

  listenPort: positiveInt(process.env.DSH_LISTEN_PORT, 57420),
  panelPort: positiveInt(process.env.DSH_PANEL_PORT, positiveInt(process.env.DSH_LISTEN_PORT, 57420) + 1),
  bindHost: text(process.env.DSH_BIND_HOST),

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
  accessKeyDisabled: text(process.env.DSH_ACCESS_DISABLE) === "1",

  // Sesion de dispositivo: 30 dias, renovada deslizantemente con el uso.
  deviceTtlDays: positiveInt(process.env.DSH_DEVICE_TTL_DAYS, 30),
  deviceRefreshMs: positiveInt(process.env.DSH_DEVICE_REFRESH_HOURS, 24) * 60 * 60 * 1000,
  pendingTtlMs: positiveInt(process.env.DSH_PENDING_TTL_MIN, 15) * 60 * 1000,
  autoApprove: text(process.env.DSH_PAIR_OPEN) === "1",
  listenHostLabel: `${text(process.env.DSH_BIND_HOST) || "127.0.0.1"}:${positiveInt(process.env.DSH_LISTEN_PORT, 57420)}`,
  allowCidrs: text(process.env.DSH_ALLOW_CIDR)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean),

  dshHome: text(process.env.DSH_HOME) || path.join(process.env.USERPROFILE || os.homedir(), ".dsh"),
});
