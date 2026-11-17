/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Formato de una nota del telefono: validacion de metadatos y render del
 * Markdown con su front matter YAML. Se separa de notes-store.mjs (indice,
 * banda e idempotencia) para no pasar del tope de 400 lineas por archivo.
 *
 * `title` es obligatorio y no vacio; `body` puede faltar o ser "" (nota de solo
 * titulo). `profile` es uno de los siete perfiles por area que documenta el
 * README (los tipos son libres y el puente no impone su catalogo); `dueDate` es
 * una fecha opcional AAAA-MM-DD. El campo retirado `chatTarget` se ignora a
 * proposito (compatibilidad): no se valida, no viaja al front matter y no forma
 * parte del nombre de archivo.
 *
 * Privacidad: una nota marcada `localOnly` no debe salir del telefono. El
 * cliente legitimo ni siquiera la incluye en el payload, pero un APK modificado
 * podria colar la marca: el puente la rechaza con 400 (defensa en profundidad).
 */
import { stripControlChars } from "./http.mjs";
import { neutralizeMarkdown, slugify } from "./sync-format.mjs";

/** Topes de longitud de los metadatos; excederlos responde 400. */
const LIMITS = { title: 200, body: 20_000, project: 120, subject: 120, type: 40, status: 40 };
const TAGS_MAX = 10;
const TAG_MAX = 40;
/**
 * Los siete perfiles por area del cliente (mismos slugs que NotesCatalog.java).
 * Cada perfil define tipos y estados en el telefono; aqui solo se acepta el
 * slug, porque `type` y `status` son texto libre limitado.
 */
const PROFILES = new Set(["general", "writer", "programmer", "teacher", "journalist", "legal", "designer"]);
const PRIORITIES = new Set(["low", "medium", "high"]);
/** Id estable del telefono: solo texto seguro para nombre de archivo. */
export const NOTE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Fecha limite opcional, en el mismo formato que normaliza el telefono. */
const DUE_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Map compacto a partir de pares alternos clave/valor (tablas de etiquetas). */
const labelMap = (pairs) =>
  new Map(Array.from({ length: pairs.length / 2 }, (_, index) => [pairs[index * 2], pairs[index * 2 + 1]]));

/**
 * Etiquetas en espanol de los tipos canonicos que envia el telefono (los mismos
 * slugs en ingles del catalogo Android). El panel local las usa para mostrar la
 * bandeja legible; un valor fuera de la tabla se humaniza en el propio panel.
 */
export const NOTE_TYPE_LABELS = labelMap([
  "note", "Nota",
  "character", "Personaje",
  "scene", "Escena",
  "plot", "Trama",
  "dialogue", "Diálogo",
  "correction", "Corrección",
  "research", "Investigación",
  "idea", "Idea",
  "bug", "Bug",
  "improvement", "Mejora",
  "refactor", "Refactor",
  "task", "Tarea",
  "decision", "Decisión",
  "lesson", "Lección",
  "activity", "Actividad",
  "exam", "Examen",
  "rubric", "Rúbrica",
  "observation", "Observación",
  "material", "Material",
  "tip", "Pista",
  "interview", "Entrevista",
  "article", "Artículo",
  "source", "Fuente",
  "verification", "Verificación",
  "data", "Dato",
  "document", "Documento",
  "pleading", "Escrito",
  "evidence", "Prueba",
  "deadline", "Plazo",
  "hearing", "Audiencia",
  "contract", "Contrato",
  "brief", "Encargo",
  "concept", "Concepto",
  "wireframe", "Wireframe",
  "mockup", "Maqueta",
  "asset", "Recurso",
  "feedback", "Comentario",
]);

/**
 * Etiquetas en espanol de los estados canonicos que envia el telefono. El
 * estado puede faltar (`""`), que en la bandeja significa "sin estado".
 */
export const NOTE_STATUS_LABELS = labelMap([
  "idea", "Idea",
  "draft", "Borrador",
  "review", "Revisión",
  "closed", "Cerrado",
  "open", "Abierto",
  "fixed", "Arreglado",
  "verified", "Verificado",
  "debunked", "Desmentido",
  "ready", "Listo",
  "applied", "Aplicado",
  "graded", "Calificado",
  "archived", "Archivado",
  "in_progress", "En curso",
  "published", "Publicado",
  "filed", "Presentado",
  "approved", "Aprobado",
  "delivered", "Entregado",
]);

export const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const pad2 = (value) => String(value).padStart(2, "0");

/** Texto opcional: exige tipo string, recorta y aplica tope de longitud. */
const optionalText = (payload, field, max) => {
  const raw = payload[field];
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw badRequest(`${field} debe ser texto`);
  // Los saltos de linea se eliminan: ni el nombre de archivo ni el YAML de una
  // sola linea pueden romperse en dos.
  const value = stripControlChars(raw).trim();
  if (value.length > max) throw badRequest(`${field} supera ${max} caracteres`);
  return value;
};

/** Opcion cerrada con valor por defecto cuando el campo no viene. */
const choice = (payload, field, allowed, fallback) => {
  const raw = payload[field];
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string" || !allowed.has(raw)) throw badRequest(`${field} invalido`);
  return raw;
};

/** Lista de etiquetas: array de textos no vacios, maximo 10 y 40 por etiqueta. */
const validateTags = (payload) => {
  const raw = payload.tags;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw badRequest("tags debe ser una lista de textos");
  if (raw.length > TAGS_MAX) throw badRequest(`tags no puede pasar de ${TAGS_MAX} elementos`);
  return raw
    .map((tag) => {
      if (typeof tag !== "string") throw badRequest("cada etiqueta debe ser texto");
      const value = stripControlChars(tag).trim();
      if (value.length > TAG_MAX) throw badRequest(`cada etiqueta supera ${TAG_MAX} caracteres`);
      return value;
    })
    .filter(Boolean);
};

const validateCreatedAt = (payload) => {
  const raw = payload.createdAt;
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") throw badRequest("createdAt debe ser texto");
  const value = stripControlChars(raw).trim();
  if (value.length > 40) throw badRequest("createdAt supera 40 caracteres");
  return value;
};

/**
 * Id opcional del telefono. Si falta, la nota se crea como siempre (archivo
 * nuevo). Si viene, debe cumplir NOTE_ID_RE y activa la idempotencia.
 */
const validateNoteId = (payload) => {
  const raw = payload.id;
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string" || !NOTE_ID_RE.test(raw)) {
    throw badRequest("id debe cumplir [A-Za-z0-9_-]{1,64}");
  }
  return raw;
};

/**
 * Fecha limite opcional AAAA-MM-DD. Vacio/null significa "sin fecha" y no
 * escribe el campo. Se rechaza con 400 cualquier otro formato o una fecha que no
 * existe en el calendario (2026-13-40, 2026-02-30, "mañana"), en linea con lo
 * que el telefono normaliza antes de enviar.
 */
const validateDueDate = (payload) => {
  const raw = payload.dueDate;
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") throw badRequest("dueDate debe ser texto");
  const value = stripControlChars(raw).trim();
  const match = DUE_DATE_RE.exec(value);
  if (!match) throw badRequest("dueDate debe tener el formato AAAA-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lastDay = month === 2 && leap ? 29 : MONTH_DAYS[month - 1];
  if (month < 1 || month > 12 || day < 1 || day > lastDay) {
    throw badRequest("dueDate no es una fecha valida");
  }
  return value;
};

/** Valores que un APK modificado usaria para intentar colar `localOnly`. */
const LOCAL_ONLY_TRUE = new Set(["true", "1", "si", "sí", "yes"]);

/**
 * Defensa en profundidad de `localOnly`. La app no envia la marca (las notas
 * solo del telefono no generan payload), asi que rechazar aqui no rompe nada;
 * evita que un cliente modificado escriba en la PC una nota que solo debia
 * vivir en el telefono. `false`, `0`, "" o ausente se aceptan (no filtran nada).
 */
const rejectLocalOnly = (payload) => {
  const raw = payload.localOnly;
  const flagged =
    raw === true || raw === 1 || (typeof raw === "string" && LOCAL_ONLY_TRUE.has(raw.trim().toLowerCase()));
  if (flagged) throw badRequest("nota solo del teléfono: no se envía");
};

/**
 * Valida el JSON y devuelve los metadatos normalizados. `title` es obligatorio
 * y no vacio; `body` puede faltar o ser "" (nota de solo titulo). Los campos
 * desconocidos se ignoran; `chatTarget` se ignora siempre (campo retirado).
 * `localOnly` con valor afirmativo responde 400 (privacidad del telefono).
 */
export const validateNotePayload = (payload) => {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw badRequest("Se esperaba un objeto JSON");
  }
  rejectLocalOnly(payload);
  if (typeof payload.title !== "string" || stripControlChars(payload.title).trim() === "") {
    throw badRequest("Se requiere un titulo no vacio");
  }
  const title = stripControlChars(payload.title).trim();
  if (title.length > LIMITS.title) throw badRequest(`El titulo supera ${LIMITS.title} caracteres`);

  let body = "";
  const rawBody = payload.body;
  if (rawBody !== undefined && rawBody !== null) {
    if (typeof rawBody !== "string") throw badRequest("body debe ser texto");
    body = rawBody.trim();
  }
  if (body.length > LIMITS.body) throw badRequest(`El cuerpo supera ${LIMITS.body} caracteres`);

  return {
    id: validateNoteId(payload),
    title,
    body,
    profile: choice(payload, "profile", PROFILES, "general"),
    type: optionalText(payload, "type", LIMITS.type),
    project: optionalText(payload, "project", LIMITS.project),
    subject: optionalText(payload, "subject", LIMITS.subject),
    tags: validateTags(payload),
    status: optionalText(payload, "status", LIMITS.status),
    priority: choice(payload, "priority", PRIORITIES, "medium"),
    dueDate: validateDueDate(payload),
    createdAt: validateCreatedAt(payload),
  };
};

/** Marca de tiempo local con la forma AAAA-MM-DD-HHMMSS. */
const noteStamp = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-` +
  `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

/** Fecha local AAAA-MM-DD para el front matter. */
const isoDay = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** Escalar YAML seguro: JSON.stringify es una cadena entrecomillada valida. */
const yaml = (value) => JSON.stringify(String(value ?? ""));

/**
 * Front matter YAML con todos los metadatos de la nota. `chatTarget` ya no
 * existe; si hay id se documenta, `dueDate` solo aparece cuando la nota tiene
 * fecha limite, y una nota de solo titulo deja `body: ""` explicito (el cuerpo
 * vive vacio tras el encabezado).
 */
const renderFrontMatter = (note, now) => {
  const lines = [
    "---",
    `title: ${yaml(note.title)}`,
    `profile: ${yaml(note.profile)}`,
    `type: ${yaml(note.type)}`,
    `project: ${yaml(note.project)}`,
    `subject: ${yaml(note.subject)}`,
    `tags: ${JSON.stringify(note.tags)}`,
    `status: ${yaml(note.status)}`,
    `priority: ${yaml(note.priority)}`,
  ];
  if (note.id) lines.push(`id: ${yaml(note.id)}`);
  if (note.dueDate) lines.push(`dueDate: ${yaml(note.dueDate)}`);
  if (note.body === "") lines.push(`body: ${yaml("")}`);
  lines.push(
    `createdAt: ${yaml(note.createdAt)}`,
    `receivedAt: ${yaml(now.toISOString())}`,
    `updatedAt: ${yaml(now.toISOString())}`,
    `date: ${yaml(isoDay(now))}`,
    "---"
  );
  return lines.join("\n");
};

/**
 * Render Markdown: front matter, `# titulo` y cuerpo (o nada si la nota es de
 * solo titulo). Se neutraliza el HTML ejecutable igual que en los chats
 * sincronizados (solo `<` y `&`).
 */
export const renderNote = (note, now) => {
  const body = note.body === "" ? "" : `${neutralizeMarkdown(note.body)}\n`;
  return `${renderFrontMatter(note, now)}\n\n# ${neutralizeMarkdown(note.title)}\n\n${body}`;
};

/** Slug [a-z0-9-] con tope, o el valor de reserva si queda vacio. */
const fileSlug = (value, max, fallback) => slugify(value).replace(/[^a-z0-9-]/g, "").slice(0, max) || fallback;

/**
 * Nombre base del archivo: `AAAA-MM-DD-HHMMSS-<slug>`. Ya no lleva prefijo de
 * chat destino; `slugify` y el filtro dejan solo [a-z0-9-], asi que un titulo
 * con `../` no puede salir de notes/. `assertInside` lo comprueba igualmente.
 */
export const noteBaseName = (note, now) => `${noteStamp(now)}-${fileSlug(note.title, 40, "nota")}`;
