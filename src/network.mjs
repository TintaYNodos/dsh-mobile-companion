/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { config } from "./config.mjs";
import { log, warn } from "./log.mjs";

const execFileAsync = promisify(execFile);

// P20: se separan las VPN conocidas (ZeroTier, Tailscale, WireGuard) de los
// tun/tap genericos, que pueden ser la VPN corporativa de una oficina.
const STRONG_VPN = /zerotier|tailscale|^zt[a-z0-9]|^ts[0-9]|^wg[0-9]/i;
const GENERIC_VPN = /wireguard|openvpn|^tun[0-9]|^tap[0-9]/i;

export const normalizeAddress = (address) => String(address || "").replace(/^::ffff:/, "");

const ipv4Octets = (address) => {
  if (!net.isIPv4(address)) return null;
  return address.split(".").map((part) => Number.parseInt(part, 10));
};

const ipv4ToInt = (address) => {
  const octets = ipv4Octets(address);
  if (!octets || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
};

export const maskToPrefix = (mask) => {
  const value = ipv4ToInt(mask);
  if (value === null) return 32;
  let prefix = 0;
  for (let bit = 31; bit >= 0; bit -= 1) {
    if ((value >>> bit) & 1) prefix += 1;
    else break;
  }
  return prefix;
};

/** Comparación real por máscara, no por octetos ni prefijos fijos. */
export const inCidr = (address, network, prefixLength) => {
  const target = ipv4ToInt(address);
  const base = ipv4ToInt(network);
  if (target === null || base === null) return false;
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32) return false;
  const mask = prefixLength === 32 ? 0xffffffff : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (target & mask) === (base & mask);
};

const isPrivateVpnAddress = (address) => {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
  return false;
};

const isSafeBindAddress = (address) => {
  if (!net.isIPv4(address)) return false;
  if (address === "0.0.0.0" || address === "255.255.255.255") return false;
  return address.startsWith("127.") || isPrivateVpnAddress(address);
};

export function probePort(port, host = config.targetHost, timeoutMs = 500) {
  return new Promise((resolve) => {
    if (!net.isIP(host)) {
      resolve(false);
      return;
    }

    const request = http.request(
      { hostname: host, port, method: "GET", path: "/", timeout: timeoutMs, agent: false },
      (response) => {
        response.resume();
        resolve([200, 301, 302, 307, 308, 401, 403].includes(response.statusCode));
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
    request.end();
  });
}

/**
 * Localiza la interfaz de red privada. Prioriza el override explicito, luego los
 * adaptadores de VPN reconocidos y finalmente el rango CGNAT de Tailscale.
 * Nunca devuelve una direccion enrutable publicamente.
 */
export function findVpnAddress() {
  const override = config.bindHost || process.env.DSH_VPN_IP;

  if (override) {
    if (isSafeBindAddress(override)) {
      return {
        address: override,
        iface: override === config.bindHost ? "DSH_BIND_HOST" : "DSH_VPN_IP",
        prefix: 24,
      };
    }
    warn("network", `Direccion de enlace rechazada por politica: ${override}`);
  }

  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue;
    for (const entry of addresses) {
      const isIpv4 = entry.family === "IPv4" || entry.family === 4;
      if (!isIpv4 || entry.internal || entry.address === "0.0.0.0") continue;
      if (entry.address.startsWith("169.254.")) continue;
      candidates.push({
        name,
        address: entry.address,
        prefix: maskToPrefix(entry.netmask),
        preferred: STRONG_VPN.test(name),
        genericVpn: GENERIC_VPN.test(name),
      });
    }
  }

  const preferred = candidates.find((candidate) => candidate.preferred);
  if (preferred) return { address: preferred.address, iface: preferred.name, prefix: preferred.prefix };

  const generic = candidates.find((candidate) => candidate.genericVpn);
  if (generic && process.env.DSH_ALLOW_GENERIC_VPN === "1") {
    warn("network", `USB VPN generica (${generic.name}) permitida por DSH_ALLOW_GENERIC_VPN=1`);
    return { address: generic.address, iface: generic.name, prefix: generic.prefix };
  }
  if (generic) {
    warn(
      "network",
      `Ignorando ${generic.name}: parece una VPN generica (posible VPN corporativa). ` +
        "Usa DSH_BIND_HOST con tu IP privada o DSH_ALLOW_GENERIC_VPN=1 si es tu red."
    );
  }

  const cgnat = candidates.find((candidate) => {
    const octets = ipv4Octets(candidate.address);
    return octets && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127;
  });
  if (cgnat) return { address: cgnat.address, iface: cgnat.name, prefix: cgnat.prefix };

  return { address: "127.0.0.1", iface: "loopback", prefix: 8 };
}

/**
 * Autorizacion de cliente con criterio cerrado: loopback, la subred real de la
 * interfaz de enlace con su mascara efectiva, o los CIDR declarados.
 *
 * La propia IP de enlace no se autoriza por si misma: cualquier proceso local
 * puede conectarse a esa direccion y heredaria la sesion. El acceso local ya
 * esta cubierto por loopback.
 */
export function isClientAuthorized(remoteAddress, bindHost, bindPrefix = 24) {
  const client = normalizeAddress(remoteAddress);
  if (!client || !net.isIPv4(client)) return false;

  if (client.startsWith("127.")) return true;

  for (const cidr of config.allowCidrs) {
    const [network, bits] = cidr.split("/");
    if (!network) continue;
    const parsedBits = Number.parseInt(bits ?? "32", 10);
    if (inCidr(client, network, parsedBits)) return true;
  }

  if (bindHost.startsWith("127.")) return false;
  if (!isPrivateVpnAddress(bindHost)) return false;

  return inCidr(client, bindHost, bindPrefix);
}


export function probeDshPort(port, host = config.targetHost, timeoutMs = 400) {
  return new Promise((resolve) => {
    if (!net.isIP(host)) return resolve(false);

    const request = http.request(
      { hostname: host, port, method: "GET", path: "/", timeout: timeoutMs, agent: false },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.includes("dsh web authentication required") || body.includes("__DSH_BOOT__")) {
            request.destroy();
            resolve(true);
          }
        });
        response.on("end", () => {
          resolve(body.includes("dsh web authentication required") || body.includes("__DSH_BOOT__"));
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
    request.end();
  });
}

/**
 * P11: en Linux y macOS no habia descubrimiento dinamico (solo el netstat de
 * Windows) y ademas era sincrono: `execSync` congelaba el event loop hasta
 * 1.5 s en cada barrido, con los tuneles y peticiones en curso esperando.
 * Ahora hay una fuente por sistema (en Linux /proc/net/tcp, que ni siquiera
 * lanza proceso hijo) y los binarios se ejecutan con execFile asincrono.
 * Se conserva la misma politica de siempre: solo loopback 127.0.0.1, puertos
 * > 1024 y fuera de los puertos propios del puente.
 */
const DISCOVERY_TIMEOUT_MS = 1_500;
const DISCOVERY_MAX_BUFFER = 1024 * 1024;

const isCandidatePort = (port) =>
  Number.isInteger(port) && port > 1024 && port !== config.panelPort && port !== config.listenPort;

const portsFromLines = (lines, pattern) => {
  const ports = new Set();
  for (const line of lines) {
    const match = pattern.exec(line);
    if (!match) continue;
    const port = Number.parseInt(match[1], 10);
    if (isCandidatePort(port)) ports.add(port);
  }
  return [...ports];
};

/** /proc/net/tcp: local_address en hex little-endian y estado 0A = LISTEN. */
export function parseProcNetTcp(text) {
  const ports = new Set();
  for (const line of String(text || "").split("\n").slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 4 || fields[3] !== "0A") continue;
    const [address, portHex] = fields[1].split(":");
    if (address !== "0100007F") continue; // 127.0.0.1
    const port = Number.parseInt(portHex, 16);
    if (isCandidatePort(port)) ports.add(port);
  }
  return [...ports];
}

/** ss -ltn (Linux). */
export function parseSsListening(text) {
  return portsFromLines(
    String(text || "").split("\n"),
    /^\s*LISTEN\s+\d+\s+\d+\s+127\.0\.0\.1:(\d+)(?:\s|$)/
  );
}

/** lsof -nP -iTCP -sTCP:LISTEN -F n (macOS): una linea `n127.0.0.1:PUERTO`. */
export function parseLsofListening(text) {
  return portsFromLines(String(text || "").split("\n"), /^n127\.0\.0\.1:(\d+)$/);
}

/** netstat -ano -p tcp (Windows): se mantiene el formato aceptado de siempre. */
export function parseNetstatWindows(text) {
  return portsFromLines(
    String(text || "").split("\n"),
    /^\s*TCP\s+127\.0\.0\.1:(\d+)\s+0\.0\.0\.0:0\s+LISTENING/i
  );
}

/** netstat -an -p tcp (macOS): `tcp4 0 0 127.0.0.1.52710 *.* LISTEN`. */
export function parseNetstatMac(text) {
  return portsFromLines(
    String(text || "").split("\n"),
    /^\s*tcp[46]\s+\d+\s+\d+\s+127\.0\.0\.1\.(\d+)\s+\S+\s+LISTEN/i
  );
}

const runForOutput = async (command, args) => {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: DISCOVERY_TIMEOUT_MS,
      maxBuffer: DISCOVERY_MAX_BUFFER,
      windowsHide: true,
    });
    return stdout;
  } catch {
    // Binario ausente, salida distinta de cero o timeout: esa fuente no aporta.
    return "";
  }
};

export async function discoverListeningPorts() {
  if (process.platform === "win32") {
    return parseNetstatWindows(await runForOutput("netstat", ["-ano", "-p", "tcp"]));
  }

  if (process.platform === "darwin") {
    // lsof viene con macOS; netstat queda como respaldo si faltara.
    const viaLsof = parseLsofListening(await runForOutput("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "n"]));
    if (viaLsof.length > 0) return viaLsof;
    return parseNetstatMac(await runForOutput("netstat", ["-an", "-p", "tcp"]));
  }

  try {
    return parseProcNetTcp(await readFile("/proc/net/tcp", "utf8"));
  } catch {
    // Sin /proc (contenedor minimo): queda `ss` como respaldo.
  }
  return parseSsListening(await runForOutput("ss", ["-ltn"]));
}

let resolvedPort = config.targetPort;
let resolvedAt = 0;
let inFlight = null;

/**
 * Resuelve el puerto real de DeepSeek Harness con cache corto y una sola
 * sondas concurrente. Evita que N peticiones simultaneas disparen N barridos.
 */
export function resolveTargetPort(force = false) {
  const now = Date.now();
  if (!force && now - resolvedAt < 20_000) return Promise.resolve(resolvedPort);
  if (inFlight) return inFlight;

  inFlight = resolveOnce(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function resolveOnce(now) {
  if (await probeDshPort(resolvedPort, config.targetHost, 300)) {
    resolvedAt = now;
    return resolvedPort;
  }

  for (const candidate of config.targetCandidates) {
    if (candidate === resolvedPort) continue;
    if (await probeDshPort(candidate, config.targetHost, 200)) {
      log("network", `Puerto de DeepSeek Harness reasignado a ${candidate}`);
      resolvedPort = candidate;
      resolvedAt = now;
      return resolvedPort;
    }
  }

  const discovered = await discoverListeningPorts();
  for (const candidate of discovered) {
    if (candidate === resolvedPort || config.targetCandidates.includes(candidate)) continue;
    if (await probeDshPort(candidate, config.targetHost, 250)) {
      log("network", `Puerto de DeepSeek Harness descubierto dinamicamente en ${candidate}`);
      resolvedPort = candidate;
      resolvedAt = now;
      return resolvedPort;
    }
  }

  resolvedAt = now;
  return resolvedPort;
}

export function invalidateTargetPort() {
  resolvedAt = 0;
}
