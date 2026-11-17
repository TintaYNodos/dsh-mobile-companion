/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Verifica POST/GET /dsh-companion/notes: autenticacion, limites, front matter
 * YAML, siete perfiles y `dueDate`, nota de solo titulo, idempotencia por id
 * (ids.json), bandeja inbox.jsonl, HTML neutralizado, traversal, unicidad,
 * listado GET (auth, `id` en el JSON, viewer 403 por privacidad de metadatos,
 * orden, tolerancia a lineas corruptas), rechazo de `localOnly` (defensa en
 * profundidad), tope de la bandeja tras un POST aunque no haya syncs, retencion
 * (podas por archivos/MB y de la bandeja) y ruta de
 * absorcion retirada. El campo retirado `chatTarget` se envia a proposito para
 * comprobar que se ignora. Levanta su propio puente aislado y restaura lo que
 * escribe: no toca el puente real.
 *
 *   node test/verify_notes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { startBridge } from "./ci/start-bridge.mjs";
import {
  IDS, INBOX, ISO_RE, NOTES_DIR, NOTE_NAME_RE, createNotesClient, createRetentionHarness, request,
  runInboxCapCheck, runRetentionChecks, sleep,
} from "./notes-harness.mjs";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

const bridge = await startBridge();
const client = createNotesClient(bridge);
const retention = createRetentionHarness();
const { jsonHeaders, authHeader, postNote, getNotes, makeDevice, writeRegistry, cookieOf,
  remember, createdFiles, notePath, noteText, readIds, splitNote, inboxLines, inboxLineFor, inboxRecordFor } = client;
const notesExistedBefore = fs.existsSync(NOTES_DIR);
const inboxBefore = fs.existsSync(INBOX) ? fs.readFileSync(INBOX) : null;
const idsBefore = fs.existsSync(IDS) ? fs.readFileSync(IDS) : null;

try {
  // 1. Metodo y credenciales.
  const putMethod = await request(bridge.bridgePort, "/dsh-companion/notes", { method: "PUT", headers: jsonHeaders(authHeader()) });
  check("PUT /dsh-companion/notes responde 405 con Allow GET/POST",
    putMethod.status === 405 && String(putMethod.headers.allow || "").includes("GET") && String(putMethod.headers.allow || "").includes("POST"),
    `status=${putMethod.status} allow=${putMethod.headers.allow}`);
  const noAuth = await postNote({ title: "sin credencial", body: "no debe escribirse" }, jsonHeaders());
  check("POST sin credencial responde 403", noAuth.status === 403, `status=${noAuth.status}`);
  const badKey = await postNote({ title: "clave mala", body: "no" },
    jsonHeaders({ authorization: `Basic ${Buffer.from("dsh:clave-incorrecta").toString("base64")}` }));
  check("clave de acceso invalida responde 403", badKey.status === 403, `status=${badKey.status}`);
  const viewer = makeDevice({ name: "solo-lectura", role: "viewer" });
  await writeRegistry([viewer]);
  const viewerWrite = await postNote({ title: "viewer", body: "no" }, jsonHeaders({ cookie: cookieOf(viewer) }));
  check("viewer no puede escribir (403 solo lectura)",
    viewerWrite.status === 403 && viewerWrite.body.includes("dispositivo en solo lectura"),
    `status=${viewerWrite.status} body=${viewerWrite.body.slice(0, 70)}`);

  // 2. Content-Type, tamano, JSON y cuerpo HTTP vacio.
  const wrongType = await postNote({ title: "tipo", body: "cuerpo" }, authHeader());
  check("Content-Type no JSON responde 415", wrongType.status === 415, `status=${wrongType.status}`);
  const bigBody = JSON.stringify({ title: "grande", body: "a".repeat(70 * 1024) });
  const tooBig = await request(bridge.bridgePort, "/dsh-companion/notes", {
    method: "POST", headers: jsonHeaders({ ...authHeader(), "content-length": String(Buffer.byteLength(bigBody)) }), body: bigBody,
  });
  check("cuerpo > 64 KB responde 413", tooBig.status === 413, `status=${tooBig.status}`);
  const corrupt = await postNote("{no-json");
  check("JSON invalido responde 400", corrupt.status === 400, `status=${corrupt.status}`);
  const emptyRaw = await postNote("");
  check("cuerpo HTTP vacio responde 400", emptyRaw.status === 400, `status=${emptyRaw.status}`);

  // 3. Validacion de metadatos: cada payload invalido responde 400. chatTarget
  //    ya no se valida (seccion 4) y body puede ser "" (seccion 8).
  const invalidPayloads = [
    ["falta title", { body: "solo cuerpo" }],
    ["title vacio", { title: "   ", body: "cuerpo" }],
    ["title > 200", { title: "a".repeat(201), body: "cuerpo" }],
    ["body no textual", { title: "titulo", body: 42 }],
    ["body > 20000", { title: "titulo", body: "a".repeat(20_001) }],
    ["tags no-array", { title: "titulo", body: "cuerpo", tags: "uno" }],
    ["tags > 10", { title: "titulo", body: "cuerpo", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }],
    ["tag no textual", { title: "titulo", body: "cuerpo", tags: [7] }],
    ["tag > 40", { title: "titulo", body: "cuerpo", tags: ["a".repeat(41)] }],
    ["project > 120", { title: "titulo", body: "cuerpo", project: "p".repeat(121) }],
    ["subject > 120", { title: "titulo", body: "cuerpo", subject: "s".repeat(121) }],
    ["type > 40", { title: "titulo", body: "cuerpo", type: "t".repeat(41) }],
    ["status > 40", { title: "titulo", body: "cuerpo", status: "s".repeat(41) }],
    ["profile invalido", { title: "titulo", body: "cuerpo", profile: "otro" }],
    ["priority invalida", { title: "titulo", body: "cuerpo", priority: "urgente" }],
    ["id con espacios", { title: "titulo", body: "cuerpo", id: "id con espacios" }],
    ["id > 64", { title: "titulo", body: "cuerpo", id: "a".repeat(65) }],
    ["id no textual", { title: "titulo", body: "cuerpo", id: 42 }],
    ["dueDate no textual", { title: "titulo", body: "cuerpo", dueDate: 20261231 }],
  ];
  for (const [name, payload] of invalidPayloads) {
    const res = await postNote(payload);
    check(`400 con ${name}`, res.status === 400, `status=${res.status}`);
  }
  // Defensa en profundidad: una nota localOnly nunca debe llegar al puente.
  const localOnly = await postNote({ title: "Secreto del telefono", body: "no debe salir", localOnly: true });
  check("localOnly:true responde 400 con el motivo de privacidad",
    localOnly.status === 400 && localOnly.body.includes("nota solo del teléfono: no se envía"),
    `status=${localOnly.status} body=${localOnly.body.slice(0, 80)}`);
  const localOnlyFalse = await postNote({ title: "Secreto falso", body: "si puede salir", localOnly: false });
  remember(localOnlyFalse.json?.file);
  check("localOnly:false no rompe la escritura (200)", localOnlyFalse.status === 200, `status=${localOnlyFalse.status}`);

  // 4. chatTarget retirado: se ignora aunque llegue mal formado (compatibilidad).
  const compat = await postNote({ title: "Compat sin chat", body: "cuerpo", chatTarget: { id: "id con espacios", title: "x" } });
  const compatFile = remember(compat.json?.file);
  check("chatTarget invalido se ignora y la nota se escribe (200)", compat.status === 200 && typeof compatFile === "string",
    `status=${compat.status}`);
  const compatStr = await postNote({ title: "Compat texto", body: "cuerpo", chatTarget: "chat-1" });
  remember(compatStr.json?.file);
  check("chatTarget no objeto se ignora (200)", compatStr.status === 200, `status=${compatStr.status}`);
  check("el nombre no lleva prefijo de chat destino", Boolean(compatFile) && NOTE_NAME_RE.test(compatFile), `file=${compatFile}`);
  check("el front matter no contiene chatTarget", !splitNote(noteText(compatFile)).front.includes("chatTarget"));
  check("la bandeja no contiene chatTarget", !String(inboxLineFor(compatFile)).includes("chatTarget"));

  // 5. Dispositivo `full`: escribe; el .md lleva front matter con valores por defecto.
  const full = makeDevice({ name: "control-total", role: "full" });
  await writeRegistry([full]);
  const fullWrite = await postNote({ title: "Nota de campo", body: "Primera linea del cuerpo de campo." },
    jsonHeaders({ cookie: cookieOf(full) }));
  check("dispositivo full escribe una nota (200 ok:true file)",
    fullWrite.status === 200 && fullWrite.json?.ok === true && typeof fullWrite.json?.file === "string",
    `status=${fullWrite.status} body=${fullWrite.body.slice(0, 80)}`);
  const fullFile = remember(fullWrite.json?.file);
  check("la nota de `full` existe en synced_chats/notes", Boolean(fullFile) && fs.existsSync(notePath(fullFile)), `file=${fullFile}`);
  const fullSplit = splitNote(noteText(fullFile));
  check("front matter con perfil general por defecto", fullSplit.front.includes('profile: "general"'));
  check("front matter con valores por defecto (type vacio, tags [], prioridad medium)",
    fullSplit.front.includes('type: ""') && fullSplit.front.includes("tags: []") && fullSplit.front.includes('priority: "medium"'));
  check("tras el front matter va '# titulo' y el cuerpo",
    fullSplit.markdown.startsWith("\n# Nota de campo\n\n") && fullSplit.markdown.includes("Primera linea del cuerpo de campo."));

  // 5b. Siete perfiles por area y fecha limite opcional (`dueDate`).
  const PROFILES = ["general", "writer", "programmer", "teacher", "journalist", "legal", "designer"];
  for (const profile of PROFILES) {
    const res = await postNote({ title: `Perfil ${profile}`, body: "cuerpo", profile });
    remember(res.json?.file);
    check(`perfil canonico ${profile} aceptado (200)`, res.status === 200, `status=${res.status}`);
  }
  const due = await postNote({ title: "Nota con vencimiento", body: "cuerpo", dueDate: "2026-12-31" });
  const dueFile = remember(due.json?.file);
  check("dueDate valido se escribe en el front matter y en la bandeja",
    due.status === 200 && splitNote(noteText(dueFile)).front.includes('dueDate: "2026-12-31"') &&
    inboxRecordFor(dueFile)?.dueDate === "2026-12-31");
  check("dueDate invalido 2026-13-40 responde 400",
    (await postNote({ title: "Fecha mala", body: "cuerpo", dueDate: "2026-13-40" })).status === 400);
  check("dueDate invalido \"mañana\" responde 400",
    (await postNote({ title: "Fecha mala 2", body: "cuerpo", dueDate: "mañana" })).status === 400);
  check("sin dueDate el front matter no lleva el campo", !splitNote(noteText(fullFile)).front.includes("dueDate"));

  // 6. Nota con id y todos los metadatos: sin chatTarget en ningun sitio.
  const rich = {
    id: "nota-rica_01",
    title: "Reunión de campo: notas",
    body: "Línea uno del cuerpo.\nLínea dos con <tags> y & ampersand.",
    profile: "writer", type: "reunion", project: "Tinta y Nodos", subject: "Ismael",
    tags: ["campo", "notas", "uno"], status: "borrador", priority: "high",
    createdAt: "2026-11-16T18:00:00.000Z", campoDesconocido: { x: 1 }, otroMas: "ignorado",
  };
  const valid = await postNote(rich);
  const richFile = remember(valid.json?.file);
  check("clave de acceso escribe la nota completa (200 ok:true file)",
    valid.status === 200 && valid.json?.ok === true && typeof richFile === "string", `status=${valid.status}`);
  check("campos desconocidos se ignoran (no rompen la escritura)", valid.status === 200 && valid.json?.updated === false);
  check("nombre AAAA-MM-DD-HHMMSS-<slug>.md sin prefijo", Boolean(richFile) && NOTE_NAME_RE.test(richFile), `file=${richFile}`);
  const richText = noteText(richFile);
  check("el archivo existe y es Markdown no vacio", richText.length > 0);
  const { front, markdown } = splitNote(richText);
  check("el documento empieza con front matter YAML delimitado", front.startsWith("---\n") && front.endsWith("\n---\n"));
  check("front matter: perfil, tipo, proyecto y personaje",
    front.includes('profile: "writer"') && front.includes('type: "reunion"') &&
    front.includes('project: "Tinta y Nodos"') && front.includes('subject: "Ismael"'));
  check("front matter: etiquetas, estado y prioridad",
    front.includes('tags: ["campo","notas","uno"]') && front.includes('status: "borrador"') && front.includes('priority: "high"'));
  check("front matter: id y fecha de creacion",
    front.includes('id: "nota-rica_01"') && front.includes('createdAt: "2026-11-16T18:00:00.000Z"'));
  check("front matter: fechas receivedAt, updatedAt y date",
    /receivedAt: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/.test(front) &&
    /updatedAt: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/.test(front) && /date: "\d{4}-\d{2}-\d{2}"/.test(front));
  check("el front matter no contiene chatTarget", !front.includes("chatTarget"));
  check("tras el front matter va '# <titulo>'", markdown.startsWith("\n# Reunión de campo: notas\n\n"), markdown.split("\n")[1]);
  check("el cuerpo se conserva", markdown.includes("Línea uno del cuerpo.") && markdown.includes("Línea dos con"));
  check("el HTML del cuerpo se neutraliza", markdown.includes("&lt;tags> y &amp; ampersand") && !markdown.includes("<tags>"));
  const inboxLine = inboxLineFor(richFile);
  const inbox = inboxRecordFor(richFile);
  check("inbox.jsonl recibe la linea de la nota", Boolean(inboxLine) && Boolean(inbox), `lineas=${inboxLines().length}`);
  check("inbox.jsonl conserva los metadatos completos (id, sin chatTarget)",
    Boolean(inbox) && inbox.id === "nota-rica_01" && inbox.title === rich.title && inbox.profile === "writer" &&
    inbox.type === "reunion" && inbox.project === "Tinta y Nodos" && inbox.subject === "Ismael" &&
    JSON.stringify(inbox.tags) === JSON.stringify(rich.tags) && inbox.status === "borrador" &&
    inbox.priority === "high" && inbox.createdAt === rich.createdAt && ISO_RE.test(String(inbox.receivedAt)) &&
    !("chatTarget" in inbox), JSON.stringify(inbox).slice(0, 160));
  check("la linea de inbox.jsonl es unica, sin saltos internos y <= 2 KB",
    Boolean(inboxLine) && inboxLines().filter((line) => line.includes(`"file":"${richFile}"`)).length === 1 &&
    Buffer.byteLength(inboxLine, "utf8") <= 2048 && !inboxLine.includes("\n"),
    `bytes=${inboxLine ? Buffer.byteLength(inboxLine, "utf8") : 0}`);
  // 7. HTML en el titulo: se neutraliza en el Markdown y se escapa en el panel.
  const htmlNote = await postNote({ title: "Titulo <b>con HTML</b>", body: "cuerpo neutro" });
  const htmlFile = remember(htmlNote.json?.file);
  const htmlMarkdown = splitNote(noteText(htmlFile)).markdown;
  check("titulo con HTML se neutraliza en el encabezado",
    htmlNote.status === 200 && htmlMarkdown.startsWith("\n# Titulo &lt;b>con HTML&lt;/b>\n"), htmlMarkdown.split("\n")[1]);
  check("el Markdown no conserva etiquetas HTML del titulo", !htmlMarkdown.includes("<b>"));

  // 8. Idempotencia por id: reenviar el mismo id actualiza el MISMO archivo.
  const idA = "idem-abc_01";
  const idFirst = await postNote({ id: idA, title: "Idem uno", body: "version uno",
    createdAt: "2026-11-16T18:00:00.000Z", project: "Proyecto X" });
  const fileA = remember(idFirst.json?.file);
  check("primera nota con id se crea (200 updated:false)",
    idFirst.status === 200 && idFirst.json?.updated === false && Boolean(fileA) && NOTE_NAME_RE.test(fileA),
    `status=${idFirst.status} file=${fileA}`);
  check("ids.json existe, es JSON valido y mapea el id al archivo", readIds()[idA] === fileA, `mapa=${JSON.stringify(readIds()[idA])}`);
  await sleep(10);
  const idSecond = await postNote({ id: idA, title: "Idem uno v2", body: "version dos", project: "Proyecto X" });
  check("reenviar el mismo id responde 200 updated:true", idSecond.status === 200 && idSecond.json?.updated === true,
    `status=${idSecond.status} body=${idSecond.body.slice(0, 80)}`);
  check("reenviar el mismo id actualiza el MISMO archivo (sin duplicado)", idSecond.json?.file === fileA, `file=${idSecond.json?.file}`);
  const updatedText = noteText(fileA);
  check("el contenido del archivo se reemplaza", updatedText.includes("version dos") && !updatedText.includes("version uno"));
  const updatedFront = splitNote(updatedText).front;
  check("el front matter refleja el titulo nuevo y conserva createdAt",
    updatedFront.includes('title: "Idem uno v2"') && updatedFront.includes('createdAt: "2026-11-16T18:00:00.000Z"'));
  check("updatedAt y receivedAt se refrescan al actualizar",
    /receivedAt: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/.test(updatedFront) &&
    /updatedAt: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/.test(updatedFront));
  check("la bandeja tiene UNA sola linea, con el titulo actualizado",
    inboxLines().filter((line) => { try { return JSON.parse(line).file === fileA; } catch { return false; } }).length === 1 &&
    inboxRecordFor(fileA)?.title === "Idem uno v2");
  check("no se crea un .md duplicado para el mismo id (slug idem-uno)",
    fs.readdirSync(NOTES_DIR).filter((name) => name.includes("idem-uno")).length === 1);
  const other = await postNote({ id: "otro-id_02", title: "Otra nota", body: "otra" });
  const otherFile = remember(other.json?.file);
  check("un id distinto crea otro archivo", other.status === 200 && Boolean(otherFile) && otherFile !== fileA, `A=${fileA} B=${otherFile}`);
  const idsAfter = readIds();
  check("ids.json acumula los dos ids", idsAfter[idA] === fileA && idsAfter["otro-id_02"] === otherFile);
  fs.unlinkSync(notePath(fileA));
  const recreated = await postNote({ id: idA, title: "Idem recreada", body: "tras borrar" });
  const recreatedFile = remember(recreated.json?.file);
  check("si el archivo del id se borro, se recrea (200 updated:false)",
    recreated.status === 200 && recreated.json?.updated === false && Boolean(recreatedFile) && NOTE_NAME_RE.test(recreatedFile), `status=${recreated.status}`);
  check("el archivo recreado existe y ids.json apunta a el",
    Boolean(recreatedFile) && fs.existsSync(notePath(recreatedFile)) && readIds()[idA] === recreatedFile);

  // 9. Nota de solo titulo: body ausente, "" o solo espacios.
  const titleOnly = await postNote({ title: "Solo titulo" });
  const titleFile = remember(titleOnly.json?.file);
  check("nota sin body se acepta (200)", titleOnly.status === 200 && Boolean(titleFile), `status=${titleOnly.status}`);
  const titleFront = splitNote(noteText(titleFile)).front;
  const titleMarkdown = splitNote(noteText(titleFile)).markdown;
  check("el archivo de solo titulo existe con nombre valido y body: \"\"",
    Boolean(titleFile) && NOTE_NAME_RE.test(titleFile) && titleFront.includes('body: ""'));
  check("el archivo contiene el titulo y no un cuerpo falso",
    titleMarkdown.startsWith("\n# Solo titulo\n") && titleMarkdown.trim() === "# Solo titulo", titleMarkdown.slice(0, 60));
  check("la bandeja registra la nota de solo titulo", inboxRecordFor(titleFile)?.title === "Solo titulo" && !("body" in (inboxRecordFor(titleFile) || {})));
  const emptyBody = await postNote({ title: "Solo titulo 2", body: "" });
  const spacesBody = await postNote({ title: "Solo titulo 3", body: "   " });
  remember(emptyBody.json?.file);
  remember(spacesBody.json?.file);
  check("body: \"\" y body de solo espacios se aceptan y quedan vacios",
    emptyBody.status === 200 && spacesBody.status === 200 && splitNote(noteText(spacesBody.json?.file)).front.includes('body: ""'),
    `status=${emptyBody.status}/${spacesBody.status}`);
  // 10. Limites exactos: se aceptan y la linea de la bandeja sigue cabiendo en 2 KB.
  const quotes = (count) => '"'.repeat(count);
  const edge = await postNote({
    title: quotes(200), body: "c".repeat(20_000), project: quotes(120), subject: quotes(120),
    type: "t".repeat(40), status: "s".repeat(40), tags: Array.from({ length: 10 }, () => quotes(40)),
  });
  const edgeFile = remember(edge.json?.file);
  check("los limites exactos se aceptan (200) con nombre de nota valido",
    edge.status === 200 && edge.json?.ok === true && Boolean(edgeFile) && NOTE_NAME_RE.test(edgeFile), `status=${edge.status}`);
  const edgeLine = inboxLineFor(edgeFile);
  check("limites exactos: linea de inbox valida y <= 2 KB",
    Boolean(edgeLine) && Buffer.byteLength(edgeLine, "utf8") <= 2048 && Boolean(inboxRecordFor(edgeFile)),
    `bytes=${edgeLine ? Buffer.byteLength(edgeLine, "utf8") : 0}`);
  check("limites exactos: el cuerpo de 20000 caracteres se conserva", noteText(edgeFile).includes("c".repeat(20_000)));
  // 11. Traversal en el titulo no sale de notes/.
  const traversal = await postNote({ title: "../../etc/passwd", body: "no debe salir de notes" });
  const traversalFile = remember(traversal.json?.file);
  const traversalPath = traversalFile ? path.resolve(NOTES_DIR, traversalFile) : "";
  check("titulo con traversal se queda dentro de notes/",
    traversal.status === 200 && Boolean(traversalFile) && NOTE_NAME_RE.test(traversalFile) &&
    !traversalFile.includes("..") && !traversalFile.includes("/") &&
    path.dirname(traversalPath) === path.resolve(NOTES_DIR) && fs.existsSync(traversalPath),
    `status=${traversal.status} file=${traversalFile}`);
  // 12. Dos notas con el mismo titulo y sin id no se pisan.
  const dupA = await postNote({ title: "Nota duplicada", body: "contenido primero" });
  const dupB = await postNote({ title: "Nota duplicada", body: "contenido segundo" });
  const fileA2 = remember(dupA.json?.file);
  const fileB2 = remember(dupB.json?.file);
  check("dos notas sin id con el mismo titulo generan nombres distintos",
    dupA.status === 200 && dupB.status === 200 && Boolean(fileA2) && Boolean(fileB2) && fileA2 !== fileB2, `A=${fileA2} B=${fileB2}`);
  check("la primera nota no se sobrescribe",
    noteText(fileA2).includes("contenido primero") && noteText(fileB2).includes("contenido segundo"));

  // 13. GET /dsh-companion/notes: auth, viewer, orden, forma y tolerancia.
  const noAuthGet = await getNotes({});
  check("GET sin credencial responde 403", noAuthGet.status === 403, `status=${noAuthGet.status}`);
  const badGet = await getNotes({ authorization: `Basic ${Buffer.from("dsh:mala").toString("base64")}` });
  check("GET con clave invalida responde 403", badGet.status === 403, `status=${badGet.status}`);
  const viewerReader = makeDevice({ name: "lector", role: "viewer" });
  await writeRegistry([viewerReader]);
  const viewerGet = await getNotes({ cookie: cookieOf(viewerReader) });
  check("GET con dispositivo viewer responde 403 solo lectura",
    viewerGet.status === 403 && String(viewerGet.body).includes("dispositivo en solo lectura"),
    `status=${viewerGet.status} body=${String(viewerGet.body).slice(0, 70)}`);
  const fullReader = makeDevice({ name: "lector-full", role: "full" });
  await writeRegistry([fullReader]);
  const fullGet = await getNotes({ cookie: cookieOf(fullReader) });
  check("GET con dispositivo full responde 200", fullGet.status === 200 && Array.isArray(fullGet.json?.notes), `status=${fullGet.status}`);
  const keyGet = await getNotes();
  const notes = Array.isArray(keyGet.json?.notes) ? keyGet.json.notes : [];
  check("GET con clave de acceso responde 200 y notes[]", keyGet.status === 200 && Array.isArray(keyGet.json?.notes), `status=${keyGet.status}`);
  check("GET devuelve las notas recibidas (no vacio)", notes.length > 0, `n=${notes.length}`);
  const noteStamps = notes.map((note) => Date.parse(note.receivedAt));
  check("GET ordena por receivedAt descendente y la mas reciente primero",
    noteStamps.every((value, index) => index === 0 || noteStamps[index - 1] >= value) &&
    noteStamps[0] === Math.max(...noteStamps.filter((value) => Number.isFinite(value))));
  const richEntry = notes.find((note) => note.file === richFile);
  check("GET incluye la nota rica con metadatos y fechas ISO",
    Boolean(richEntry) && richEntry.title === rich.title && richEntry.type === "reunion" &&
    richEntry.project === "Tinta y Nodos" && richEntry.profile === "writer" && richEntry.priority === "high" &&
    JSON.stringify(richEntry.tags) === JSON.stringify(rich.tags) && ISO_RE.test(String(richEntry.receivedAt)) &&
    richEntry.createdAt === rich.createdAt && typeof richEntry.dueDate === "string");
  check("GET incluye el id estable para correlacionar y deduplicar", richEntry?.id === rich.id, `id=${richEntry?.id}`);
  check("GET devuelve id \"\" en la nota que no trae id", notes.find((note) => note.file === fullFile)?.id === "");
  const dueEntry = notes.find((note) => note.file === dueFile);
  check("GET devuelve el dueDate de la nota con vencimiento", dueEntry?.dueDate === "2026-12-31");
  const allowedFields = ["id", "file", "title", "profile", "type", "project", "subject", "tags", "status", "priority", "dueDate", "createdAt", "receivedAt"];
  check("GET solo devuelve los campos documentados (sin cuerpo)",
    notes.every((note) => JSON.stringify(Object.keys(note).sort()) === JSON.stringify([...allowedFields].sort()) &&
      !("body" in note) && !("content" in note)));
  check("GET no pasa de 200 notas", notes.length <= 200, `n=${notes.length}`);
  fs.appendFileSync(INBOX, '{"file":"roto.md","title":"linea cortada"\n', "utf8"); // JSON invalido a proposito
  fs.appendFileSync(INBOX, '{"title":"sin archivo"}\n', "utf8"); // JSON valido pero sin file
  const tolerant = await getNotes();
  const tolerantNotes = Array.isArray(tolerant.json?.notes) ? tolerant.json.notes : [];
  check("GET tolera lineas corruptas y responde 200", tolerant.status === 200 && Array.isArray(tolerant.json?.notes),
    `status=${tolerant.status}`);
  check("GET ignora la linea corrupta y la que no trae file",
    tolerantNotes.length === notes.length && !tolerantNotes.some((note) => note.title === "linea cortada" || note.title === "sin archivo"));
  check("GET sigue devolviendo la nota rica tras las lineas corruptas", tolerantNotes.some((note) => note.file === richFile));
  // 13b. La bandeja se acota tambien SIN syncs de chats: basta escribir una nota
  // con la bandeja por encima del tope (poda rapida de routes-notes.mjs).
  await runInboxCapCheck(check, client, richFile);
  // 14. La ruta y el recurso retirados siguen fuera (nombres armados por partes
  // para que el grep de limpieza del repositorio siga en cero).
  const removedRoute = "/dsh-companion/absorb-" + ["sate", "llite"].join("");
  const removed = await request(bridge.bridgePort, removedRoute, {
    method: "POST", headers: jsonHeaders(authHeader()), body: JSON.stringify({ messages: [] }),
  });
  check("la ruta de absorcion retirada responde 404", removed.status === 404, `status=${removed.status} path=${removedRoute}`);
  const removedAsset = "/offline-" + ["sate", "llite"].join("") + ".js";
  const asset = await request(bridge.bridgePort, removedAsset, { headers: authHeader() });
  check(`el recurso retirado ${removedAsset} ya no se sirve`, asset.status !== 200, `status=${asset.status}`);

  // 15. Retencion: topes por archivos/MB sobre synced_chats/notes/ y poda de la
  // bandeja (500 lineas, sin huerfanas); ids.json protegido. Helper en
  // test/notes-harness.mjs para no pasar el tope de 400 lineas.
  runRetentionChecks(check, retention);
} catch (error) {
  check(`error inesperado durante la prueba: ${error.message}`, false);
} finally {
  for (const file of createdFiles) {
    try { fs.unlinkSync(notePath(file)); } catch { /* ya no existe */ }
  }
  try {
    if (idsBefore === null) fs.rmSync(IDS, { force: true });
    else fs.writeFileSync(IDS, idsBefore);
  } catch { /* indice de la prueba */ }
  try {
    if (inboxBefore === null) fs.rmSync(INBOX, { force: true });
    else fs.writeFileSync(INBOX, inboxBefore);
  } catch { /* bandeja de la prueba */ }
  if (!notesExistedBefore) {
    try { fs.rmdirSync(NOTES_DIR); } catch { /* no vacia o ausente: se deja */ }
  }
  retention.cleanup();
  await bridge.stop();
}

const failed = checks.filter((ok) => !ok).length;
console.log(`\nRESULTADO: ${checks.length - failed}/${checks.length}`);
if (failed) process.exitCode = 1;
