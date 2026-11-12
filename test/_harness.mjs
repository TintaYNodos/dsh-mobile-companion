import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Utilidades compartidas por las pruebas.
 * El host y el puerto se toman del entorno para no depender de una IP concreta.
 */
export const HOST = process.env.DSH_TEST_HOST || "10.173.252.87";
export const PORT = Number(process.env.DSH_TEST_PORT || 57420);

/** Clave de acceso efectiva: variable de entorno o archivo generado por el puente. */
export function accessKey() {
  const fromEnv = String(process.env.DSH_ACCESS_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(path.join(os.homedir(), ".dsh", "companion-access-key"), "utf8").trim();
  } catch {
    return "";
  }
}

export function authHeader(key = accessKey()) {
  if (!key) return {};
  return { authorization: `Basic ${Buffer.from(`dsh:${key}`, "utf8").toString("base64")}` };
}
