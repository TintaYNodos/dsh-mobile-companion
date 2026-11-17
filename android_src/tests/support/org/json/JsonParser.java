/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package org.json;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SOLO PRUEBAS. Parser JSON mínimo (comillas, escapes, números, true/false/null,
 * objetos y arrays) suficiente para los archivos que escribe NotesStore. No entra
 * en el APK.
 */
final class JsonParser {

    private final String text;
    private int index;

    private JsonParser(String text) {
        this.text = text;
        this.index = 0;
    }

    static Object parse(String source) throws JSONException {
        if (source == null) throw new JSONException("JSON nulo");
        JsonParser parser = new JsonParser(source);
        parser.skipWhitespace();
        Object value = parser.readValue();
        parser.skipWhitespace();
        if (parser.index < parser.text.length()) {
            throw new JSONException("Texto sobrante tras el JSON en la posición " + parser.index);
        }
        return value;
    }

    private Object readValue() throws JSONException {
        skipWhitespace();
        if (index >= text.length()) throw new JSONException("Fin inesperado del JSON");
        char c = text.charAt(index);
        switch (c) {
            case '{':
                return readObject();
            case '[':
                return readArray();
            case '"':
                return readString();
            case 't':
                expect("true");
                return Boolean.TRUE;
            case 'f':
                expect("false");
                return Boolean.FALSE;
            case 'n':
                expect("null");
                return null;
            default:
                if (c == '-' || (c >= '0' && c <= '9')) return readNumber();
                throw new JSONException("Valor inesperado en la posición " + index);
        }
    }

    private JSONObject readObject() throws JSONException {
        Map<String, Object> map = new LinkedHashMap<>();
        index++; // {
        skipWhitespace();
        if (peek() == '}') {
            index++;
            return new JSONObject(map);
        }
        while (true) {
            skipWhitespace();
            if (peek() != '"') throw new JSONException("Se esperaba una clave en la posición " + index);
            String key = readString();
            skipWhitespace();
            expect(':');
            map.put(key, readValue());
            skipWhitespace();
            char next = peek();
            if (next == ',') {
                index++;
                continue;
            }
            if (next == '}') {
                index++;
                return new JSONObject(map);
            }
            throw new JSONException("Se esperaba , o } en la posición " + index);
        }
    }

    private JSONArray readArray() throws JSONException {
        List<Object> list = new ArrayList<>();
        index++; // [
        skipWhitespace();
        if (peek() == ']') {
            index++;
            return new JSONArray(list);
        }
        while (true) {
            list.add(readValue());
            skipWhitespace();
            char next = peek();
            if (next == ',') {
                index++;
                continue;
            }
            if (next == ']') {
                index++;
                return new JSONArray(list);
            }
            throw new JSONException("Se esperaba , o ] en la posición " + index);
        }
    }

    private String readString() throws JSONException {
        expect('"');
        StringBuilder out = new StringBuilder();
        while (index < text.length()) {
            char c = text.charAt(index++);
            if (c == '"') return out.toString();
            if (c != '\\') {
                out.append(c);
                continue;
            }
            if (index >= text.length()) break;
            char escaped = text.charAt(index++);
            switch (escaped) {
                case '"': out.append('"'); break;
                case '\\': out.append('\\'); break;
                case '/': out.append('/'); break;
                case 'b': out.append('\b'); break;
                case 'f': out.append('\f'); break;
                case 'n': out.append('\n'); break;
                case 'r': out.append('\r'); break;
                case 't': out.append('\t'); break;
                case 'u':
                    if (index + 4 > text.length()) throw new JSONException("Escape \\u incompleto");
                    try {
                        out.append((char) Integer.parseInt(text.substring(index, index + 4), 16));
                    } catch (NumberFormatException invalid) {
                        throw new JSONException("Escape \\u inválido", invalid);
                    }
                    index += 4;
                    break;
                default:
                    throw new JSONException("Escape inválido: \\" + escaped);
            }
        }
        throw new JSONException("Cadena sin cerrar");
    }

    private Object readNumber() throws JSONException {
        int start = index;
        if (peek() == '-') index++;
        while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
        boolean decimal = false;
        if (index < text.length() && text.charAt(index) == '.') {
            decimal = true;
            index++;
            while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
        }
        if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
            decimal = true;
            index++;
            if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) index++;
            while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
        }
        String token = text.substring(start, index);
        try {
            return decimal ? (Object) Double.valueOf(token) : (Object) Long.valueOf(token);
        } catch (NumberFormatException invalid) {
            throw new JSONException("Número inválido: " + token, invalid);
        }
    }

    private void skipWhitespace() {
        while (index < text.length()) {
            char c = text.charAt(index);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') index++;
            else return;
        }
    }

    private char peek() throws JSONException {
        if (index >= text.length()) throw new JSONException("Fin inesperado del JSON");
        return text.charAt(index);
    }

    private void expect(char expected) throws JSONException {
        if (index >= text.length() || text.charAt(index) != expected) {
            throw new JSONException("Se esperaba '" + expected + "' en la posición " + index);
        }
        index++;
    }

    private void expect(String literal) throws JSONException {
        if (!text.startsWith(literal, index)) {
            throw new JSONException("Se esperaba " + literal + " en la posición " + index);
        }
        index += literal.length();
    }
}
