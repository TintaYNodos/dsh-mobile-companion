/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { config } from "./config.mjs";

/**
 * SHA-256 del APK que este puente sirve en /DSH-Companion.apk.
 *
 * El telefono lo usa como ancla al actualizar desde la propia PC: esa ruta no
 * tiene digest de GitHub. Se cachea por mtime y tamano para no leer el archivo
 * en cada /status.
 */
let apkDigestCache = { key: "", value: "" };

export const apkSha256 = () => {
  try {
    const info = fs.statSync("DSH-Companion.apk");
    const key = String(info.size) + ":" + String(info.mtimeMs);
    if (apkDigestCache.key === key) return apkDigestCache.value;
    const hash = createHash("sha256").update(fs.readFileSync("DSH-Companion.apk")).digest("hex");
    apkDigestCache = { key, value: hash };
    return hash;
  } catch {
    return "";
  }
};

const ASSETS = new Map([
  ["/simulator", { file: "simulator/simulator.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/simulator-base.css", { file: "simulator/simulator-base.css", type: "text/css; charset=utf-8", cache: "no-store" }],
  ["/simulator-components.css", { file: "simulator/simulator-components.css", type: "text/css; charset=utf-8", cache: "no-store" }],
  ["/simulator.js", { file: "simulator/simulator.js", type: "application/javascript; charset=utf-8", cache: "no-store" }],
  ["/offline", { file: "offline.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/offline.css", { file: "offline.css", type: "text/css; charset=utf-8", cache: "no-store" }],
  ["/offline-reader.css", { file: "offline-reader.css", type: "text/css; charset=utf-8", cache: "no-store" }],
  ["/offline-satellite.css", { file: "offline-satellite.css", type: "text/css; charset=utf-8", cache: "no-store" }],
  ["/offline-core.js", { file: "offline-core.js", type: "application/javascript; charset=utf-8", cache: "no-store" }],
  ["/offline-reader.js", { file: "offline-reader.js", type: "application/javascript; charset=utf-8", cache: "no-store" }],
  ["/offline-satellite.js", { file: "offline-satellite.js", type: "application/javascript; charset=utf-8", cache: "no-store" }],
  ["/companion.webmanifest", { file: "manifest.webmanifest", type: "application/manifest+json; charset=utf-8", cache: "public, max-age=3600" }],
  ["/icon.svg", { file: "icon.svg", type: "image/svg+xml", cache: "public, max-age=86400" }],
  ["/DSH-Companion.apk", { file: "DSH-Companion.apk", type: "application/vnd.android.package-archive", cache: "no-store", download: "DSH-Companion.apk" }],
  ["/download/DSH-Companion.apk", { file: "DSH-Companion.apk", type: "application/vnd.android.package-archive", cache: "no-store", download: "DSH-Companion.apk" }],
  ["/DSH-Companion-previous.apk", { file: "DSH-Companion-previous.apk", type: "application/vnd.android.package-archive", cache: "no-store", download: "DSH-Companion-previous.apk" }],
]);

// P51: las paginas propias no tenian CSP. La offline es autocontenida (sin
// recursos externos) y el simulador igual, asi que se puede cerrar del todo.
const HTML_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

export const hasStaticRoute = (pathname) => ASSETS.has(pathname);

export function serveStatic(pathname, req, res) {
  const entry = ASSETS.get(pathname);
  if (!entry) return;

  let filePath = path.join(config.root, entry.file);
  if (!fs.existsSync(filePath)) {
    const directPath = path.join(config.root, path.basename(entry.file));
    if (fs.existsSync(directPath)) {
      filePath = directPath;
    }
  }
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Recurso no disponible");
      return;
    }

    const etag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    const baseHeaders = {
      "Content-Type": entry.type || MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": entry.cache,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ETag: etag,
    };

    if (entry.download) {
      baseHeaders["Content-Disposition"] = `attachment; filename="${entry.download}"`;
    }

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }

    res.writeHead(200, {
    ...(entry.type.startsWith("text/html") ? { "Content-Security-Policy": HTML_CSP, "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" } : {}), ...baseHeaders, "Content-Length": stats.size });
    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Recurso ilegible");
      } else if (!res.destroyed) {
        res.destroy();
      }
    });
    stream.pipe(res);
  });
}
