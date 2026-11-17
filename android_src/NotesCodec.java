/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Serialización JSON de las notas y tolerancia con el formato anterior.
 *
 * Separado de {@link NotesStore} (API y control del archivo) para poder probar
 * la lectura/escritura con `org.json` real de los tests. Sigue siendo org.json
 * puro: no entra nada específico de Android.
 *
 * La escritura sale ya en el esquema canónico (perfil/tipo/estado en inglés,
 * vencimiento `yyyy-MM-dd` y marca `localOnly`). Las claves desconocidas de
 * archivos viejos se ignoran, y una nota sin los campos nuevos se completa con
 * `profile=general`, `type=note`, `status=""`, `priority=medium`, sin
 * vencimiento y sin `localOnly`.
 */
final class NotesCodec {

    private NotesCodec() {
    }

    /** Lee una nota del JSON; null si la entrada no tiene id utilizable. */
    static NotesStore.Note parse(JSONObject obj) {
        if (obj == null) return null;
        String id = obj.optString("id", "");
        if (id.isEmpty()) return null;

        String profile = NotesCatalog.profileOr(obj.optString("profile", ""));
        long created = obj.optLong("createdAt", 0L);
        long updated = obj.optLong("updatedAt", created);
        return new NotesStore.Note(id,
                obj.optString("title", ""),
                obj.optString("body", ""),
                profile,
                NotesCatalog.typeOr(profile, obj.optString("type", "")),
                obj.optString("project", ""),
                obj.optString("subject", ""),
                readTags(obj),
                NotesCatalog.statusOr(profile, obj.optString("status", "")),
                NotesCatalog.priorityOr(obj.optString("priority", "")),
                NotesText.dateOr(obj.optString("dueDate", "")),
                obj.optBoolean("localOnly", false),
                created, updated, obj.optBoolean("synced", false));
    }

    /** Objeto JSON completo de una nota, listo para el archivo local. */
    static JSONObject toJson(NotesStore.Note note) throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("id", note.id);
        obj.put("title", note.title);
        obj.put("body", note.body);
        obj.put("profile", note.profile);
        obj.put("type", note.type);
        obj.put("project", note.project);
        obj.put("subject", note.subject);
        JSONArray tags = new JSONArray();
        for (String tag : note.tags) tags.put(tag);
        obj.put("tags", tags);
        obj.put("status", note.status);
        obj.put("priority", note.priority);
        obj.put("dueDate", note.dueDate);
        obj.put("localOnly", note.localOnly);
        obj.put("createdAt", note.createdAt);
        obj.put("updatedAt", note.updatedAt);
        obj.put("synced", note.synced);
        return obj;
    }

    /**
     * Etiquetas: array JSON (formato actual) o texto separado por comas
     * (tolerancia con archivos editados a mano); vacío si no hay nada.
     */
    private static List<String> readTags(JSONObject obj) {
        JSONArray array = obj.optJSONArray("tags");
        if (array != null) {
            List<String> tags = new ArrayList<>();
            for (int i = 0; i < array.length(); i++) {
                String tag = array.optString(i, "");
                if (!tag.trim().isEmpty()) tags.add(tag);
            }
            return NotesTags.cleanTags(tags);
        }
        return NotesTags.parseTags(obj.optString("tags", ""));
    }
}
