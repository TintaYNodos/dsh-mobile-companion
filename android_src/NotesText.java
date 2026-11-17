/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Locale;

/**
 * Utilidades de texto del catálogo de notas: fechas de vencimiento y búsqueda
 * sin acentos ni mayúsculas.
 *
 * Java puro, sin estado y sin Android. Vive aparte de {@link NotesCatalog} para
 * que el catálogo de perfiles (extensible) quede por debajo del límite de líneas
 * del proyecto.
 */
final class NotesText {

    private NotesText() {
    }

    /**
     * Fecha de vencimiento normalizada a `yyyy-MM-dd`, o "" si está vacía o no
     * es una fecha real. Acepta también `yyyy-M-d` y rellena con ceros; rechaza
     * `31/12/2026` o `2026-02-30`.
     */
    static String dateOr(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "";
        String[] parts = value.split("-");
        if (parts.length != 3) return "";
        if (!parts[0].matches("\\d{4}") || !parts[1].matches("\\d{1,2}")
                || !parts[2].matches("\\d{1,2}")) {
            return "";
        }
        String iso = parts[0] + "-" + pad2(parts[1]) + "-" + pad2(parts[2]);
        try {
            LocalDate.parse(iso);
            return iso;
        } catch (DateTimeParseException invalid) {
            return "";
        }
    }

    /**
     * Texto normalizado para buscar: mayúsculas, acentos, marcas ordinales
     * (`°`, `º`, `ª`), numerales (`#`, `№`) y el punto del ordinal no importan.
     * Así `3b` encuentra `3°B`, `3.ºB` y `3ºB`, y `n1` encuentra `n°1`.
     */
    static String normalizeForSearch(String raw) {
        if (raw == null) return "";
        String text = Normalizer.normalize(raw, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
        // Grado, numeral y almohadilla se quitan con los espacios que los rodean.
        text = text.replaceAll("\\s*[°#№]\\s*", "");
        // "3.ºB" / "3ºB" -> "3b": el ordinal pegado a un número desaparece.
        text = text.replaceAll("(\\d)\\s*[.·]?\\s*[ºª]\\s*", "$1");
        return text.replaceAll("[ºª]", "").trim();
    }

    private static String pad2(String value) {
        return value.length() == 1 ? "0" + value : value;
    }
}
