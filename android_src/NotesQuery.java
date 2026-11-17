/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.util.ArrayList;
import java.util.List;

/**
 * Orden y proyecciones de listas de notas: por última edición o por
 * vencimiento, notas visibles y proyectos distintos.
 *
 * Java puro y sin estado. Vive aparte de {@link NotesStore} para que la API del
 * almacén (CRUD, cifrado, búsqueda) quede por debajo del límite de líneas del
 * proyecto.
 */
final class NotesQuery {

    private NotesQuery() {
    }

    /**
     * Ordena la lista en sitio y la devuelve. Por actualización: la más reciente
     * primero. Por vencimiento: primero las notas con fecha, de la más próxima a
     * la más lejana; las que no tienen fecha van al final por actualización.
     */
    static List<NotesStore.Note> sorted(List<NotesStore.Note> notes, String sort) {
        boolean byDueDate = NotesFilter.SORT_DUE_DATE.equals(sort);
        notes.sort((left, right) -> {
            if (byDueDate) {
                boolean leftDue = !left.dueDate.isEmpty();
                boolean rightDue = !right.dueDate.isEmpty();
                if (leftDue != rightDue) return leftDue ? -1 : 1;
                if (leftDue) {
                    int due = left.dueDate.compareTo(right.dueDate);
                    if (due != 0) return due;
                }
            }
            if (left.updatedAt != right.updatedAt) {
                return Long.compare(right.updatedAt, left.updatedAt);
            }
            return Long.compare(right.createdAt, left.createdAt);
        });
        return notes;
    }

    /** Notas que la pantalla debe pintar: las que tienen título (es obligatorio). */
    static List<NotesStore.Note> visible(List<NotesStore.Note> notes) {
        List<NotesStore.Note> visible = new ArrayList<>();
        for (NotesStore.Note note : sorted(notes, NotesFilter.SORT_UPDATED)) {
            if (note != null && !note.title.trim().isEmpty()) visible.add(note);
        }
        return visible;
    }

    /** Proyectos/obras/clientes distintos ya usados, ordenados sin distinguir mayúsculas. */
    static List<String> projects(List<NotesStore.Note> notes) {
        List<String> projects = new ArrayList<>();
        for (NotesStore.Note note : notes) {
            String project = note.project.trim();
            if (project.isEmpty()) continue;
            boolean seen = false;
            for (String existing : projects) {
                if (existing.equalsIgnoreCase(project)) { seen = true; break; }
            }
            if (!seen) projects.add(project);
        }
        projects.sort(String.CASE_INSENSITIVE_ORDER);
        return projects;
    }
}
