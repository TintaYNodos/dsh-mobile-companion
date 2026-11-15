/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import { spawn } from "node:child_process";
import { config } from "./config.mjs";
import { isClientAuthorized, normalizeAddress, resolveTargetPort, probePort } from "./network.mjs";
import { hasValidAccessKey, isCompanionRequestTrusted } from "./crypto.mjs";
import {
  pendingRequests,
  requestAccess,
} from "./devices.mjs";
import { hasAmbiguousFraming, isJsonRequest, isSameOriginRequest, readBody, sendJson, sendText } from "./http.mjs";
import { handlePairingRoutes, handlePendingApprovalGate, resolveDevice } from "./routes-pairing.mjs";
import { handleHttpProxy } from "./proxy.mjs";
import { handleSync, handleListChats, handleGetChat, handleAbsorbSatellite } from "./sync.mjs";
import { hasStaticRoute, serveStatic } from "./static.mjs";
import { consumeAllowance } from "./ratelimit.mjs";
import { collectSystemStats, telemetryHistory } from "./system-stats.mjs";
import { emitTestEvent, handlePcEvents, startPcWatcher } from "./pc-events.mjs";

export const wantsMobileShell = (req, url) => {
  if (url.searchParams.get("dshc") === "off") return false;
  if (url.searchParams.get("dshc") === "on") return true;
  return /android|iphone|ipad|ipod|mobile|harmonyos/i.test(String(req.headers["user-agent"] || ""));
};

export const buildStatusPayload = async () => {
  const targetPort = await resolveTargetPort();
  const dshOnline = await probePort(targetPort, config.targetHost, 400);
  const pending = pendingRequests();
  return {
    service: "dsh-companion",
    version: config.version,
    apkVersion: config.apkVersion || config.version,
    apkVersionCode: config.apkVersionCode || 14,
    previousApkVersion: config.previousApkVersion || "3.9.2",
    previousApkVersionCode: config.previousApkVersionCode || 13,
    status: "online",
    dshOnline,
    targetPort,
    pendingDevices: pending.length,
    pendingList: pending,
    systemStats: collectSystemStats(),
    time: Date.now(),
  };
};

export async function dispatchRequest(req, res, context) {
  const { bindHost, bindPrefix, allowedOrigins, allowedHosts, openPanelWindow } = context;
  const remoteAddress = req.socket.remoteAddress;

  if (!isClientAuthorized(remoteAddress, bindHost, bindPrefix)) {
    sendText(res, 403, "Acceso denegado");
    return;
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  if (hasAmbiguousFraming(req.headers)) {
    sendText(res, 400, "Framing de peticion ambiguo");
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://${bindHost}:${config.listenPort}`);
  } catch {
    sendText(res, 400, "URI invalida");
    return;
  }

  const { pathname } = url;

  if (await handlePairingRoutes(req, res, { url, pathname, remoteAddress, context })) return;

  if (!isSameOriginRequest(req, allowedOrigins, allowedHosts)) {
    sendText(res, 403, "Origen no autorizado");
    return;
  }

  if (pathname === "/dsh-companion/status" && (req.method === "GET" || req.method === "HEAD")) {
    if (!consumeAllowance(`status:${remoteAddress}`, { capacity: 120, refillPerSecond: 2 })) {
      sendJson(res, 429, { error: "Demasiadas consultas" });
      return;
    }

    const device = resolveDevice(req, res, remoteAddress);
    const authorized = Boolean(device) || hasValidAccessKey(req);
    const now = Date.now();

    if (!authorized) {
      // Sin autorizacion no se calcula nada caro: buildStatusPayload() lanza
      // collectSystemStats() (PowerShell cada pocos segundos) y era un DoS
      // trivial desde la LAN con solo pedir /status en bucle.
      const { created } = requestAccess(remoteAddress, req.headers["user-agent"]);
      if (created) openPanelWindow();
      sendJson(res, 200, {
        service: "dsh-companion",
        version: config.version,
        apkVersion: config.apkVersion || config.version,
        apkVersionCode: config.apkVersionCode || 0,
        status: "pairing",
        dshOnline: false,
        targetPort: null,
        time: now,
      });
      return;
    }

    const payload = await buildStatusPayload();
    sendJson(res, 200, payload);
    return;
  }

  if (pathname === "/dsh-companion/stats" && (req.method === "GET" || req.method === "HEAD")) {
    if (!consumeAllowance(`stats:${remoteAddress}`, { capacity: 60, refillPerSecond: 1 })) {
      sendJson(res, 429, { error: "Demasiadas consultas" });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    const current = collectSystemStats();
    sendJson(res, 200, { ok: true, stats: { ...current, history: telemetryHistory } });
    return;
  }

  if (pathname === "/dsh-companion/terminal" && req.method === "POST") {
    // Shell remoto: cualquier dispositivo emparejado obtendria control total de
    // la PC. Se deja como funcion opcional explicita y apagada por defecto;
    // ademas solo se permite desde el propio equipo (loopback).
    if (!config.enableTerminal) {
      sendJson(res, 501, {
        ok: false,
        error: "terminal_disabled",
        detail: "La terminal remota está desactivada. Actívala con DSH_ENABLE_TERMINAL=1.",
      });
      return;
    }
    if (!normalizeAddress(remoteAddress).startsWith("127.")) {
      sendJson(res, 403, { ok: false, error: "La terminal solo está disponible desde la computadora" });
      return;
    }
    if (!consumeAllowance(`terminal:${remoteAddress}`, { capacity: 20, refillPerSecond: 2 })) {
      sendJson(res, 429, { ok: false, error: "Demasiadas peticiones" });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { ok: false, error: "Acceso no autorizado" });
      return;
    }
    let body;
    try {
      body = JSON.parse((await readBody(req, 65536)).toString("utf8"));
    } catch {
      sendJson(res, 400, { ok: false, error: "JSON invalido" });
      return;
    }
    const command = typeof body?.command === "string" ? body.command.trim() : "";
    if (!command) {
      sendJson(res, 400, { ok: false, error: "Comando vacio o no especificado" });
      return;
    }

    const MAX_OUTPUT = 32 * 1024;
    const sanitizeAndCap = (val) => {
      if (typeof val !== "string") val = String(val ?? "");
      val = val.replace(/\0/g, "");
      const buf = Buffer.from(val, "utf8");
      if (buf.length <= MAX_OUTPUT) return val;
      return buf.subarray(0, MAX_OUTPUT).toString("utf8");
    };

    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "bash";
    const args = isWin ? ["-NoProfile", "-Command", command] : ["-c", command];

    const result = await new Promise((resolve) => {
      let stdoutChunks = [];
      let stderrChunks = [];
      let totalStdoutBytes = 0;
      let totalStderrBytes = 0;
      let settled = false;

      const child = spawn(shell, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill("SIGKILL");
        } catch {}
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8") || "Tiempo de espera agotado",
          status: 124,
        });
      }, 10000);

      child.stdout.on("data", (chunk) => {
        if (totalStdoutBytes < 1024 * 1024) {
          stdoutChunks.push(chunk);
          totalStdoutBytes += chunk.length;
        }
      });

      child.stderr.on("data", (chunk) => {
        if (totalStderrBytes < 1024 * 1024) {
          stderrChunks.push(chunk);
          totalStderrBytes += chunk.length;
        }
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: err?.message || String(err),
          status: 1,
        });
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
          status: code !== null ? code : 0,
        });
      });
    });

    const exitCode = result.status !== null && result.status !== undefined
      ? result.status
      : 0;

    const stdout = sanitizeAndCap(result.stdout || "");
    const stderr = sanitizeAndCap(result.stderr || "");

    sendJson(res, 200, {
      ok: true,
      stdout,
      stderr,
      exitCode,
    });
    return;
  }

  if (pathname === "/simulator") {
    serveStatic(pathname, req, res);
    return;
  }

  if (await handlePendingApprovalGate(req, res, { url, pathname, remoteAddress, context })) return;

  if (pathname === "/" || pathname === "/index.html") {
    const targetPort = await resolveTargetPort();
    await handleHttpProxy(req, res, { targetPort, mobileMode: wantsMobileShell(req, url) });
    return;
  }

  if (pathname === "/m" || pathname === "/offline") {
    if (pathname === "/m") {
      res.writeHead(308, { Location: "/", "Cache-Control": "no-store" });
      res.end();
      return;
    }
  }

  if (pathname === "/dsh-companion/sync") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "POST" });
      return;
    }
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Se requiere Content-Type application/json" });
      req.resume();
      return;
    }
    // `isCompanionRequestTrusted` es fail-closed: sin DSH_COMPANION_TOKEN ya
    // no autoriza por si solo. Se conservan las dos puertas verificables:
    //   - con token configurado, la sincronizacion sigue exigiendo ESE token;
    //   - sin token configurado, exige cookie de dispositivo o clave de acceso
    //     (nunca la mera pertenencia a la red privada).
    if (config.companionToken) {
      if (!isCompanionRequestTrusted(req)) {
        sendJson(res, 401, { error: "Token de companion ausente o invalido" });
        return;
      }
    } else {
      const syncDevice = resolveDevice(req, res, remoteAddress);
      if (!syncDevice && !hasValidAccessKey(req)) {
        sendJson(res, 401, { error: "Token o credenciales ausentes o invalidos" });
        return;
      }
    }
    await handleSync(req, res, remoteAddress);
    return;
  }

  if (pathname === "/dsh-companion/absorb-satellite") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "POST" });
      return;
    }
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: "Se requiere Content-Type application/json" });
      req.resume();
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req) && !isCompanionRequestTrusted(req)) {
      sendJson(res, 401, { error: "Token o credenciales ausentes o invalidos" });
      return;
    }
    await handleAbsorbSatellite(req, res, remoteAddress);
    return;
  }

  if (pathname === "/dsh-companion/pc-events" && (req.method === "GET" || req.method === "HEAD")) {
    if (!consumeAllowance(`pc-events:${remoteAddress}`, { capacity: 20, refillPerSecond: 0.2 })) {
      sendJson(res, 429, { error: "Demasiadas conexiones" });
      return;
    }
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    startPcWatcher();
    handlePcEvents(req, res);
    return;
  }

  if (pathname === "/dsh-companion/pc-events/test" && req.method === "POST") {
    const device = resolveDevice(req, res, remoteAddress);
    if (!device && !hasValidAccessKey(req)) {
      sendJson(res, 403, { error: "Acceso no autorizado" });
      return;
    }
    startPcWatcher();
    const listeners = emitTestEvent();
    sendJson(res, 200, { ok: true, listeners });
    return;
  }

  if (pathname === "/dsh-companion/chats") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD" });
      return;
    }
    await handleListChats(req, res, remoteAddress);
    return;
  }

  if (pathname.startsWith("/dsh-companion/chat/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Metodo no permitido" }, { Allow: "GET, HEAD" });
      return;
    }
    const id = pathname.slice("/dsh-companion/chat/".length).trim();
    const format = url.searchParams.get("format") || (req.headers.accept?.includes("text/markdown") ? "md" : "json");
    await handleGetChat(req, res, id, remoteAddress, format);
    return;
  }

  if (hasStaticRoute(pathname)) {
    serveStatic(pathname, req, res);
    return;
  }

  const targetPort = await resolveTargetPort();
  await handleHttpProxy(req, res, { targetPort, mobileMode: wantsMobileShell(req, url) });
}
