/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import http from "node:http";
import { config } from "./config.mjs";
import { injectSessionHeaders, getAuthority, invalidateSession } from "./crypto.mjs";
import { log } from "./log.mjs";
import { scrubHeaders, isDocumentRequest, sendJson } from "./http.mjs";
import { injectMobileShell } from "./mobile.mjs";
import { invalidateTargetPort } from "./network.mjs";

export { handleWsProxy } from "./proxy-ws.mjs";

const applyStreamTuning = (socket, idleMs) => {
  if (!socket) return;
  socket.setNoDelay(true);
  socket.setTimeout(idleMs);
};

const copyHeaders = (proxyRes) => {
  const headers = { ...proxyRes.headers };
  delete headers.connection;
  delete headers["keep-alive"];
  delete headers["proxy-connection"];
  return headers;
};

const upstreamAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 64,
  maxFreeSockets: 8,
  scheduling: "lifo",
});

let lastAuthWarning = 0;
let lastSecretFailure = null;

const bufferHtml = (proxyRes, capBytes) =>
  new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const prefix = () => Buffer.concat(chunks);

    proxyRes.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      chunks.push(chunk);
      if (size > capBytes) settle({ kind: "overflow", prefix: prefix() });
    });
    proxyRes.on("end", () => {
      if (settled) return;
      settle({ kind: "complete", body: prefix() });
    });
    proxyRes.on("error", () => settle({ kind: "aborted", prefix: prefix() }));
    proxyRes.on("aborted", () => settle({ kind: "aborted", prefix: prefix() }));
    proxyRes.on("close", () => settle({ kind: "aborted", prefix: prefix() }));
  });

const streamThrough = (clientRes, proxyRes, prefix) => {
  clientRes.writeHead(proxyRes.statusCode ?? 502, copyHeaders(proxyRes));
  if (prefix && prefix.length) clientRes.write(prefix);
  proxyRes.pipe(clientRes, { end: true });
};

const deliverHtml = (clientRes, proxyRes, html) => {
  const headers = copyHeaders(proxyRes);
  delete headers["content-length"];
  delete headers["content-encoding"];
  delete headers["transfer-encoding"];
  delete headers.etag;
  delete headers["content-md5"];
  delete headers.digest;

  const body = Buffer.from(html, "utf8");
  headers["content-length"] = body.length;
  headers["cache-control"] = "no-store";

  clientRes.writeHead(200, headers);
  clientRes.end(body);
};

async function forwardResponse(req, res, proxyReq, proxyRes, { wantsHtml, mobileMode }) {
  const status = proxyRes.statusCode ?? 502;
  const contentType = String(proxyRes.headers["content-type"] || "");
  const encoding = String(proxyRes.headers["content-encoding"] || "identity").toLowerCase();
  const isStream = contentType.includes("text/event-stream");
  const isHtml = contentType.includes("text/html");

  if (isStream) {
    proxyReq.removeAllListeners("timeout");
    proxyReq.setTimeout(0);
  }

  applyStreamTuning(proxyRes.socket, isStream ? config.streamIdleMs : config.proxyIdleMs);
  applyStreamTuning(res.socket, isStream ? config.streamIdleMs : config.proxyIdleMs);

  const injectable =
    wantsHtml &&
    isHtml &&
    mobileMode &&
    status === 200 &&
    req.method !== "HEAD" &&
    encoding === "identity" &&
    !proxyRes.headers["content-range"];

  if (!injectable) {
    if (res.headersSent || res.destroyed) {
      proxyRes.destroy();
      return;
    }
    streamThrough(res, proxyRes);
    return;
  }

  const buffered = await bufferHtml(proxyRes, config.htmlBufferCap);

  if (res.headersSent || res.destroyed) {
    proxyRes.destroy();
    return;
  }

  if (buffered.kind === "overflow") {
    streamThrough(res, proxyRes, buffered.prefix);
    return;
  }

  if (buffered.kind !== "complete") {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("El bunker interrumpio la respuesta");
    return;
  }

  deliverHtml(res, proxyRes, injectMobileShell(buffered.body.toString("utf8")));
}

export async function handleHttpProxy(req, res, { targetPort, mobileMode }) {
  let authority = getAuthority(config.targetHost, targetPort);
  const wantsHtml = isDocumentRequest(req);
  const wantsEventStream = /text\/event-stream/i.test(String(req.headers.accept || ""));
  const idempotent = req.method === "GET" || req.method === "HEAD";

  applyStreamTuning(req.socket, config.proxyIdleMs);

  let headers;
  try {
    headers = scrubHeaders(injectSessionHeaders(req.headers, authority));
  } catch (error) {
    if (Date.now() - (lastSecretFailure || 0) > 10_000) {
      lastSecretFailure = Date.now();
      log("proxy", `Sesion no disponible: ${error.message}`);
    }
    sendJson(res, 500, { error: "Sesion no disponible" });
    return;
  }

  if (wantsHtml || wantsEventStream) headers["accept-encoding"] = "identity";

  const requestOnce = (useKeepAlive) => {
    const proxyReq = http.request({
      hostname: config.targetHost,
      port: targetPort,
      path: req.url,
      method: req.method,
      headers,
      agent: useKeepAlive ? upstreamAgent : false,
      timeout: config.proxyIdleMs,
    });

    const abort = () => {
      if (!proxyReq.destroyed) proxyReq.destroy();
    };
    res.once("close", abort);

    return new Promise((resolve) => {
      proxyReq.once("response", (proxyRes) => {
        res.removeListener("close", abort);
        resolve({ proxyRes, proxyReq });
      });

      proxyReq.once("timeout", () => {
        proxyReq.destroy(Object.assign(new Error("Tiempo de espera agotado"), { code: "ETIMEDOUT" }));
      });

      proxyReq.once("error", (error) => {
        res.removeListener("close", abort);

        if (useKeepAlive && idempotent && error.code === "ECONNRESET" && !res.headersSent) {
          upstreamAgent.destroy();
          resolve({ staleSocket: true });
          return;
        }

        const refused = error.code === "ECONNREFUSED" || error.code === "ECONNRESET";
        if (refused) {
          upstreamAgent.destroy();
          invalidateTargetPort();
          if (idempotent && !res.headersSent) {
            resolve({ portChanged: true });
            return;
          }
        }

        if (res.headersSent) {
          if (!res.destroyed) res.destroy();
          resolve({ error: true });
          return;
        }

        log("proxy", `Fallo hacia ${authority}: ${error.code || error.message}`);
        if (wantsHtml) {
          res.writeHead(502, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Conectando al bÃºnker...</title><style>body{background:#151517;color:#FCD34D;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;box-sizing:border-box}p{font-size:16px;line-height:1.5}</style></head><body><p>Reconectando con DeepSeek Harness...<br><small style="color:#9CA3AF">Reintentando automÃ¡ticamente</small></p></body></html>');
        } else {
          res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
          res.end("El bunker no responde. Reintentando en segundo plano.");
        }
        resolve({ error: true });
      });

      if (idempotent) {
        proxyReq.end();
      } else {
        req.pipe(proxyReq, { end: true });
      }
    });
  };

  let result = await requestOnce(true);
  if (result.error) return;

  if (result.staleSocket) {
    result = await requestOnce(false);
    if (result.error) return;
  }

  if (result.portChanged) {
    targetPort = await resolveTargetPort(true);
    authority = getAuthority(config.targetHost, targetPort);
    headers = scrubHeaders(injectSessionHeaders(req.headers, authority));
    result = await requestOnce(false);
    if (result.error) return;
  }

  if (result.proxyRes.statusCode === 401 && idempotent) {
    const now = Date.now();
    if (now - lastAuthWarning > 10_000) {
      lastAuthWarning = now;
      log("proxy", "401 del backend: se recarga el secreto de sesion y se reintenta");
    }
    invalidateSession();
    result.proxyRes.resume();
    result = await requestOnce(false);
    if (result.error) return;
  }

  try {
    await forwardResponse(req, res, result.proxyReq, result.proxyRes, { wantsHtml, mobileMode });
  } catch (error) {
    log("proxy", `Respuesta interrumpida: ${error.code || error.message}`);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Fallo interno del puente");
    } else if (!res.destroyed) {
      res.destroy();
    }
  }
}
