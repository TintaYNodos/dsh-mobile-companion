/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package org.json;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SOLO PRUEBAS. Implementación mínima de JSONObject para ejecutar NotesStore en
 * una JVM (android.jar trae stubs). No entra en el APK.
 */
public class JSONObject {

    final Map<String, Object> values = new LinkedHashMap<>();

    public JSONObject() {
    }

    JSONObject(Map<String, Object> source) {
        values.putAll(source);
    }

    public JSONObject(String source) throws JSONException {
        Object parsed = JsonParser.parse(source);
        if (!(parsed instanceof JSONObject)) throw new JSONException("Se esperaba un objeto JSON");
        values.putAll(((JSONObject) parsed).values);
    }

    public JSONObject put(String key, Object value) throws JSONException {
        if (key == null) throw new JSONException("La clave no puede ser null");
        if (value == null) {
            values.remove(key);
        } else {
            values.put(key, JsonText.normalize(value));
        }
        return this;
    }

    public JSONObject put(String key, long value) throws JSONException {
        return put(key, Long.valueOf(value));
    }

    public JSONObject put(String key, int value) throws JSONException {
        return put(key, Long.valueOf(value));
    }

    public JSONObject put(String key, double value) throws JSONException {
        return put(key, Double.valueOf(value));
    }

    public JSONObject put(String key, boolean value) throws JSONException {
        return put(key, Boolean.valueOf(value));
    }

    /** Igual que org.json: escapa una cadena como literal JSON entrecomillado. */
    public static String quote(String value) {
        return JsonText.quote(value == null ? "" : value);
    }

    public boolean has(String key) {
        return values.containsKey(key);
    }

    public boolean isNull(String key) {
        return !values.containsKey(key) || values.get(key) == null;
    }

    public Object remove(String key) {
        return values.remove(key);
    }

    public int length() {
        return values.size();
    }

    public Object get(String key) throws JSONException {
        if (!values.containsKey(key)) throw new JSONException("No existe la clave: " + key);
        return values.get(key);
    }

    public String getString(String key) throws JSONException {
        Object value = get(key);
        if (value instanceof String) return (String) value;
        return String.valueOf(value);
    }

    public String optString(String key, String fallback) {
        Object value = values.get(key);
        if (value == null) return fallback;
        if (value instanceof String) return (String) value;
        return String.valueOf(value);
    }

    public String optString(String key) {
        return optString(key, "");
    }

    public JSONObject optJSONObject(String key) {
        Object value = values.get(key);
        return value instanceof JSONObject ? (JSONObject) value : null;
    }

    public JSONArray optJSONArray(String key) {
        Object value = values.get(key);
        return value instanceof JSONArray ? (JSONArray) value : null;
    }

    public JSONArray getJSONArray(String key) throws JSONException {
        Object value = get(key);
        if (value instanceof JSONArray) return (JSONArray) value;
        throw new JSONException("La clave " + key + " no es un array JSON");
    }

    public long getLong(String key) throws JSONException {
        return JSONObject.asLong(get(key));
    }

    public long optLong(String key, long fallback) {
        try {
            return getLong(key);
        } catch (JSONException missing) {
            return fallback;
        }
    }

    public int optInt(String key, int fallback) {
        Object value = values.get(key);
        if (value instanceof Number) return ((Number) value).intValue();
        if (value instanceof String) {
            try {
                return Integer.parseInt(((String) value).trim());
            } catch (NumberFormatException invalid) {
                return fallback;
            }
        }
        return fallback;
    }

    public double optDouble(String key, double fallback) {
        Object value = values.get(key);
        if (value instanceof Number) return ((Number) value).doubleValue();
        if (value instanceof String) {
            try {
                return Double.parseDouble(((String) value).trim());
            } catch (NumberFormatException invalid) {
                return fallback;
            }
        }
        return fallback;
    }

    public boolean getBoolean(String key) throws JSONException {
        return JSONObject.asBoolean(get(key));
    }

    public boolean optBoolean(String key, boolean fallback) {
        try {
            return getBoolean(key);
        } catch (JSONException missing) {
            return fallback;
        }
    }

    private static long asLong(Object value) throws JSONException {
        if (value instanceof Number) return ((Number) value).longValue();
        if (value instanceof Boolean) return ((Boolean) value) ? 1L : 0L;
        if (value instanceof String) {
            try {
                return Long.parseLong(((String) value).trim());
            } catch (NumberFormatException invalid) {
                throw new JSONException("No es un número: " + value);
            }
        }
        throw new JSONException("No es un número");
    }

    private static boolean asBoolean(Object value) throws JSONException {
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof String) return Boolean.parseBoolean((String) value);
        if (value instanceof Number) return ((Number) value).doubleValue() != 0d;
        throw new JSONException("No es un booleano");
    }

    @Override
    public String toString() {
        StringBuilder out = new StringBuilder();
        JsonText.writeValue(out, this);
        return out.toString();
    }
}
