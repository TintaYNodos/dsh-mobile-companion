/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.util.ArrayList;
import java.util.List;

/**
 * Limpieza de etiquetas de notas: texto libre del editor o lista ya separada.
 *
 * Java puro y sin estado. Vive aparte de {@link NotesCatalog} para que el
 * catálogo de perfiles (que crece con nuevos perfiles) no engorde de más y para
 * que el tope del puente (10 etiquetas de 40 caracteres) esté en un solo sitio.
 */
final class NotesTags {

    /** Tope defensivo de etiquetas por nota (el puente acepta como máximo 10). */
    static final int MAX_TAGS = 10;
    /** Tope de longitud de cada etiqueta (el puente rechaza más de 40). */
    static final int MAX_TAG_LENGTH = 40;

    private NotesTags() {
    }

    /**
     * Etiquetas a partir del texto libre del editor: separadas por comas, sin
     * espacios sobrantes, sin '#' inicial, sin vacías y sin duplicados (sin
     * distinguir mayúsculas). Se conserva el orden y el tope defensivo.
     */
    static List<String> parseTags(String raw) {
        List<String> tags = new ArrayList<>();
        if (raw == null) return tags;
        for (String piece : raw.split(",")) {
            String tag = piece == null ? "" : piece.trim();
            while (tag.startsWith("#")) tag = tag.substring(1).trim();
            if (tag.isEmpty()) continue;
            if (tag.length() > MAX_TAG_LENGTH) tag = tag.substring(0, MAX_TAG_LENGTH).trim();
            if (tag.isEmpty() || containsIgnoreCase(tags, tag)) continue;
            tags.add(tag);
            if (tags.size() >= MAX_TAGS) break;
        }
        return tags;
    }

    /** Misma limpieza para una lista ya separada (JSON, código). */
    static List<String> cleanTags(List<String> raw) {
        List<String> tags = new ArrayList<>();
        if (raw == null) return tags;
        for (String piece : raw) {
            for (String tag : parseTags(piece)) {
                if (!containsIgnoreCase(tags, tag)) tags.add(tag);
                if (tags.size() >= MAX_TAGS) return tags;
            }
        }
        return tags;
    }

    /** Texto de etiquetas para el editor, la tarjeta y el JSON compartido. */
    static String tagsText(List<String> tags) {
        if (tags == null || tags.isEmpty()) return "";
        StringBuilder out = new StringBuilder();
        for (String tag : tags) {
            if (tag == null || tag.trim().isEmpty()) continue;
            if (out.length() > 0) out.append(", ");
            out.append(tag);
        }
        return out.toString();
    }

    private static boolean containsIgnoreCase(List<String> values, String needle) {
        for (String value : values) {
            if (value.equalsIgnoreCase(needle)) return true;
        }
        return false;
    }
}
