/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.app.DatePickerDialog;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Fechas de vencimiento de las notas: formato corto en español para la tarjeta
 * y el editor, y el selector de fecha nativo.
 *
 * El almacén guarda `yyyy-MM-dd` (ver {@link NotesText#dateOr(String)}); aquí
 * solo se presenta. Un vencimiento se pinta en rojo cuando ya pasó o es hoy o
 * mañana.
 */
final class NotesDates {

    private static final String[] SHORT_MONTHS = {
            "ene", "feb", "mar", "abr", "may", "jun",
            "jul", "ago", "sep", "oct", "nov", "dic"};
    private static final String[] LONG_MONTHS = {
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"};

    private NotesDates() {
    }

    /** Fecha ISO válida, o null si el texto no es una fecha real. */
    static LocalDate parse(String iso) {
        if (iso == null || iso.trim().isEmpty()) return null;
        try {
            return LocalDate.parse(iso.trim());
        } catch (DateTimeParseException invalid) {
            return null;
        }
    }

    /** «20 nov 2026», o "" si no hay fecha válida. */
    static String display(String iso) {
        LocalDate date = parse(iso);
        return date == null ? "" : day(date) + " " + SHORT_MONTHS[date.getMonthValue() - 1]
                + " " + date.getYear();
    }

    /** «20 nov», o "" si no hay fecha válida. */
    static String shortDisplay(String iso) {
        LocalDate date = parse(iso);
        return date == null ? "" : day(date) + " " + SHORT_MONTHS[date.getMonthValue() - 1];
    }

    /** «20 de noviembre de 2026» para descripciones de TalkBack. */
    static String longDisplay(String iso) {
        LocalDate date = parse(iso);
        return date == null ? "" : day(date) + " de " + LONG_MONTHS[date.getMonthValue() - 1]
                + " de " + date.getYear();
    }

    /** Texto de la tarjeta: «Vence 20 nov» o "". */
    static String cardLabel(String iso) {
        String shortDate = shortDisplay(iso);
        return shortDate.isEmpty() ? "" : "Vence " + shortDate;
    }

    /** true si la fecha ya pasó o es hoy o mañana (se pinta en rojo). */
    static boolean isSoon(String iso) {
        LocalDate date = parse(iso);
        if (date == null) return false;
        return !date.isAfter(LocalDate.now().plusDays(1));
    }

    /** Abre el selector de fecha con el valor actual (o hoy) y devuelve ISO. */
    static void pick(Activity activity, String currentIso, Consumer<String> onPicked) {
        LocalDate current = parse(currentIso);
        if (current == null) current = LocalDate.now();
        final LocalDate initial = current;
        DatePickerDialog dialog = new DatePickerDialog(activity,
                (view, year, month, dayOfMonth) ->
                        onPicked.accept(LocalDate.of(year, month + 1, dayOfMonth).toString()),
                initial.getYear(), initial.getMonthValue() - 1, initial.getDayOfMonth());
        dialog.show();
    }

    private static String day(LocalDate date) {
        return String.format(Locale.ROOT, "%d", date.getDayOfMonth());
    }
}
