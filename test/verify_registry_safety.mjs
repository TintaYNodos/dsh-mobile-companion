import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { HOST, PORT } from "./_harness.mjs";

const registryPath = path.join(os.homedir(), ".dsh", "companion-devices.json");
const bridge = { host: HOST, port: PORT };

const call = (pathname, headers = {}) =>
  new Promise((resolve) => {
    const req = http.request({ hostname: bridge.host, port: bridge.port, path: pathname, agent: false, headers, timeout: 8000 }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => { req.destroy(); resolve(0); });
    req.end();
  });

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

const valid = {
  devices: [
    {
      id: "dispositivo-importante",
      name: "Teléfono",
      address: "10.9.9.9",
      agent: "Pixel",
      approvedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      lastRefresh: new Date().toISOString(),
      claimed: true,
    },
  ],
  pending: [],
  history: [],
  denied: [],
};

// 1. Registro sano: el puente lo lee.
fs.writeFileSync(registryPath, JSON.stringify(valid, null, 2));
await call("/dsh-companion/status", { "user-agent": "prueba" });

// 2. Se corrompe el archivo y llega una petición del teléfono.
fs.writeFileSync(registryPath, '{"devices":[{"id":"dispo');
await call("/dsh-companion/status", { "user-agent": "prueba" });
await call("/", { accept: "text/html", "sec-fetch-dest": "document", "user-agent": "prueba" });

const afterCorrupt = fs.readFileSync(registryPath, "utf8");
check("un registro ilegible no se sobrescribe", afterCorrupt.startsWith('{"devices":[{"id":"dispo'), afterCorrupt.slice(0, 40));

// 3. Al reparar el archivo, el dispositivo sigue ahí y vuelve a leerse.
fs.writeFileSync(registryPath, JSON.stringify(valid, null, 2));
await call("/dsh-companion/status", { "user-agent": "prueba" });

const repaired = JSON.parse(fs.readFileSync(registryPath, "utf8"));
check("el dispositivo sobrevive al ciclo", repaired.devices.some((d) => d.id === "dispositivo-importante"), `${repaired.devices.length} dispositivo(s)`);

// 4. Archivo ausente: debe poder crear uno nuevo.
fs.unlinkSync(registryPath);
const status = await call("/dsh-companion/status", { "user-agent": "prueba" });
check("sin archivo el puente sigue respondiendo", status === 200, `status=${status}`);

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length}`);
if (checks.some((c) => !c)) process.exitCode = 1;
