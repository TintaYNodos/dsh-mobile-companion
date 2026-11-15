/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
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

// P20: VPN de proveedores conocidos frente a tun/tap genericos, que pueden ser
// la VPN corporativa de una oficina. El nombre de la interfaz manda; el rango
// solo confirma. El orden de esta tabla ES la prioridad cuando hay varias.
const VPN_PROVIDERS = [
  ["tailscale", /tailscale|headscale|^ts[0-9]/i],
  ["zerotier", /zerotier|^zt[a-z0-9]/i],
  ["netbird", /netbird|^wt[0-9]/i],
  ["nebula", /nebula/i],
  ["easytier", /easytier/i],
  ["wireguard", /wireguard|^wg[0-9]/i],
  ["tinc", /tinc/i],
  ["softether", /softether/i],
  ["twingate", /twingate|sdwan/i],
  ["hamachi", /hamachi/i],
  ["radmin", /radmin/i],
];
const GENERIC_VPN = /openvpn|^tun[0-9]|^tap[0-9]|^utun[0-9]|^ppp[0-9]|^ipsec[0-9]/i;
// Un adaptador del sistema es la LAN/WAN de casa: su IP privada no es una VPN.
const PHYSICAL_IFACE = /ethernet|wi-?fi|wlan|^eth[0-9]|^en[0-9]|^wl|^eno|^ens|^enp/i;
const VPN_RANK = new Map(VPN_PROVIDERS.map(([provider], index) => [provider, index]));
const providerOf = (name) => VPN_PROVIDERS.find(([, pattern]) => pattern.test(name))?.[0] || "";
export const normalizeAddress = (address) => String(address || "").replace(/^::ffff:/, "");
const ipv4Octets = (address) =>
  net.isIPv4(address) ? address.split(".").map((part) => Number.parseInt(part, 10)) : null;

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

const isCgnat = (address) => {
  const octets = ipv4Octets(address);
  return Boolean(octets && octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127);
};

const isRfc1918 = (address) => {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

const isPrivateVpnAddress = (address) => isRfc1918(address) || isCgnat(address);

const isSafeBindAddress = (address) => {
  if (!net.isIPv4(address)) return false;
  if (address === "0.0.0.0" || address === "255.255.255.255") return false;
  return address.startsWith("127.") || isPrivateVpnAddress(address);
};

export function probePort(port, host = config.targetHost, timeoutMs = 500) {
  return new Promise((resolve) => {
    if (!net.isIP(host)) return resolve(false);

    const request = http.request(
      { hostname: host, port, method: "GET", path: "/", timeout: timeoutMs, agent: false },
      (response) => {
        response.resume();
        resolve([200, 301, 302, 307, 308, 401, 403].includes(response.statusCode));
      }
    );

    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
    request.end();
  });
}

/**
 * Candidatas en orden de preferencia. Funcion pura: recibe `os.networkInterfaces()`.
 * Hamachi y Radmin usan rangos publicos (25/8 y 26/8): se listan como no
 * enlazables para no escuchar jamas en una direccion enrutable.
 */
export function collectVpnCandidates(interfaces) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces || {})) {
    if (!Array.isArray(addresses)) continue;
    for (const entry of addresses) {
      const isIpv4 = entry?.family === "IPv4" || entry?.family === 4;
      if (!isIpv4 || entry.internal || !entry.address) continue;
      const isPrivate = isPrivateVpnAddress(entry.address);
      const provider = providerOf(name);
      let classified;
      if (provider) {
        classified = { kind: isPrivate ? "strong" : "routable", provider, rank: VPN_RANK.get(provider) + (isPrivate ? 0 : 1000), selectable: isPrivate };
      } else if (isPrivate && GENERIC_VPN.test(name)) {
        classified = { kind: "generic", provider: "", rank: 100, selectable: true };
      } else if (isCgnat(entry.address) && !PHYSICAL_IFACE.test(name)) {
        classified = { kind: "cgnat", provider: "cgnat", rank: 200, selectable: true };
      } else {
        continue;
      }
      candidates.push({ address: entry.address, iface: name, prefix: maskToPrefix(entry.netmask), ...classified });
    }
  }
  return candidates.sort((a, b) => a.rank - b.rank || ipv4ToInt(a.address) - ipv4ToInt(b.address));
}

/**
 * Eleccion pura y testeable: recibe las interfaces del OS y no mira el entorno.
 * Sin candidata utilizable cae a loopback con `blocked: true`; nunca a la LAN.
 */
export function pickVpnAddress(interfaces, options = {}) {
  const candidates = collectVpnCandidates(interfaces);
  const override = String(options.override || "");
  const base = { candidates, ambiguous: false, rejectedOverride: false };
  if (override) {
    if (isSafeBindAddress(override)) {
      return { ...base, address: override, iface: options.overrideLabel || "DSH_BIND_HOST", prefix: 24, kind: "override", provider: "", blocked: false };
    }
    base.rejectedOverride = true;
  }
  const usable = candidates.filter(
    (candidate) =>
      candidate.selectable &&
      (candidate.kind === "strong" ||
        candidate.kind === "cgnat" ||
        (options.allowGenericVpn === true && candidate.kind === "generic"))
  );
  base.ambiguous = usable.length > 1;
  if (usable.length > 0) {
    const picked = usable[0];
    return { ...base, address: picked.address, iface: picked.iface, prefix: picked.prefix, kind: picked.kind, provider: picked.provider, blocked: false };
  }
  return { ...base, address: "127.0.0.1", iface: "loopback", prefix: 8, kind: "loopback", provider: "", blocked: true };
}

/**
 * Localiza la interfaz privada: override, VPN conocida por nombre, tun/tap
 * generico solo con DSH_ALLOW_GENERIC_VPN=1 y CGNAT de un adaptador no fisico.
 * Nunca la LAN domestica; sin candidata utilizable bloquea en loopback.
 */
export function findVpnAddress() {
  const override = config.bindHost || config.vpnIp;
  const result = pickVpnAddress(os.networkInterfaces(), {
    override,
    overrideLabel: override && override === config.bindHost ? "DSH_BIND_HOST" : "DSH_VPN_IP",
    allowGenericVpn: config.allowGenericVpn,
  });
  const ignored = result.candidates.find((candidate) => !candidate.selectable);
  if (ignored) warn("network", `Ignorando ${ignored.iface}: su IP no es privada (Hamachi/Radmin usan 25/8 y 26/8).`);
  const generic = result.candidates.find((candidate) => candidate.kind === "generic");
  if (generic && config.allowGenericVpn && result.kind === "generic") {
    warn("network", `USB VPN generica (${generic.iface}) permitida por DSH_ALLOW_GENERIC_VPN=1`);
  } else if (generic && !config.allowGenericVpn) {
    warn("network", `Ignorando ${generic.iface}: parece una VPN generica (posible VPN corporativa). Usa DSH_BIND_HOST con tu IP privada o DSH_ALLOW_GENERIC_VPN=1 si es tu red.`);
  }
  if (result.rejectedOverride) warn("network", `Direccion de enlace rechazada por politica: ${override}`);
  if (result.ambiguous) {
    const list = result.candidates.filter((candidate) => candidate.selectable).map((candidate) => `${candidate.iface}=${candidate.address}`).join(", ");
    warn("network", `Varias redes privadas (${list}): se usa ${result.iface}; fija DSH_BIND_HOST=<ip> si prefieres otra.`);
  }
  if (result.blocked) warn("network", "Bloqueo explicito: sin red privada utilizable el puente solo escucha en 127.0.0.1.");
  return result;
}

/**
 * Autorizacion de cliente cerrada: loopback, la subred real de la interfaz de
 * enlace con su mascara efectiva, o los CIDR declarados. La propia IP de enlace
 * no se autoriza por si misma: cualquier proceso local heredaria la sesion.
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
        response.on("end", () => resolve(body.includes("dsh web authentication required") || body.includes("__DSH_BOOT__")));
      }
    );

    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
    request.end();
  });
}

/**
 * P11: en Linux y macOS no habia descubrimiento dinamico y era sincrono
 * (`execSync` congelaba el event loop). Ahora hay una fuente por sistema y los
 * binarios se ejecutan con execFile asincrono; la politica no cambia.
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

/** Resuelve el puerto de Harness con cache corto y una sola sonda concurrente. */
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
