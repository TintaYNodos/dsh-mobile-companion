/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONObject;

/**
 * Prueba Java pura de la lógica aislable de {@link OfflineChatStore}: recorte a
 * 20 000 caracteres por el final, JSON válido de la copia ({title, text,
 * updatedAt}) y título por defecto.
 *
 * No toca Android: solo llama a los helpers estáticos. El cifrado con el
 * AndroidKeyStore y el archivo privado no se pueden probar en una JVM (no
 * existe keystore), igual que en NotesStore se inyecta el cifrador; aquí la
 * parte criptográfica queda fuera porque su diseño es fail-closed y la cubre la
 * compilación del APK.
 *
 * No entra en el APK: build-apk.ps1 compila solo `android_src\*.java` (sin
 * recursión). Se ejecuta a mano con el resto de pruebas:
 *
 *   javac -encoding UTF-8 -cp android.jar -d out\test out\gen\...\R.java
 *     android_src\*.java android_src\tests\*.java android_src\tests\support\org\json\*.java
 *   java -cp "out\test;android.jar" com.tintaynodos.dshcompanion.OfflineChatStoreTest
 */
final class OfflineChatStoreTest {

    private static int checks = 0;
    private static int failures = 0;

    private OfflineChatStoreTest() {
    }

    public static void main(String[] args) {
        clampText();
        defaultTitle();
        timestamp();
        jsonRoundTrip();
        fromJsonRejects();
        System.out.println("OfflineChatStore: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (recorte a 20 000 por el final, JSON válido, título por defecto)");
    }

    // ------------------------------------------------------------------
    // Recorte de tamaño
    // ------------------------------------------------------------------

    private static void clampText() {
        expect("", OfflineChatStore.clampText(null), "texto null queda vacio");
        expect("", OfflineChatStore.clampText(""), "texto vacio queda vacio");
        expect("hola", OfflineChatStore.clampText("hola"), "texto corto intacto");

        String exact = "x".repeat(OfflineChatStore.MAX_TEXT);
        expect(exact, OfflineChatStore.clampText(exact), "justo en el tope no se toca");

        String over = "a" + "b".repeat(OfflineChatStore.MAX_TEXT);
        String cut = OfflineChatStore.clampText(over);
        expect(OfflineChatStore.MAX_TEXT, cut.length(), "20001 caracteres se recortan a 20000");
        expect(over.substring(over.length() - OfflineChatStore.MAX_TEXT), cut,
                "se conserva exactamente el final (recorte por el final)");

        String longText = "inicio" + "z".repeat(30000) + "FINAL";
        String longCut = OfflineChatStore.clampText(longText);
        expect(OfflineChatStore.MAX_TEXT, longCut.length(), "un texto muy largo baja al tope");
        expect(true, longCut.endsWith("FINAL"), "lo mas reciente del chat sobrevive");

        // Un emoji (par sustituto) justo en el borde del recorte no debe partirse.
        String emoji = "\uD83D\uDE00" + "a".repeat(19999);
        String emojiCut = OfflineChatStore.clampText(emoji);
        expect(false, Character.isLowSurrogate(emojiCut.charAt(0)),
                "el recorte no empieza a mitad de un emoji");
        expect(true, emojiCut.length() <= OfflineChatStore.MAX_TEXT,
                "el recorte con emoji no pasa del tope");
    }

    // ------------------------------------------------------------------
    // Título por defecto
    // ------------------------------------------------------------------

    private static void defaultTitle() {
        expect(OfflineChatStore.DEFAULT_TITLE, OfflineChatStore.defaultTitle(null),
                "sin titulo usa el de respaldo");
        expect(OfflineChatStore.DEFAULT_TITLE, OfflineChatStore.defaultTitle(""),
                "titulo vacio usa el de respaldo");
        expect(OfflineChatStore.DEFAULT_TITLE, OfflineChatStore.defaultTitle("   "),
                "titulo en blanco usa el de respaldo");
        expect("Mi chat", OfflineChatStore.defaultTitle("Mi chat"), "titulo valido se conserva");
        expect("Mi chat", OfflineChatStore.defaultTitle("  Mi chat  "), "el titulo se recorta");
    }

    // ------------------------------------------------------------------
    // Marca temporal
    // ------------------------------------------------------------------

    private static void timestamp() {
        String iso = "2026-11-17T09:59:31.123Z";
        expect(iso, OfflineChatStore.timestamp(iso), "fecha ISO valida pasa");
        expect(iso, OfflineChatStore.timestamp("  " + iso + "  "), "la fecha se recorta");
        String now = OfflineChatStore.timestamp(null);
        expect(true, now != null && now.contains("T"), "sin fecha se pone una ISO de ahora");
        String absurd = "x".repeat(60);
        String replaced = OfflineChatStore.timestamp(absurd);
        expect(false, absurd.equals(replaced), "una fecha absurda se reemplaza");
        expect(true, replaced != null && !replaced.isEmpty(), "siempre hay marca temporal");
    }

    // ------------------------------------------------------------------
    // JSON de la copia
    // ------------------------------------------------------------------

    private static void jsonRoundTrip() {
        String iso = "2026-11-17T09:59:31.123Z";
        String json = OfflineChatStore.toJson("Charla", "cuerpo uno", iso);
        expect(true, json != null, "toJson devuelve texto");

        JSONObject object = null;
        try {
            object = new JSONObject(json);
        } catch (Exception invalid) {
            object = null;
        }
        expect(true, object != null, "el JSON guardado es valido");
        expect("Charla", object == null ? null : object.optString("title", ""),
                "el JSON lleva el titulo");
        expect("cuerpo uno", object == null ? null : object.optString("text", ""),
                "el JSON lleva el texto");
        expect(iso, object == null ? null : object.optString("updatedAt", ""),
                "el JSON lleva la fecha");
        expect(3, object == null ? -1 : object.length(),
                "solo viajan title, text y updatedAt (sin campos ocultos)");

        OfflineChatStore.Chat chat = OfflineChatStore.fromJson(json);
        expect(true, chat != null, "fromJson reconstruye la copia");
        expect("Charla", chat == null ? null : chat.title, "el titulo sobrevive al JSON");
        expect("cuerpo uno", chat == null ? null : chat.text, "el texto sobrevive al JSON");
        expect(iso, chat == null ? null : chat.updatedAt, "la fecha sobrevive al JSON");

        // Comillas, barras, saltos de linea, tabuladores y acentos deben volver.
        String tricky = "Comillas \"dobles\" y \\ vuelta\nlinea nueva\tcon tab y García, ¿qué?";
        OfflineChatStore.Chat round = OfflineChatStore.fromJson(
                OfflineChatStore.toJson("t", tricky, ""));
        expect(tricky, round == null ? null : round.text, "escapes y acentos sobreviven al JSON");

        // El tope se aplica tambien al serializar: nunca se guarda de mas.
        String huge = "q".repeat(25000);
        OfflineChatStore.Chat hugeChat = OfflineChatStore.fromJson(
                OfflineChatStore.toJson("t", huge, ""));
        expect(OfflineChatStore.MAX_TEXT, hugeChat == null ? -1 : hugeChat.text.length(),
                "el JSON guardado no pasa del tope");

        OfflineChatStore.Chat noTitle = OfflineChatStore.fromJson(
                OfflineChatStore.toJson("   ", "cuerpo", null));
        expect(OfflineChatStore.DEFAULT_TITLE, noTitle == null ? null : noTitle.title,
                "titulo por defecto al serializar");
        expect("", noTitle == null ? null : noTitle.updatedAt,
                "sin fecha el campo queda vacio, no nulo");
    }

    // ------------------------------------------------------------------
    // Rechazo de contenido invalido
    // ------------------------------------------------------------------

    private static void fromJsonRejects() {
        expect(true, OfflineChatStore.fromJson(null) == null, "null no es una copia");
        expect(true, OfflineChatStore.fromJson("") == null, "vacio no es una copia");
        expect(true, OfflineChatStore.fromJson("   ") == null, "en blanco no es una copia");
        expect(true, OfflineChatStore.fromJson("{esto no es json") == null,
                "un JSON roto se rechaza");
        expect(true, OfflineChatStore.fromJson("[]") == null, "un array no es una copia");
        expect(true, OfflineChatStore.fromJson("{}") == null, "sin texto no hay copia");
        expect(true, OfflineChatStore.fromJson("{\"text\":\"\"}") == null,
                "texto vacio no es copia");
        expect(true, OfflineChatStore.fromJson("{\"text\":\"   \"}") == null,
                "texto en blanco no es copia");

        OfflineChatStore.Chat noTitle = OfflineChatStore.fromJson("{\"text\":\"hola\"}");
        expect(OfflineChatStore.DEFAULT_TITLE, noTitle == null ? null : noTitle.title,
                "sin titulo usa el de respaldo al leer");
        expect("", noTitle == null ? null : noTitle.updatedAt,
                "sin fecha queda vacia al leer");
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    private static void expect(long expected, long actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    private static void expect(String expected, String actual, String label) {
        checks++;
        boolean same = expected == null ? actual == null : expected.equals(actual);
        if (!same) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
