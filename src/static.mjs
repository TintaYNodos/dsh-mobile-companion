/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

const ASSETS = new Map([
  ["/offline", { file: "offline.html", type: "text/html; charset=utf-8", cache: "no-store" }],
  ["/companion.webmanifest", { file: "manifest.webmanifest", type: "application/manifest+json; charset=utf-8", cache: "public, max-age=3600" }],
  ["/icon.svg", { file: "icon.svg", type: "image/svg+xml", cache: "public, max-age=86400" }],
  ["/DSH-Companion.apk", { file: "../DSH-Companion.apk", type: "application/vnd.android.package-archive", cache: "no-store", download: "DSH-Companion.apk" }],
  ["/download/DSH-Companion.apk", { file: "../DSH-Companion.apk", type: "application/vnd.android.package-archive", cache: "no-store", download: "DSH-Companion.apk" }],
  ["/DSH-Companion-previous.apk", { file: "../DSH-Companion-previous.apk", type: "application/vnd.android.package-archive", cache: "no-store", download: "DSH-Companion-previous.apk" }],
]);

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

    res.writeHead(200, { ...baseHeaders, "Content-Length": stats.size });
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
