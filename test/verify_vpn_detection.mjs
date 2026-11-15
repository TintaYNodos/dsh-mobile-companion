/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Pruebas puras de deteccion de VPN: no tocan la red real ni necesitan el
 * puente. `pickVpnAddress(interfaces)` recibe una forma equivalente a
 * `os.networkInterfaces()` y no lee variables de entorno: la eleccion es pura.
 *
 *   node test/verify_vpn_detection.mjs
 */
import { pickVpnAddress } from "../src/network.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

/** Entrada IPv4 con la misma forma que devuelve `os.networkInterfaces()`. */
const ipv4 = (address, netmask = "255.255.255.0") => ({ family: "IPv4", address, netmask, internal: false });
const summary = (result) =>
  `${result.iface}/${result.address}/${result.kind} candidates=${result.candidates.length}`;

// --- Proveedores gratuitos reconocidos por nombre ---------------------------
const tailscale = pickVpnAddress({ Tailscale: [ipv4("100.101.102.103", "255.255.255.255")] });
check(
  "Tailscale (100.64/10) se elige como VPN fuerte",
  tailscale.address === "100.101.102.103" && tailscale.iface === "Tailscale" && tailscale.kind === "strong" && tailscale.provider === "tailscale",
  summary(tailscale)
);
check("Tailscale conserva la mascara /32", tailscale.prefix === 32, `prefix=${tailscale.prefix}`);

const zerotier = pickVpnAddress({ "ZeroTier One [f3797ba7a8893ec8]": [ipv4("10.147.20.5")] });
check(
  "ZeroTier (10/8) se elige como VPN fuerte",
  zerotier.address === "10.147.20.5" && zerotier.kind === "strong" && zerotier.provider === "zerotier" && zerotier.prefix === 24,
  summary(zerotier)
);

const netbird = pickVpnAddress({ wt0: [ipv4("100.64.0.7", "255.192.0.0")] });
check(
  "NetBird (wt0) se reconoce por nombre",
  netbird.address === "100.64.0.7" && netbird.kind === "strong" && netbird.provider === "netbird" && netbird.prefix === 10,
  summary(netbird)
);

const nebula = pickVpnAddress({ nebula1: [ipv4("10.42.0.2")] });
check("Nebula (nebula1) se reconoce por nombre", nebula.kind === "strong" && nebula.provider === "nebula", summary(nebula));

const easytier = pickVpnAddress({ easytier: [ipv4("10.126.126.2")] });
check("EasyTier (easytier) se reconoce por nombre", easytier.kind === "strong" && easytier.provider === "easytier", summary(easytier));

const headscale = pickVpnAddress({ tailscale0: [ipv4("100.100.100.5")] });
check(
  "Headscale usa el cliente Tailscale (tailscale0)",
  headscale.kind === "strong" && headscale.provider === "tailscale" && headscale.address === "100.100.100.5",
  summary(headscale)
);

const twingate = pickVpnAddress({ sdwan: [ipv4("100.64.0.8")] });
check("Twingate (sdwan) se reconoce por nombre", twingate.kind === "strong" && twingate.provider === "twingate", summary(twingate));

// --- La LAN domestica nunca se elige ---------------------------------------
const homeLan = pickVpnAddress({
  Ethernet: [ipv4("192.168.1.10")],
  "Wi-Fi": [ipv4("192.168.0.20")],
  "Ethernet 2": [ipv4("10.0.0.5")],
  wlan0: [ipv4("172.16.4.9")],
});
check(
  "LAN domestica (192.168/10/172.16) no es candidata",
  homeLan.address === "127.0.0.1" && homeLan.iface === "loopback" && homeLan.blocked === true && homeLan.candidates.length === 0,
  summary(homeLan)
);

const wanCgnat = pickVpnAddress({ "Ethernet 2": [ipv4("100.64.0.10")] });
check(
  "CGNAT en un adaptador fisico (WAN del ISP) no se confunde con Tailscale",
  wanCgnat.address === "127.0.0.1" && wanCgnat.candidates.length === 0,
  summary(wanCgnat)
);

const cgnatAdapter = pickVpnAddress({ "vpn0": [ipv4("100.64.0.30")] });
check(
  "CGNAT en un adaptador no fisico sin nombre conocido se acepta",
  cgnatAdapter.address === "100.64.0.30" && cgnatAdapter.kind === "cgnat" && cgnatAdapter.blocked === false,
  summary(cgnatAdapter)
);

// --- Varias candidatas: se elige una, el resto se lista ---------------------
const several = pickVpnAddress({
  "ZeroTier One [f3797ba7a8893ec8]": [ipv4("10.147.20.5")],
  Tailscale: [ipv4("100.101.102.103", "255.255.255.255")],
  wt0: [ipv4("100.64.0.7", "255.192.0.0")],
});
check(
  "Con varias candidatas se prefiere Tailscale",
  several.address === "100.101.102.103" && several.iface === "Tailscale",
  summary(several)
);
check("Con varias candidatas ambiguity=true y estan todas listadas", several.ambiguous === true && several.candidates.length === 3, summary(several));

const severalNoTailscale = pickVpnAddress({
  wt0: [ipv4("100.64.0.7")],
  "ZeroTier One [f3797ba7a8893ec8]": [ipv4("10.147.20.5")],
});
check(
  "Sin Tailscale, ZeroTier tiene prioridad sobre NetBird",
  severalNoTailscale.iface === "ZeroTier One [f3797ba7a8893ec8]" && severalNoTailscale.ambiguous === true,
  summary(severalNoTailscale)
);

// --- Sin candidatas: loopback y bloqueo explicito ---------------------------
const empty = pickVpnAddress({});
check(
  "Sin interfaces: loopback, blocked y sin candidatas",
  empty.address === "127.0.0.1" && empty.kind === "loopback" && empty.blocked === true && empty.candidates.length === 0,
  summary(empty)
);

const loopbackOnly = pickVpnAddress({
  "Loopback Pseudo-Interface 1": [{ family: "IPv4", address: "127.0.0.1", netmask: "255.0.0.0", internal: true }],
});
check("Loopback no se considera VPN", loopbackOnly.blocked === true && loopbackOnly.candidates.length === 0, summary(loopbackOnly));

// --- tun/tap generica: solo con DSH_ALLOW_GENERIC_VPN=1 --------------------
const genericOff = pickVpnAddress({ tun0: [ipv4("10.8.0.2")] });
check(
  "tun/tap generica queda bloqueada sin DSH_ALLOW_GENERIC_VPN",
  genericOff.address === "127.0.0.1" && genericOff.blocked === true && genericOff.candidates[0]?.kind === "generic",
  summary(genericOff)
);

const genericOn = pickVpnAddress({ tun0: [ipv4("10.8.0.2")] }, { allowGenericVpn: true });
check(
  "tun/tap generica se elige con DSH_ALLOW_GENERIC_VPN=1",
  genericOn.address === "10.8.0.2" && genericOn.kind === "generic" && genericOn.blocked === false,
  summary(genericOn)
);

process.env.DSH_ALLOW_GENERIC_VPN = "1";
const stillOff = pickVpnAddress({ tun0: [ipv4("10.8.0.2")] });
delete process.env.DSH_ALLOW_GENERIC_VPN;
check(
  "pickVpnAddress es pura: no lee DSH_ALLOW_GENERIC_VPN del entorno",
  stillOff.address === "127.0.0.1" && stillOff.blocked === true,
  summary(stillOff)
);

// --- Override explicito (DSH_BIND_HOST / DSH_VPN_IP) ------------------------
const override = pickVpnAddress({ Tailscale: [ipv4("100.101.102.103")] }, { override: "10.9.9.9" });
check(
  "Override privado manda sobre la deteccion",
  override.address === "10.9.9.9" && override.kind === "override" && override.blocked === false,
  summary(override)
);

const badOverride = pickVpnAddress({ Tailscale: [ipv4("100.101.102.103")] }, { override: "203.0.113.9" });
check(
  "Override publico se rechaza y se usa la deteccion",
  badOverride.rejectedOverride === true && badOverride.address === "100.101.102.103",
  summary(badOverride)
);

const allBad = pickVpnAddress({}, { override: "0.0.0.0" });
check("Override 0.0.0.0 se rechaza y cae a loopback bloqueado", allBad.rejectedOverride === true && allBad.blocked === true, summary(allBad));

// --- Hamachi y Radmin: se detectan, pero no se enlazan ----------------------
const hamachi = pickVpnAddress({ Hamachi: [ipv4("25.60.1.2")] });
check(
  "Hamachi se detecta pero no se enlaza (25/8 no es privada)",
  hamachi.address === "127.0.0.1" && hamachi.blocked === true && hamachi.candidates[0]?.kind === "routable" && hamachi.candidates[0]?.selectable === false,
  summary(hamachi)
);

const radmin = pickVpnAddress({ "Radmin VPN": [ipv4("26.1.2.3")] });
check(
  "Radmin VPN se detecta pero no se enlaza (26/8 no es privada)",
  radmin.address === "127.0.0.1" && radmin.candidates[0]?.provider === "radmin" && radmin.candidates[0]?.selectable === false,
  summary(radmin)
);

const tailscaleAndHamachi = pickVpnAddress({
  Tailscale: [ipv4("100.101.102.103")],
  Hamachi: [ipv4("25.60.1.2")],
});
check(
  "Con Tailscale y Hamachi gana Tailscale y Hamachi queda listada",
  tailscaleAndHamachi.iface === "Tailscale" && tailscaleAndHamachi.candidates.length === 2,
  summary(tailscaleAndHamachi)
);

const publicZeroTier = pickVpnAddress({ "ZeroTier One [abc]": [ipv4("203.0.113.5")] });
check(
  "Nunca se enlaza una IP publica aunque el nombre sea de VPN",
  publicZeroTier.address === "127.0.0.1" && publicZeroTier.blocked === true && publicZeroTier.candidates[0]?.selectable === false,
  summary(publicZeroTier)
);

// --- Entradas no IPv4 ------------------------------------------------------
const ipv6Only = pickVpnAddress({
  Tailscale: [{ family: "IPv6", address: "fd7a:115c:a1e0::1", netmask: "ffff:ffff:ffff:ffff::", internal: false }],
  Ethernet: [ipv4("192.168.1.20")],
});
check("Una interfaz solo IPv6 no cuenta como candidata", ipv6Only.blocked === true && ipv6Only.candidates.length === 0, summary(ipv6Only));

const failed = checks.filter((ok) => !ok).length;
console.log(`\nRESULTADO: ${checks.length - failed}/${checks.length}`);
if (failed > 0) process.exitCode = 1;
