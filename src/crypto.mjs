import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function loadSecret() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const credPath = path.join(dshHome, ".credentials.yaml");
  if (!fs.existsSync(credPath)) {
    throw new Error(`No se encontro el archivo de credenciales en ${credPath}`);
  }
  const content = fs.readFileSync(credPath, "utf8");
  const match = content.match(/client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]+)/);
  if (!match || !match[1]) {
    throw new Error("No se pudo extraer el secreto browser-session de .credentials.yaml");
  }
  return match[1].trim();
}

const rawSecret = loadSecret();
const secret = Buffer.from(rawSecret, "base64url");

let cachedAuthority = "";
let cachedCookie = "";
let cookieExpiresAt = 0;

export function getAuthority(host, port) {
  return `${host}:${port}`;
}

export function getValidCookie(authority) {
  const now = Date.now();
  if (cachedCookie && now < cookieExpiresAt && cachedAuthority === authority) {
    return cachedCookie;
  }
  cachedAuthority = authority;
  const cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
  const cookieName = `dsh-auth-${cookieHash}`;
  const issuedAt = now;
  const expiresAt = issuedAt + 7 * 24 * 3600 * 1000;
  const payload = { version: 1, authority, issuedAt, expiresAt };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest().toString("base64url");
  cachedCookie = `${cookieName}=v1.${body}.${sig}`;
  cookieExpiresAt = expiresAt - 3600 * 1000;
  return cachedCookie;
}

export function injectAuthHeaders(headers, authority) {
  const newHeaders = { ...headers };
  newHeaders["host"] = authority;
  if (newHeaders["origin"]) newHeaders["origin"] = `http://${authority}`;
  if (newHeaders["referer"]) newHeaders["referer"] = `http://${authority}/`;

  const authCookie = getValidCookie(authority);
  const cookieHash = crypto.createHash("sha256").update(authority).digest().toString("base64url");
  const cookieName = `dsh-auth-${cookieHash}`;

  if (newHeaders["cookie"]) {
    const cookies = newHeaders["cookie"]
      .split(";")
      .map((c) => c.trim())
      .filter((c) => !c.startsWith(`${cookieName}=`));
    cookies.push(authCookie);
    newHeaders["cookie"] = cookies.join("; ");
  } else {
    newHeaders["cookie"] = authCookie;
  }
  return newHeaders;
}
