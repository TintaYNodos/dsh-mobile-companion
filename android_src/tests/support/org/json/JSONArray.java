/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package org.json;

import java.util.List;

/**
 * SOLO PRUEBAS. Implementación mínima de JSONArray para ejecutar NotesStore en
 * una JVM (android.jar trae stubs). No entra en el APK.
 */
public class JSONArray {

    final List<Object> values = new java.util.ArrayList<>();

    public JSONArray() {
    }

    JSONArray(List<Object> source) {
        values.addAll(source);
    }

    public JSONArray(String source) throws JSONException {
        Object parsed = JsonParser.parse(source);
        if (!(parsed instanceof JSONArray)) throw new JSONException("Se esperaba un array JSON");
        values.addAll(((JSONArray) parsed).values);
    }

    public JSONArray put(Object value) {
        values.add(JsonText.normalize(value));
        return this;
    }

    public int length() {
        return values.size();
    }

    public Object get(int index) throws JSONException {
        if (index < 0 || index >= values.size()) {
            throw new JSONException("Índice fuera de rango: " + index);
        }
        return values.get(index);
    }

    public JSONObject getJSONObject(int index) throws JSONException {
        Object value = get(index);
        if (value instanceof JSONObject) return (JSONObject) value;
        throw new JSONException("El elemento " + index + " no es un objeto JSON");
    }

    public JSONObject optJSONObject(int index) {
        Object value = index < 0 || index >= values.size() ? null : values.get(index);
        return value instanceof JSONObject ? (JSONObject) value : null;
    }

    public String getString(int index) throws JSONException {
        Object value = get(index);
        if (value instanceof String) return (String) value;
        return String.valueOf(value);
    }

    public String optString(int index, String fallback) {
        if (index < 0 || index >= values.size()) return fallback;
        Object value = values.get(index);
        if (value == null) return fallback;
        if (value instanceof String) return (String) value;
        return String.valueOf(value);
    }

    @Override
    public String toString() {
        StringBuilder out = new StringBuilder();
        JsonText.writeValue(out, this);
        return out.toString();
    }
}
