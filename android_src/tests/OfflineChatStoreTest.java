/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Prueba Java pura de la lógica aislable de {@link OfflineChatStore} y de
 * {@link OfflineChatFormat}: recorte a 20 000 caracteres por el final, JSON
 * válido de la copia antigua ({title, text, updatedAt}), formato estructurado
 * nuevo (extracción de mensajes, recorte por mensajes completos, compatibilidad
 * con texto plano y limpieza de símbolos).
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
        structuredExtraction();
        clampByMessages();
        legacyCompatibility();
        cleanSymbols();
        System.out.println("OfflineChatStore: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (recorte a 20 000, JSON antiguo y estructurado, limpieza)");
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
    // Formato estructurado nuevo (mensajes)
    // ------------------------------------------------------------------

    /** Cadena UTF-8 leída como ISO-8859-1 (mojibake), construida sin literales. */
    private static String mojibake(String correct) {
        return new String(correct.getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1);
    }

    private static void structuredExtraction() {
        String json = "[{\"role\":\"user\",\"text\":\"Hola &amp; adios &lt;3\",\"time\":\"10:05\"},"
                + "{\"role\":\"ASSISTANT\",\"text\":\"linea uno\\nlinea dos\\n\\n- item\\n\\n> cita"
                + "\\n\\n```\\ncodigo\\n```\"},"
                + "{\"role\":\"bot\",\"text\":\"   \"},"
                + "{\"role\":\"otro\",\"text\":\"respuesta\"}]";
        List<OfflineChatFormat.Message> messages = OfflineChatFormat.parseMessages(json);
        expect(3, messages.size(), "se extraen los mensajes con texto y se descartan los vacios");
        expect(true, messages.get(0).isUser(), "el primer mensaje es del usuario");
        expect("Hola & adios <3", messages.get(0).text, "las entidades HTML se decodifican");
        expect("10:05", messages.get(0).time, "la hora se conserva");
        expect(false, messages.get(1).isUser(), "el segundo mensaje es del agente");
        expect(true, messages.get(1).text.contains("\n\n- item"), "la lista conserva sus saltos");
        expect(true, messages.get(1).text.contains("\n\n> cita"), "la cita conserva su linea");
        expect(true, messages.get(1).text.contains("```\ncodigo\n```"),
                "el bloque de codigo conserva sus marcas");
        expect("assistant", messages.get(2).role, "un rol desconocido cae en assistant");
        expect("respuesta", messages.get(2).text, "el texto de rol desconocido se conserva");

        String object = "{\"messages\":[{\"role\":\"user\",\"text\":\"uno\"}]}";
        List<OfflineChatFormat.Message> wrapped = OfflineChatFormat.parseMessages(object);
        expect(1, wrapped.size(), "tambien acepta {\"messages\": [...]}");
        expect(0, OfflineChatFormat.parseMessages("no es json").size(),
                "un payload roto no produce mensajes");
        expect(0, OfflineChatFormat.parseMessages("[]").size(), "una lista vacia no produce mensajes");
        expect(0, OfflineChatFormat.parseMessages(null).size(), "null no produce mensajes");

        String withNoise = "{\"messages\":[{\"role\":\"user\",\"text\":\"a"
                + (char) 0x200B + "b" + (char) 0xFEFF + "c\"}]}";
        List<OfflineChatFormat.Message> clean = OfflineChatFormat.parseMessages(withNoise);
        expect(1, clean.size(), "un mensaje con ruido sigue siendo mensaje");
        expect("abc", clean.get(0).text, "la extraccion elimina zero-width");

        List<OfflineChatFormat.Message> longTime = OfflineChatFormat.parseMessages(
                "[{\"role\":\"user\",\"text\":\"x\",\"time\":\"2026-11-17T10:05:00Z\"}]");
        expect("", longTime.get(0).time, "una hora larga no se queda como hora de mensaje");
    }

    private static void clampByMessages() {
        List<OfflineChatFormat.Message> messages = OfflineChatFormat.parseMessages(
                "[{\"role\":\"user\",\"text\":\"primero\"},"
                        + "{\"role\":\"assistant\",\"text\":\"segundo grande\"},"
                        + "{\"role\":\"user\",\"text\":\"tercero\"}]");
        String newest = messages.get(2).text;
        List<OfflineChatFormat.Message> onlyNewest =
                OfflineChatFormat.clampMessages(messages, newest.length());
        expect(1, onlyNewest.size(), "solo cabe el mensaje mas reciente");
        expect(newest, onlyNewest.get(0).text, "el mensaje recortado esta completo");
        expect("user", onlyNewest.get(0).role, "el mensaje conserva su rol");

        int two = newest.length() + 1 + messages.get(1).text.length();
        List<OfflineChatFormat.Message> kept = OfflineChatFormat.clampMessages(messages, two);
        expect(2, kept.size(), "caben dos mensajes completos");
        expect(messages.get(2).text, kept.get(1).text, "se conserva el orden cronologico");
        expect(messages.get(1).text, kept.get(0).text, "no se parte el mensaje anterior");

        expect(0, OfflineChatFormat.clampMessages(messages, 0).size(), "tope cero no guarda nada");
        expect(0, OfflineChatFormat.clampMessages(null, 100).size(), "sin mensajes no hay nada");

        String huge = "x".repeat(OfflineChatStore.MAX_TEXT + 5000);
        List<OfflineChatFormat.Message> single = OfflineChatFormat.clampMessages(
                OfflineChatFormat.parseMessages("[{\"role\":\"user\",\"text\":\"" + huge + "\"}]"),
                OfflineChatStore.MAX_TEXT);
        expect(1, single.size(), "un unico mensaje gigante se conserva como ultimo recurso");
        expect(OfflineChatStore.MAX_TEXT, single.get(0).text.length(),
                "el ultimo recurso respeta el tope");
        String withEmoji = "a" + "\uD83D\uDE00" + "b";
        OfflineChatFormat.Message emoji = OfflineChatFormat.clampMessages(
                OfflineChatFormat.parseMessages("[{\"role\":\"user\",\"text\":\"" + withEmoji + "\"}]"), 2)
                .get(0);
        expect(true, emoji.text.length() <= 2, "el ultimo recurso no pasa del tope con emoji");
        expect(false, emoji.text.isEmpty() && Character.isLowSurrogate(emoji.text.charAt(0)),
                "el ultimo recurso no empieza a mitad de un emoji");
    }

    private static void legacyCompatibility() {
        String legacy = "{\"title\":\"Vieja\",\"text\":\"primer parrafo\\n\\nsegundo parrafo\","
                + "\"updatedAt\":\"2026-11-17T09:59:31.123Z\"}";
        OfflineChatStore.Chat chat = OfflineChatStore.fromJson(legacy);
        expect(true, chat != null, "una copia antigua de texto plano se sigue leyendo");
        expect("Vieja", chat == null ? null : chat.title, "el titulo antiguo sobrevive");
        expect("primer parrafo\n\nsegundo parrafo", chat == null ? null : chat.text,
                "los parrafos del texto plano se conservan");
        expect(0, chat == null ? -1 : chat.messages.size(), "el texto plano no inventa mensajes");
        String oldMarks = "### Usuario:\n\nhola\n\n---\n\n### Asistente:\n\nrespuesta\n\n- lista";
        List<OfflineChatFormat.Message> parsedLegacy = OfflineChatFormat.parseLegacy(oldMarks);
        expect(2, parsedLegacy.size(), "una copia antigua con marcas se separa en mensajes");
        expect(true, parsedLegacy.isEmpty() ? false : parsedLegacy.get(0).isUser(),
                "la copia antigua conserva el rol del usuario");
        expect("respuesta\n\n- lista", parsedLegacy.size() < 2 ? null : parsedLegacy.get(1).text,
                "la copia antigua conserva sus parrafos y listas");
        expect(0, OfflineChatFormat.parseLegacy("solo texto\n\nsin marcas").size(),
                "un texto plano sin marcas no se inventa mensajes");

        String iso = "2026-11-17T09:59:31.123Z";
        List<OfflineChatFormat.Message> messages = OfflineChatFormat.parseMessages(
                "[{\"role\":\"user\",\"text\":\"hola\"},"
                        + "{\"role\":\"assistant\",\"text\":\"respuesta\\n\\n- lista\"}]");
        String json = OfflineChatFormat.toJson("Charla", messages, iso);
        expect(true, json != null, "el formato nuevo serializa JSON");
        JSONObject object = null;
        try {
            object = new JSONObject(json);
        } catch (Exception invalid) {
            object = null;
        }
        expect(true, object != null, "el JSON estructurado es valido");
        expect(2, object == null ? -1 : object.optInt("v", 0), "el JSON lleva la version 2");
        expect(true, object == null ? false : object.has("messages"), "el JSON lleva messages[]");
        expect(4, object == null ? -1 : object.length(), "solo viajan v, title, messages y updatedAt");

        OfflineChatStore.Chat stored = OfflineChatStore.fromJson(json);
        expect(true, stored != null, "la copia estructurada se reconstruye");
        expect("Charla", stored == null ? null : stored.title, "el titulo estructurado sobrevive");
        expect(iso, stored == null ? null : stored.updatedAt, "la fecha estructurada sobrevive");
        expect(2, stored == null ? -1 : stored.messages.size(), "los mensajes estructurados sobreviven");
        expect(true, stored == null ? false : stored.messages.get(0).isUser(), "el rol sobrevive");
        expect(true, stored == null ? false : stored.text.contains("Tú: hola"),
                "el texto de respaldo usa las etiquetas del lector");
        expect(true, stored == null ? false : stored.text.contains("Agente: respuesta"),
                "el texto de respaldo separa los mensajes");

        String bad = "{\"v\":2,\"title\":\"t\",\"messages\":[],\"text\":\"\"}";
        expect(true, OfflineChatStore.fromJson(bad) == null,
                "un JSON estructurado sin mensajes ni texto no es copia");
        expect(true, OfflineChatStore.fromJson("{\"messages\":\"no-es-array\"}") == null,
                "messages mal tipado se rechaza");
    }

    private static void cleanSymbols() {
        expect("A & B <C> \"D\" E", OfflineChatFormat.sanitize(
                "A &amp; B &lt;C&gt; &quot;D&quot; E"), "se limpian las entidades HTML");
        expect("a b", OfflineChatFormat.sanitize("a\u00A0b"), "el espacio duro pasa a normal");
        expect("ab", OfflineChatFormat.sanitize("a" + (char) 0x200B + "b"),
                "se quita el zero-width");
        expect("ab", OfflineChatFormat.sanitize("a" + (char) 0 + "b" + (char) 0x07),
                "se quitan los caracteres de control");
        expect("linea\nlinea", OfflineChatFormat.sanitize("linea\r\nlinea"),
                "CRLF se normaliza a LF");
        expect("a\n\nb", OfflineChatFormat.sanitize("a\n\n\n\nb"),
                "los saltos de mas se recortan a un parrafo");
        expect("x", OfflineChatFormat.sanitize("  x  "), "se recortan los extremos");
        expect("- uno\n> cita\n```\ncodigo\n```",
                OfflineChatFormat.sanitize("- uno\n> cita\n```\ncodigo\n```"),
                "listas, citas y codigo se conservan tal cual");
        expect("García, ¿qué?", OfflineChatFormat.sanitize("García, ¿qué?"),
                "los acentos ya correctos no se tocan");
        expect("García", OfflineChatFormat.sanitize(mojibake("García")),
                "se repara el mojibake UTF-8/ISO-8859-1");
        String broken = new String(new char[]{(char) 0xE0, (char) 0x80});
        expect(broken, OfflineChatFormat.sanitize(broken),
                "una secuencia rota que no es UTF-8 se deja como esta");
        expect("", OfflineChatFormat.sanitize(null), "null queda vacio");
        expect("hola", OfflineChatFormat.decodeEntities("hola"), "sin '&' no hay nada que decodificar");
        expect("A&B", OfflineChatFormat.decodeEntities("A&amp;B"), "decodeEntities suelto");
        expect("assistant", OfflineChatFormat.normalizeRole(null), "rol null cae en assistant");
        expect("user", OfflineChatFormat.normalizeRole(" HUMAN "), "rol human pasa a user");
        expect("user", OfflineChatFormat.normalizeRole("tú"), "rol tu pasa a user");
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
