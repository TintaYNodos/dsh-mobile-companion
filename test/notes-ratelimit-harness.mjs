/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Regresion 5.3.4 del limitador de /dsh-companion/notes.
 *
 * Se prueba en un puente AISLADO con los limites POR DEFECTO (30 POST y 120 GET
 * de rafaga, recarga de fichas). El puente de verify_notes sube el cupo de
 * escritura porque sus regresiones H-13/H-18/H-20 hacen rafagas de 100 POST
 * concurrentes a proposito: sin ese override confundirian concurrencia del
 * almacen con el limitador. Vive aqui para que verify_notes.mjs no pase del
 * tope de 400 lineas por archivo.
 */
import { startBridge } from "./ci/start-bridge.mjs";
import { createNotesClient, request, sleep } from "./notes-harness.mjs";

const countStatus = (results, status) => results.filter((res) => res.status === status).length;

export async function runRateLimitChecks(check) {
  const bridge = await startBridge();
  const client = createNotesClient(bridge);
  try {
    // 1. Rafaga de 40 POST: el cubo de 30 se agota y el resto recibe 429.
    const burst = [];
    for (let index = 0; index < 40; index += 1) {
      burst.push(await client.postNote({ title: `Rafaga ${index}`, body: "x" }));
    }
    for (const res of burst) client.remember(res.json?.file);
    const okCount = countStatus(burst, 200);
    const limited = burst.filter((res) => res.status === 429);
    const retry = limited.map((res) => Number(res.headers["retry-after"]));
    check("5.3.4 notas: 40 POST seguidos ya no pasan todos (200 acotados + 429 con Retry-After)",
      okCount >= 20 && okCount < 40 && limited.length > 0 &&
        retry.every((value) => Number.isInteger(value) && value >= 1),
      `ok=${okCount} 429=${limited.length} retry=${[...new Set(retry)].join(",") || "-"}`);

    // 2. El resto del servicio sigue funcionando: GET y /status tienen su propio cubo.
    const read = await client.getNotes();
    const status = await request(bridge.bridgePort, "/dsh-companion/status", { headers: client.authHeader() });
    check("5.3.4 notas: GET /notes y /status siguen respondiendo tras agotar el cubo de POST",
      read.status === 200 && Array.isArray(read.json?.notes) && status.status === 200,
      `GET=${read.status} status=${status.status}`);

    // 3. El cupo de lectura tambien existe: 130 GET seguidos superan la rafaga de 120.
    const reads = [];
    for (let index = 0; index < 130; index += 1) reads.push(await client.getNotes());
    const readLimited = countStatus(reads, 429);
    check("5.3.4 notas: la rafaga de 130 GET devuelve 429 (cupo de lectura separado)",
      readLimited > 0 && readLimited <= 20, `429=${readLimited}`);

    // 4. Recuperacion: la recarga devuelve el servicio sin reiniciar el puente
    //    (POST 0,5 fichas/s; 2,6 s dan mas de una ficha).
    await sleep(2600);
    const after = await client.postNote({ title: "Recuperada tras el limite", body: "ok" });
    client.remember(after.json?.file);
    const readAfter = await client.getNotes();
    check("5.3.4 notas: tras la recarga POST y GET vuelven a responder 200 (servicio se recupera)",
      after.status === 200 && after.json?.ok === true && readAfter.status === 200,
      `POST=${after.status} GET=${readAfter.status}`);
  } finally {
    await bridge.stop();
  }
}
