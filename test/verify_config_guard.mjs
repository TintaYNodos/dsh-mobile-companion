/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Guardas de configuración que se evalúan al importar `src/config.mjs` y
 * `src/http.mjs`. No necesita el puente ni el puerto 57420: arranca procesos
 * hijos con el entorno alterado y llama a las funciones puras.
 *
 *   node test/verify_config_guard.mjs
 *
 * 1. `DSH_ACCESS_DISABLE` solo acepta `1` (desactivar) o `0`/vacío (mantener).
 *    Cualquier otro valor detiene el arranque con un mensaje que lo nombra.
 * 2. `DSH_ALLOWED_HOSTS` añade nombres DNS estables: un `Host`/`Origin` de esa
 *    lista pasa la frontera de origen y uno ajeno se rechaza.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const NODE = process.execPath;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

/** Ejecuta un módulo ES efímero con el entorno indicado, sin tocar el real. */
function runEsm(code, env = {}) {
  return spawnSync(NODE, ["--input-type=module", "-e", code], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, ...env },
  });
}

// 1. DSH_ACCESS_DISABLE: un valor que nadie interpretaría como "desactivar"
//    debe detener el arranque en vez de ignorarse en silencio.
const importConfig = "await import('./src/config.mjs'); console.log('import ok');";
const invalid = runEsm(importConfig, { DSH_ACCESS_DISABLE: "true" });
check(
  "DSH_ACCESS_DISABLE=true detiene el arranque",
  invalid.status !== 0 && /DSH_ACCESS_DISABLE/.test(String(invalid.stderr)),
  `exit=${invalid.status}`
);

for (const value of ["0", "1"]) {
  const accepted = runEsm(importConfig, { DSH_ACCESS_DISABLE: value });
  check(`DSH_ACCESS_DISABLE=${value} importa sin error`, accepted.status === 0, `exit=${accepted.status}`);
}

// 2. DSH_ALLOWED_HOSTS: el nombre DNS configurado pasa la validación de
//    Host/Origin; cualquier host ajeno sigue rechazado.
const hostProbe = `
const { config } = await import('./src/config.mjs');
const { isSameOriginRequest } = await import('./src/http.mjs');
const port = config.listenPort;
const allowedHosts = new Set(['127.0.0.1:' + port]);
const allowedOrigins = new Set(['http://127.0.0.1:' + port]);
const probe = (host, headers = {}) =>
  isSameOriginRequest({ headers: { host, ...headers } }, allowedOrigins, allowedHosts);
const alias = String(process.env.DSH_ALLOWED_HOSTS || '').split(',')[0].trim().toLowerCase();
console.log(JSON.stringify({
  ownHost: probe(alias + ':' + port),
  ownOrigin: probe(alias + ':' + port, { origin: 'http://' + alias + ':' + port }),
  ownOriginPortless: probe(alias + ':' + port, { origin: 'http://' + alias }),
  foreignHost: probe('evil.example:' + port),
  foreignOrigin: probe(alias + ':' + port, { origin: 'http://evil.example' })
}));
`;
const hostRun = runEsm(hostProbe, { DSH_ALLOWED_HOSTS: "pc.tailnet-xyz.ts.net" });
let host = {};
try {
  host = JSON.parse(String(hostRun.stdout).trim().split(/\r?\n/).pop());
} catch {
  host = {};
}
check("DSH_ALLOWED_HOSTS: Host propio aceptado", hostRun.status === 0 && host.ownHost === true, `exit=${hostRun.status}`);
check("DSH_ALLOWED_HOSTS: Origin propio aceptado", host.ownOrigin === true);
check("DSH_ALLOWED_HOSTS: Origin propio sin puerto aceptado", host.ownOriginPortless === true);
check("DSH_ALLOWED_HOSTS: Host ajeno rechazado", host.foreignHost === false);
check("DSH_ALLOWED_HOSTS: Origin ajeno rechazado", host.foreignOrigin === false);

const failed = results.filter((result) => !result.ok);
console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} pruebas correctas`);
if (failed.length) process.exitCode = 1;
