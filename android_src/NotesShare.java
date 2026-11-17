/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Texto para compartir una nota con `ACTION_SEND`: clasificación (perfil, tipo,
 * estado y prioridad), metadatos, vencimiento y cuerpo.
 *
 * Privacidad: una nota `localOnly` no se comparte sin confirmación explícita.
 * {@link #plan(NotesStore.Draft)} devuelve el texto omitido y el indicador
 * {@link Plan#requiresConfirmation}; la interfaz pregunta y, si el usuario
 * acepta, llama a {@link #text(NotesStore.Draft, boolean)} con `confirmed=true`.
 * El texto compartido nunca incluye la marca `localOnly` (es un dato interno).
 *
 * Está aparte del editor para mantener ese archivo por debajo del límite de
 * líneas del proyecto y para poder cambiarlo sin tocar la interfaz.
 */
final class NotesShare {

    private NotesShare() {
    }

    /** Resultado de preparar una nota para compartir. */
    static final class Plan {
        public final String subject;
        /** Texto a compartir; vacío si la nota es solo del teléfono y falta confirmar. */
        public final String text;
        /** true si la interfaz debe pedir confirmación antes de compartir. */
        public final boolean requiresConfirmation;

        Plan(String subject, String text, boolean requiresConfirmation) {
            this.subject = subject == null ? "" : subject;
            this.text = text == null ? "" : text;
            this.requiresConfirmation = requiresConfirmation;
        }
    }

    /** Asunto del `ACTION_SEND`: el título o "Nota". */
    static String subject(NotesStore.Draft draft) {
        String title = draft == null || draft.title == null ? "" : draft.title.trim();
        return title.isEmpty() ? "Nota" : title;
    }

    /**
     * Plan de compartido: texto normal, o texto omitido + confirmación si la
     * nota es `localOnly`.
     */
    static Plan plan(NotesStore.Draft draft) {
        boolean localOnly = requiresConfirmation(draft);
        return new Plan(subject(draft), localOnly ? "" : compose(draft), localOnly);
    }

    /** true si compartir esta nota exige confirmación (nota solo del teléfono). */
    static boolean requiresConfirmation(NotesStore.Draft draft) {
        return draft != null && draft.localOnly;
    }

    /** Texto para compartir sin confirmar: omite las notas localOnly. */
    static String text(NotesStore.Draft draft) {
        return text(draft, false);
    }

    /**
     * Texto completo para compartir. Con `confirmed=true` incluye una nota
     * `localOnly` (la interfaz ya preguntó).
     */
    static String text(NotesStore.Draft draft, boolean confirmed) {
        if (draft == null) return "";
        if (draft.localOnly && !confirmed) return "";
        return compose(draft);
    }

    private static String compose(NotesStore.Draft draft) {
        StringBuilder out = new StringBuilder();
        String title = draft.title == null ? "" : draft.title.trim();
        if (!title.isEmpty()) out.append(title).append("\n\n");

        StringBuilder meta = new StringBuilder();
        meta.append(NotesCatalog.profileLabel(draft.profile))
                .append(" · ").append(NotesCatalog.typeLabel(draft.type));
        if (draft.status != null && !draft.status.isEmpty()) {
            meta.append(" · ").append(NotesCatalog.statusLabel(draft.status));
        }
        meta.append(" · ").append(NotesCatalog.priorityLabel(draft.priority));
        out.append(meta).append('\n');

        String project = draft.project == null ? "" : draft.project.trim();
        String subject = draft.subject == null ? "" : draft.subject.trim();
        if (!project.isEmpty()) {
            out.append(NotesCatalog.projectLabel(draft.profile)).append(": ").append(project);
            if (!subject.isEmpty()) out.append(" · ").append(subject);
            out.append('\n');
        } else if (!subject.isEmpty()) {
            out.append(NotesCatalog.subjectLabel(draft.profile)).append(": ")
                    .append(subject).append('\n');
        }
        if (draft.dueDate != null && !draft.dueDate.trim().isEmpty()) {
            out.append("Vence: ").append(draft.dueDate.trim()).append('\n');
        }
        if (draft.tags != null && !draft.tags.isEmpty()) {
            out.append("Etiquetas: ").append(NotesTags.tagsText(draft.tags)).append('\n');
        }
        String body = draft.body == null ? "" : draft.body.trim();
        if (!body.isEmpty()) out.append('\n').append(body);
        return out.toString();
    }
}
