/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package org.json;

import java.util.List;
import java.util.Map;

/**
 * SOLO PRUEBAS. Serialización JSON mínima para la implementación de org.json que
 * usan los tests de JVM. No entra en el APK.
 */
final class JsonText {

    private JsonText() {
    }

    static Object normalize(Object value) {
        if (value == null
                || value instanceof String
                || value instanceof Boolean
                || value instanceof Number
                || value instanceof JSONObject
                || value instanceof JSONArray) {
            return value;
        }
        return String.valueOf(value);
    }

    static void writeValue(StringBuilder out, Object value) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof String) {
            out.append(quote((String) value));
        } else if (value instanceof Boolean) {
            out.append(((Boolean) value).booleanValue() ? "true" : "false");
        } else if (value instanceof Number) {
            out.append(value.toString());
        } else if (value instanceof JSONObject) {
            writeMap(out, ((JSONObject) value).values);
        } else if (value instanceof JSONArray) {
            writeList(out, ((JSONArray) value).values);
        } else if (value instanceof Map) {
            writeMap(out, (Map<?, ?>) value);
        } else if (value instanceof List) {
            writeList(out, (List<?>) value);
        } else {
            out.append(quote(String.valueOf(value)));
        }
    }

    private static void writeMap(StringBuilder out, Map<?, ?> map) {
        out.append('{');
        boolean first = true;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (!first) out.append(',');
            first = false;
            out.append(quote(String.valueOf(entry.getKey())));
            out.append(':');
            writeValue(out, entry.getValue());
        }
        out.append('}');
    }

    private static void writeList(StringBuilder out, List<?> list) {
        out.append('[');
        boolean first = true;
        for (Object value : list) {
            if (!first) out.append(',');
            first = false;
            writeValue(out, value);
        }
        out.append(']');
    }

    static String quote(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2);
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
            }
        }
        return out.append('"').toString();
    }
}
