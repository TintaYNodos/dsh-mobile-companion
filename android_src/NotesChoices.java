/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;

import java.util.function.Consumer;

/**
 * Selectores de chips del editor de notas: perfil, tipo, estado y prioridad.
 *
 * Cada método devuelve una {@link NotesChips.Row}: una fila accesible que se
 * repinta en sitio al cambiar de valor (sin reconstruir los chips, para no
 * perder el foco de TalkBack) y que solo cambia su catálogo cuando el perfil
 * cambia de tipos o estados.
 */
final class NotesChoices {

    private NotesChoices() {
    }

    static NotesChips.Row profile(Activity activity, String selected, Consumer<String> onSelect) {
        String[] values = NotesCatalog.PROFILES.clone();
        return new NotesChips.Row(activity, "Perfil", values, labelsOfProfile(values),
                selected, onSelect);
    }

    static NotesChips.Row type(Activity activity, String profile, String selected,
                               Consumer<String> onSelect) {
        String[] values = typeValues(profile);
        return new NotesChips.Row(activity, "Tipo", values, typeLabels(values), selected, onSelect);
    }

    static NotesChips.Row status(Activity activity, String profile, String selected,
                                 Consumer<String> onSelect) {
        String[] values = statusValues(profile);
        return new NotesChips.Row(activity, "Estado", values, statusLabels(values),
                selected, onSelect);
    }

    static String[] typeValues(String profile) {
        return NotesCatalog.typesFor(profile);
    }

    static String[] typeLabels(String[] values) {
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = NotesCatalog.typeLabel(values[i]);
        return labels;
    }

    static String[] statusValues(String profile) {
        return NotesCatalog.statusesFor(profile);
    }

    static String[] statusLabels(String[] values) {
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = NotesCatalog.statusLabel(values[i]);
        return labels;
    }

    static NotesChips.Row priority(Activity activity, String selected, Consumer<String> onSelect) {
        String[] values = NotesCatalog.PRIORITIES.clone();
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = NotesCatalog.priorityLabel(values[i]);
        return new NotesChips.Row(activity, "Prioridad", values, labels, selected, onSelect);
    }

    private static String[] labelsOfProfile(String[] profiles) {
        String[] labels = new String[profiles.length];
        for (int i = 0; i < profiles.length; i++) labels[i] = NotesCatalog.profileLabel(profiles[i]);
        return labels;
    }
}
