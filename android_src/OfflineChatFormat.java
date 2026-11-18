/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Formato PURO de la copia estructurada del chat (sin Android): mensajes con
 * rol, texto y hora, limpieza de ruido (control, zero-width, entidades HTML y
 * mojibake), recorte por mensajes completos y JSON v2 ({v, title, messages[]}).
 *
 * Se prueba en la JVM desde {@code OfflineChatStoreTest}. También reconoce las
 * copias antiguas de texto plano para que sigan leyéndose.
 */
final class OfflineChatFormat {

    static final int MAX_TIME = 9;
    private static final Pattern CONTROL = Pattern.compile("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]");
    private static final Pattern INVISIBLE = Pattern.compile("[\\x{200B}-\\x{200F}\\x{202A}-\\x{202E}\\x{2060}-\\x{2064}\\x{FEFF}]");
    private static final Pattern TRAILING = Pattern.compile("[ \\t]+\\n");
    private static final Pattern BREAKS = Pattern.compile("\\n{3,}");

    private OfflineChatFormat() {}

    /** Mensaje ya limpio: rol normalizado, texto y hora opcional. */
    static final class Message {
        final String role;
        final String text;
        final String time;

        Message(String role, String text, String time) {
            this.role = "user".equals(role) ? "user" : "assistant";
            this.text = text == null ? "" : text;
            this.time = time == null ? "" : time;
        }

        boolean isUser() { return "user".equals(role); }
    }

    /** Limpia control/zero-width, entidades HTML y mojibake, y normaliza saltos. */
    static String sanitize(String raw) {
        if (raw == null) return "";
        String text = raw.replace("\r\n", "\n").replace('\r', '\n');
        text = CONTROL.matcher(text).replaceAll("");
        text = INVISIBLE.matcher(text).replaceAll("");
        text = text.replace((char) 0xA0, ' ');
        text = decodeEntities(text);
        text = repairMojibake(text);
        text = TRAILING.matcher(text).replaceAll("\n");
        text = BREAKS.matcher(text).replaceAll("\n\n");
        return text.trim();
    }

    /** Decodifica las entidades HTML que suelen quedar sin interpretar. */
    static String decodeEntities(String text) {
        if (text == null) return "";
        if (text.indexOf('&') < 0) return text;
        return text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&apos;", "'").replace("&nbsp;", " ");
    }

    /** Repara UTF-8 leído como ISO-8859-1 si la secuencia vuelve a ser válida. */
    static String repairMojibake(String text) {
        if (text == null) return "";
        if (text.length() < 2) return text;
        boolean suspicious = false;
        for (int i = 0; !suspicious && i + 1 < text.length(); i++) {
            char first = text.charAt(i);
            char second = text.charAt(i + 1);
            suspicious = first >= 0xC2 && first <= 0xF4 && second >= 0x80 && second <= 0xBF;
        }
        if (!suspicious) return text;
        byte[] raw = new byte[text.length()];
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch > 0xFF) return text;
            raw[i] = (byte) ch;
        }
        String decoded = new String(raw, StandardCharsets.UTF_8);
        return Arrays.equals(raw, decoded.getBytes(StandardCharsets.UTF_8)) ? decoded : text;
    }

    /** "user" para el usuario; cualquier otro rol cae en "assistant". */
    static String normalizeRole(String role) {
        String value = role == null ? "" : role.trim().toLowerCase(Locale.ROOT);
        return "user".equals(value) || "human".equals(value) || "you".equals(value)
                || "tú".equals(value) || "yo".equals(value) ? "user" : "assistant";
    }

    /** Extrae la lista de mensajes del JSON que manda el cliente (array u objeto). */
    static List<Message> parseMessages(String json) {
        if (json == null || json.trim().isEmpty()) return new ArrayList<>();
        try {
            String trimmed = json.trim();
            JSONArray array = trimmed.charAt(0) == '['
                    ? new JSONArray(trimmed)
                    : new JSONObject(trimmed).optJSONArray("messages");
            return readMessages(array);
        } catch (Throwable invalid) {
            return new ArrayList<>();
        }
    }

    /** Lee, limpia y normaliza los mensajes de un array; descarta los vacíos. */
    static List<Message> readMessages(JSONArray array) {
        List<Message> messages = new ArrayList<>();
        if (array == null) return messages;
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.optJSONObject(i);
            if (item == null) continue;
            String text = sanitize(item.optString("text", ""));
            if (text.isEmpty()) continue;
            String time = sanitize(item.optString("time", ""));
            messages.add(new Message(normalizeRole(item.optString("role", "")), text,
                    time.length() > MAX_TIME ? "" : time));
        }
        return messages;
    }

    /**
     * Recorta al tope por MENSAJES COMPLETOS: entran los más recientes que
     * caben y no se parte ninguno. Si ni el último cabe, se conserva su final
     * como último recurso para no dejar la copia vacía.
     */
    static List<Message> clampMessages(List<Message> messages, int limit) {
        List<Message> kept = new ArrayList<>();
        if (messages == null || limit <= 0) return kept;
        int total = 0;
        for (int i = messages.size() - 1; i >= 0; i--) {
            Message message = messages.get(i);
            if (message == null || message.text.isEmpty()) continue;
            int size = message.text.length() + (kept.isEmpty() ? 0 : 1);
            if (total + size > limit) break;
            total += size;
            kept.add(0, message);
        }
        if (kept.isEmpty()) {
            for (int i = messages.size() - 1; i >= 0; i--) {
                Message last = messages.get(i);
                if (last == null || last.text.isEmpty()) continue;
                int start = Math.max(0, last.text.length() - limit);
                if (Character.isLowSurrogate(last.text.charAt(start))) start++;
                kept.add(new Message(last.role, last.text.substring(start), last.time));
                break;
            }
        }
        return kept;
    }

    /** Texto plano de respaldo, con las mismas etiquetas que el lector. */
    static String plainText(List<Message> messages) {
        StringBuilder out = new StringBuilder();
        if (messages == null) return "";
        for (Message message : messages) {
            if (message == null || message.text.isEmpty()) continue;
            if (out.length() > 0) out.append("\n\n");
            out.append(message.isUser() ? "Tú: " : "Agente: ").append(message.text);
        }
        return out.toString();
    }

    /**
     * Convierte una copia ANTIGUA de texto plano a mensajes cuando el extractor
     * dejó sus marcas ("### Usuario:" / "### Asistente:" y separadores "---").
     * Si no hay marcas devuelve una lista vacía y el texto se pinta tal cual.
     */
    static List<Message> parseLegacy(String raw) {
        String text = sanitize(raw);
        List<Message> messages = new ArrayList<>();
        if (text.indexOf("###") < 0) return messages;
        for (String chunk : text.split("\\n?---\\n?")) {
            String part = chunk.trim();
            if (part.isEmpty()) continue;
            boolean user = part.startsWith("### Usuario") || part.startsWith("### User");
            if (part.startsWith("###")) {
                int breakAt = part.indexOf('\n');
                part = breakAt < 0 ? "" : part.substring(breakAt + 1).trim();
            }
            part = sanitize(part);
            if (!part.isEmpty()) messages.add(new Message(user ? "user" : "assistant", part, ""));
        }
        return messages;
    }

    /** JSON estructurado v2: {v, title, messages[], updatedAt}. */
    static String toJson(String title, List<Message> messages, String updatedAt) {
        try {
            JSONObject object = new JSONObject();
            object.put("v", 2);
            object.put("title", title == null || title.trim().isEmpty()
                    ? OfflineChatStore.DEFAULT_TITLE : title.trim());
            JSONArray array = new JSONArray();
            for (Message message : messages) {
                if (message == null || message.text.isEmpty()) continue;
                JSONObject item = new JSONObject();
                item.put("role", message.role);
                item.put("text", message.text);
                if (!message.time.isEmpty()) item.put("time", message.time);
                array.put(item);
            }
            object.put("messages", array);
            object.put("updatedAt", updatedAt == null ? "" : updatedAt.trim());
            return object.toString();
        } catch (Throwable invalid) {
            return null;
        }
    }
}
