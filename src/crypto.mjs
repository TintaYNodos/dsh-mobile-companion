import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let cachedSecret = null;
const cookieCache = new Map();

export function timingSafeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function loadSecret() {
  if (cachedSecret) return cachedSecret;

  const dshHome = process.env.DSH_HOME || (process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, ".dsh")
    : path.join(os.homedir(), ".dsh"));

  const credPath = path.join(dshHome, ".credentials.yaml");
  if (!fs.existsSync(credPath)) {
    throw new Error(`Credenciales DSH no encontradas en: ${credPath}`);
  }

  const content = fs.readFileSync(credPath, "utf8");
  const match = content.match(/client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]{16,})/);
  if (!match || !match[1]) {
    throw new Error("Secreto browser-session invalido o ausente en .credentials.yaml");
  }

  cachedSecret = Buffer.from(match[1].trim(), "base64url");
  return cachedSecret;
}

export function getAuthority(host, port) {
  const cleanHost = String(host).replace(/[^a-zA-Z0-9.-]/g, "");
  const cleanPort = parseInt(port, 10);
  return `${cleanHost}:${cleanPort}`;
}

export function getValidCookie(authority) {
  const now = Date.now();
  const cached = cookieCache.get(authority);

  // Reusar cookie en cache con margen de seguridad de 5 minutos contra clock-skew
  if (cached && now < cached.expiresAt - 300_000) {
    return cached.cookie;
  }

  const secret = loadSecret();
  const cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
  const cookieName = `dsh-auth-${cookieHash}`;
  const issuedAt = now;
  const expiresAt = issuedAt + 12 * 3600 * 1000; // 12 horas TTL endurecido

  const payload = { version: 1, authority, issuedAt, expiresAt };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest().toString("base64url");
  const cookie = `${cookieName}=v1.${body}.${sig}`;

  cookieCache.set(authority, { cookie, expiresAt });
  return cookie;
}

export function injectAuthHeaders(headers, authority) {
  const newHeaders = { ...headers };
  newHeaders["host"] = authority;
  if (newHeaders["origin"]) newHeaders["origin"] = `http://${authority}`;
  if (newHeaders["referer"]) newHeaders["referer"] = `http://${authority}/`;

  const authCookie = getValidCookie(authority);
  const cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
  const cookieName = `dsh-auth-${cookieHash}`;

  const existingCookie = String(newHeaders["cookie"] || "");
  const cookies = existingCookie
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith(`${cookieName}=`));

  cookies.push(authCookie);
  newHeaders["cookie"] = cookies.join("; ");
  return newHeaders;
}

export function verifyCompanionToken(req) {
  const expectedToken = process.env.DSH_COMPANION_TOKEN;
  if (!expectedToken) return true; // Modo transparente para VPN cerrada
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  return timingSafeCompare(authHeader.slice(7).trim(), expectedToken);
}
