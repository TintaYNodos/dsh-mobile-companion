/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * Licensed under the Business Source License 1.1 (Business Source License 1.1) / Business Source License 1.1.
 * See companion/LICENSE or LICENSE for license terms.
 */
/**
 * P8: neutralizacion y render del Markdown sincronizado.
 *
 * Se extrae de sync.mjs para que la escritura (sync.mjs) y la lectura
 * (sync-index.mjs) compartan las mismas reglas de escapado, slug y render sin
 * duplicarlas. El comportamiento es identico al que vivia en sync.mjs.
 */
import crypto from "node:crypto";

/**
 * P8: el contenido sincronizado se guarda con su texto original. Solo se
 * neutralizan `<` y `&`, unicos caracteres con los que se puede inyectar HTML
 * ejecutable (escapar `&` evita ademas entidades como `&#60;`). Antes se
 * escapaba tambien `*`, `_`, backticks, `#`, `[]` y `~` con barras invertidas:
 * eso corrompia el Markdown guardado y, al releerlo, se volvia a escapar
 * (`&amp;lt;`), duplicando el dano. `>` suelto no abre etiquetas: no hace falta.
 */
export const neutralizeMarkdown = (value) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");

export const slugify = (value) => {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || "chat").slice(0, 40);
};

export const uniqueBase = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const entropy = crypto.randomBytes(3).toString("hex");
  return `sync_${stamp}_${entropy}`;
};

const renderMarkdownBody = (title, isoDate, messages, escapeContent) => {
  const heading = escapeContent ? neutralizeMarkdown(title) : String(title ?? "");
  const parts = [`# Sesion sincronizada: ${heading}\n\n- Fecha: ${isoDate}\n- Mensajes: ${messages.length}\n\n---\n`];
  for (const m of messages) {
    const content = escapeContent ? neutralizeMarkdown(m.content) : String(m.content ?? "");
    parts.push(`### ${m.role === "assistant" ? "Asistente" : "Usuario"}\n\n${content}\n\n---\n`);
  }
  return parts.join("\n");
};

export const renderMarkdown = (title, isoDate, messages) => renderMarkdownBody(title, isoDate, messages, true);

/**
 * P8: render de un documento que ya esta en disco (titulo y mensajes ya
 * neutralizados al guardarlo). No se vuelve a neutralizar: ese segundo escapado
 * era el que servia `&amp;lt;` o barras invertidas al reconstruir el .md o el
 * JSON cuando faltaba el archivo .md.
 */
export const renderStoredMarkdown = (title, isoDate, messages) =>
  renderMarkdownBody(title, isoDate, messages, false);
