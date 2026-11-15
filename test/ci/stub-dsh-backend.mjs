/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Backend DeepSeek Harness mínimo para CI.
 *
 * Las pruebas del puente que piden "/" (inyección móvil, proxy, emparejamiento)
 * necesitan un upstream HTTP que devuelva un documento HTML y una hoja de
 * estilos. CI no tiene DeepSeek Harness, así que aquí se levanta un doble de
 * pruebas: SOLO imita la forma externa mínima que el puente consume (cabecera
 * HTML con `</head>`, viewport, manifiesto y un CSS en /assets). No se prueba
 * compatibilidad real con DSH: eso sigue siendo trabajo de la suite manual
 * contra una instalación de verdad (ver test/README.md).
 *
 * El marcador `__DSH_BOOT__` es el que usa src/network.mjs para reconocer un
 * puerto como backend de DSH y no reasignarlo.
 */
import http from "node:http";

const CSS_BODY = `
:root {
  --bg: #151517;
  --fg: #f5f5f4;
  --muted: #a1a1aa;
  --accent: #fcd34d;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; min-height: 100vh; }
#root { display: flex; flex-direction: column; min-height: 100vh; }
.dsh-stub-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
.dsh-stub-header h1 { font-size: 18px; font-weight: 600; margin: 0; }
.dsh-stub-main { flex: 1 1 auto; display: flex; flex-direction: column; gap: 12px; padding: 20px; }
.dsh-stub-card { border: 1px solid #2a2a2e; border-radius: 12px; padding: 16px; background: #1b1b1f; }
.dsh-stub-card p { margin: 0 0 8px; color: var(--muted); line-height: 1.5; }
.dsh-stub-composer { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid #2a2a2e; }
.dsh-stub-composer textarea { flex: 1 1 auto; min-height: 44px; resize: vertical; border-radius: 10px; border: 1px solid #2a2a2e; background: #101013; color: var(--fg); padding: 10px; }
.dsh-stub-composer button { border: 0; border-radius: 10px; padding: 0 16px; background: var(--accent); color: #111; font-weight: 600; cursor: pointer; }
@media (max-width: 599px) { .dsh-stub-header { padding: 12px; } .dsh-stub-main { padding: 12px; } }
@media (min-width: 600px) { .dsh-stub-main { max-width: 860px; margin: 0 auto; width: 100%; } }
`;

const HTML_BODY = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>DSH CI stub</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="manifest" href="/companion.webmanifest">
<link rel="stylesheet" href="/assets/dsh-stub.css">
</head>
<body>
<!-- __DSH_BOOT__: marcador mínimo que identifica este upstream como backend DSH -->
<div id="root">
<header class="dsh-stub-header"><h1>DeepSeek Harness (doble de CI)</h1></header>
<main class="dsh-stub-main">
<section class="dsh-stub-card"><p>Documento simulado para ejercitar el proxy y la inyección del puente.</p></section>
<section class="dsh-stub-card"><p>No hay sesión real ni backend real en CI.</p></section>
</main>
<div class="dsh-stub-composer"><textarea placeholder="Escribe un mensaje"></textarea><button type="button">Enviar</button></div>
</div>
</body>
</html>
`;

const stub = () => http.createServer((req, res) => {
  let pathname = "/";
  try {
    pathname = new URL(String(req.url || "/"), "http://stub.invalid").pathname;
  } catch {
    pathname = "/";
  }

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(HTML_BODY);
    return;
  }

  if (pathname.endsWith(".css")) {
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" });
    res.end(CSS_BODY);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end('{"error":"ruta no simulada"}');
});

/**
 * Levanta el doble en `host:port` y devuelve `{ url, close }`.
 * El cierre espera a que el servidor suelte el puerto.
 */
export function startStubDsh({ port, host = "127.0.0.1" }) {
  const server = stub();
  server.on("error", () => {
    // Tras `listen` los errores ya se notifican por la promesa; aquí solo se
    // evita que un error tardío tumbe el proceso del runner.
  });

  return new Promise((resolve, reject) => {
    const onListenError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onListenError);
      resolve({
        host,
        port,
        url: `http://${host}:${port}`,
        close: () =>
          new Promise((done) => {
            if (!server.listening) {
              done();
              return;
            }
            server.close(() => done());
            if (typeof server.closeAllConnections === "function") server.closeAllConnections();
          }),
      });
    };
    server.once("error", onListenError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}
