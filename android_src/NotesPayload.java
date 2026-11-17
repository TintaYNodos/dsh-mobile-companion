/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * JSON de una nota tal como lo valida `/dsh-companion/notes`.
 *
 * Traduce los valores canónicos del archivo a los del contrato del puente
 * (perfil `writer`/`teacher`/..., prioridad `high`, `createdAt` ISO-8601 UTC) y
 * envía el `id` estable de la nota y su `dueDate`.
 *
 * Privacidad: una nota `localOnly` nunca sale del teléfono, así que
 * {@link #forNote(NotesStore.Note)} devuelve null para ella; el campo
 * `localOnly` jamás se serializa. El cuerpo puede ir vacío: solo el título es
 * obligatorio para enviar.
 *
 * Separado de {@link NotesSync} para mantener ambos archivos por debajo del
 * límite de líneas del proyecto.
 */
final class NotesPayload {

    /** Topes de longitud del puente para una nota. */
    static final int MAX_TITLE = 200;
    static final int MAX_BODY = 20_000;
    static final int MAX_TYPE = 40;
    static final int MAX_STATUS = 40;
    static final int MAX_META = 120;
    static final int MAX_TAG = 40;
    static final int MAX_TAGS = 10;
    private static final String ISO_PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";

    private NotesPayload() {
    }

    /**
     * JSON completo que entiende el puente. Devuelve null si la nota es
     * `localOnly` (no se envía nunca). Incluye `id`, `title`, `body` (puede ir
     * vacío), perfil, tipo, proyecto, personaje/módulo, etiquetas, estado,
     * prioridad, `dueDate` y `createdAt` en ISO-8601 UTC.
     */
    static JSONObject forNote(NotesStore.Note note) throws JSONException {
        if (note == null) return null;
        if (NotesStore.isLocalOnly(note)) return null;

        JSONObject payload = new JSONObject();
        payload.put("id", note.id);
        payload.put("title", note.title);
        payload.put("body", note.body);
        payload.put("profile", NotesCatalog.wireProfile(note.profile));
        payload.put("type", clip(note.type, MAX_TYPE));
        payload.put("project", clip(note.project, MAX_META));
        payload.put("subject", clip(note.subject, MAX_META));
        JSONArray tags = new JSONArray();
        int count = 0;
        for (String tag : note.tags) {
            if (count >= MAX_TAGS) break;
            tags.put(clip(tag, MAX_TAG));
            count++;
        }
        payload.put("tags", tags);
        payload.put("status", clip(note.status, MAX_STATUS));
        payload.put("priority", NotesCatalog.wirePriority(note.priority));
        payload.put("dueDate", note.dueDate);
        payload.put("createdAt", isoInstant(note.createdAt));
        payload.put("updatedAt", note.updatedAt);
        return payload;
    }

    /**
     * true si dos notas coinciden en todo lo que se envía a la PC (más
     * `localOnly`, que decide si sale). Lo usa {@link NotesStore} para no
     * reescribir al guardar sin cambios y conservar `synced`.
     */
    static boolean sameContent(NotesStore.Note left, NotesStore.Note right) {
        if (left == null || right == null) return left == right;
        return left.title.equals(right.title) && left.body.equals(right.body)
                && left.profile.equals(right.profile) && left.type.equals(right.type)
                && left.project.equals(right.project) && left.subject.equals(right.subject)
                && left.tags.equals(right.tags) && left.status.equals(right.status)
                && left.priority.equals(right.priority) && left.dueDate.equals(right.dueDate)
                && left.localOnly == right.localOnly;
    }

    /** Marca de tiempo ISO-8601 en UTC, que es lo que valida el puente. */
    static String isoInstant(long millis) {
        SimpleDateFormat format = new SimpleDateFormat(ISO_PATTERN, Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis <= 0L ? System.currentTimeMillis() : millis));
    }

    private static String clip(String value, int max) {
        if (value == null) return "";
        String text = value.trim();
        return text.length() > max ? text.substring(0, max) : text;
    }
}
