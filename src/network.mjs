import http from "node:http";
import os from "node:os";

export function log(msg) {
  const ts = new Date().toISOString().replace("T", " ").substring(0, 19);
  console.log(`[DSH-Bridge ${ts}] ${msg}`);
}

export function probePort(port, host = "127.0.0.1", timeout = 1200) {
  return new Promise((resolve) => {
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

export function findVpnIp() {
  if (process.env.DSH_VPN_IP) {
    return { ip: process.env.DSH_VPN_IP, iface: "env" };
  }
  const ifaces = os.networkInterfaces();
  const isIpv4 = (a) => (a.family === "IPv4" || a.family === 4) && !a.internal && !a.address.startsWith("169.254.");

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/zerotier|tailscale|^zt|^ts|wireguard|^wg|openvpn/i.test(name) && addrs) {
      for (const a of addrs) {
        if (isIpv4(a)) return { ip: a.address, iface: name };
      }
    }
  }

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
