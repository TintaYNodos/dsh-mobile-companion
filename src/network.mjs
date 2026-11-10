import http from "node:http";
import os from "node:os";
import net from "node:net";
import { execSync } from "node:child_process";

export function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[DSH-Bridge ${ts}] ${msg}`);
}

export function probePort(port, host = "127.0.0.1", timeout = 800) {
  return new Promise((resolve) => {
    if (!net.isIP(host) || !port || isNaN(port)) return resolve(false);
    const req = http.request(
      { hostname: host, port, method: "GET", path: "/", timeout },
      (res) => {
        resolve([200, 301, 302, 401, 403].includes(res.statusCode));
        res.resume();
      }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

/**
 * Escanea dinamicamente los puertos activos de DeepSeek Harness en Windows
 * mediante netstat para resolver el puerto efimero de la Web GUI al vuelo.
 */
export async function scanActiveDshPort(currentPort = 52710) {
  // 1. Probar el puerto actual
  if (await probePort(currentPort)) return currentPort;

  // 2. Escanear puertos escuchando en 127.0.0.1 con netstat
  try {
    const stdout = execSync("netstat -ano", { encoding: "utf8", timeout: 2500 });
    const lines = stdout.split("\n");
    const candidatePorts = [];

    for (const line of lines) {
      if (line.includes("LISTENING") && line.includes("127.0.0.1:")) {
        const match = line.match(/127\.0\.0\.1:(\d+)\s+/);
        if (match && match[1]) {
          const p = parseInt(match[1], 10);
          // Filtrar puertos tipicos efimeros de DSH Web (50000 - 65500)
          if (p >= 50000 && p <= 65500 && p !== 57420) {
            candidatePorts.push(p);
          }
        }
      }
    }

    for (const port of candidatePorts) {
      if (await probePort(port)) {
        log(`Detectado Web GUI de DSH dinamicamente en puerto: ${port}`);
        return port;
      }
    }
  } catch (err) {
    // Si netstat falla, fallback a sondeo de rango comun
  }

  // 3. Fallback a lista estatica de candidatos
  const commonCandidates = [52710, 59189, 58324, 51455, 52049, 52449, 57421];
  for (const p of commonCandidates) {
    if (await probePort(p)) {
      log(`Detectado Web GUI de DSH en puerto de respaldo: ${p}`);
      return p;
    }
  }

  return currentPort;
}

export function findVpnIp() {
  const envIp = process.env.DSH_VPN_IP;
  if (envIp) {
    if (net.isIPv4(envIp) && envIp !== "0.0.0.0") {
      return { ip: envIp, iface: "env" };
    }
  }

  const ifaces = os.networkInterfaces();
  const isIpv4 = (a) =>
    (a.family === "IPv4" || a.family === 4) &&
    !a.internal &&
    !a.address.startsWith("169.254.") &&
    a.address !== "0.0.0.0";

  // 1. Interfaces con nombre de VPN
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/zerotier|tailscale|^zt|^ts|wireguard|^wg|openvpn/i.test(name) && addrs) {
      for (const a of addrs) {
        if (isIpv4(a)) return { ip: a.address, iface: name };
      }
    }
  }

  // 2. CGNAT Tailscale
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs) {
      for (const a of addrs) {
        if (isIpv4(a) && a.address.startsWith("100.")) {
          const second = Number(a.address.split(".")[1]);
          if (second >= 64 && second <= 127) return { ip: a.address, iface: name };
        }
      }
    }
  }

  // 3. Subred ZeroTier tipica (10.x.x.x)
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs) {
      for (const a of addrs) {
        if (isIpv4(a) && a.address.startsWith("10.")) {
          return { ip: a.address, iface: name };
        }
      }
    }
  }

  return { ip: "127.0.0.1", iface: "loopback" };
}

export function isClientAuthorized(remoteAddress, bindIp) {
  if (!remoteAddress) return false;
  const cleanIp = remoteAddress.replace(/^.*:/, "");

  if (cleanIp === "127.0.0.1" || cleanIp === bindIp) return true;

  if (cleanIp.startsWith("100.")) {
    const second = Number(cleanIp.split(".")[1]);
    if (second >= 64 && second <= 127) return true;
  }

  if (cleanIp.startsWith("10.")) return true;

  if (bindIp === "127.0.0.1") return cleanIp === "127.0.0.1";

  return true;
}
