/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.util.ArrayList;
import java.util.List;

/**
 * Criterios de búsqueda, filtrado y orden de notas. Java puro, sin Android: lo
 * usan {@link NotesStore} (API), {@link NotesFilterUi} (chips y diálogos) y
 * {@link NotesActivity} (lista).
 *
 * - `query`: texto libre; se busca en título, cuerpo, etiquetas,
 *   personaje/módulo/fuente y proyecto, sin distinguir mayúsculas ni acentos.
 * - `profile`, `type`, `status`, `project`, `priority`: vacío significa "todos".
 * - `withDueDate`: true exige vencimiento ("con fecha").
 * - `sort`: {@link #SORT_UPDATED} (por actualización, por defecto) o
 *   {@link #SORT_DUE_DATE} (por vencimiento, primero las que tienen fecha).
 *
 * Los criterios se combinan con Y lógico; {@link #apply(List)} conserva el orden
 * que trae la lista (el almacén ya la ordenó según `sort`).
 */
final class NotesFilter {

    static final String SORT_UPDATED = "updated";
    static final String SORT_DUE_DATE = "dueDate";

    String query = "";
    String profile = "";
    String type = "";
    String status = "";
    String project = "";
    String priority = "";
    /** Solo notas con fecha de vencimiento. */
    boolean withDueDate = false;
    /** Orden pedido al almacén. */
    String sort = SORT_UPDATED;

    /** Devuelve las notas que cumplen todos los criterios, en su orden. */
    List<NotesStore.Note> apply(List<NotesStore.Note> notes) {
        List<NotesStore.Note> matches = new ArrayList<>();
        if (notes == null) return matches;
        for (NotesStore.Note note : notes) {
            if (note != null && matches(note)) matches.add(note);
        }
        return matches;
    }

    boolean matches(NotesStore.Note note) {
        if (note == null) return false;
        if (!profile.isEmpty() && !profile.equals(note.profile)) return false;
        if (!type.isEmpty() && !type.equals(note.type)) return false;
        if (!status.isEmpty() && !status.equals(note.status)) return false;
        if (!project.isEmpty() && !project.equals(note.project)) return false;
        if (!priority.isEmpty() && !priority.equals(note.priority)) return false;
        if (withDueDate && note.dueDate.isEmpty()) return false;
        return matchesQuery(note, query);
    }

    /**
     * Búsqueda libre en los campos que ve el usuario en la lista. Insensible a
     * mayúsculas y a acentos: `garcia` encuentra `García`.
     */
    static boolean matchesQuery(NotesStore.Note note, String rawQuery) {
        String needle = NotesText.normalizeForSearch(rawQuery);
        if (needle.isEmpty()) return true;
        String[] fields = {note.title, note.body, note.subject, note.project,
                NotesTags.tagsText(note.tags)};
        for (String field : fields) {
            if (NotesText.normalizeForSearch(field).contains(needle)) return true;
        }
        return false;
    }

    boolean isEmpty() {
        return query.trim().isEmpty() && profile.isEmpty() && type.isEmpty()
                && status.isEmpty() && project.isEmpty() && priority.isEmpty()
                && !withDueDate;
    }
}
