/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

/**
 * Prueba Java pura de NotesStore (sin Android en ejecución): CRUD, búsqueda sin
 * acentos, id estable, cifrado en reposo, migración del formato plano, respaldo
 * de archivos dañados y escritura atómica, sobre directorios temporales.
 *
 * El cifrador real usa el AndroidKeyStore, que no existe en una JVM: aquí se
 * inyecta {@link NotesTestCipher} (AES-256-GCM con clave fija), que es la
 * dependencia inyectable que exige el diseño de {@link NotesStore}.
 *
 * Las comprobaciones del esquema nuevo (perfiles, vencimiento, localOnly,
 * filtros, payload y compartir) viven en {@link NotesStoreExtras} para que ambos
 * archivos queden por debajo del límite de líneas del proyecto; este `main` las
 * ejecuta todas.
 *
 * Nota: `android.jar` trae org.json como stubs que lanzan "Stub!" fuera del
 * dispositivo, así que `android_src/tests/support/org/json` aporta una
 * implementación mínima y real de org.json solo para los tests. No entra en el
 * APK: build-apk.ps1 compila solo `android_src\*.java` (sin recursión).
 */
final class NotesStoreTest {

    static int checks = 0;
    static int failures = 0;
    static final NotesTestCipher CIPHER = new NotesTestCipher();

    private NotesStoreTest() {
    }

    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("dsh-notes-test").toFile();
        try {
            runCore(sub(root, "core"));
            runCrypto(sub(root, "crypto"));
            runFallback(sub(root, "fallback"));
            runMigration(sub(root, "migration"));
            runTamper(sub(root, "tamper"));
            runAtomic(sub(root, "atomic"));
            runRecovery(sub(root, "recovery"));
            NotesStoreExtras.run(sub(root, "extras"));
            NotesStoreCatalogTest.run(sub(root, "catalog"));
            NotesChatCopyTest.run(sub(root, "chatcopy"));
        } finally {
            deleteRecursively(root);
        }
        System.out.println("NotesStore: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (CRUD, cifrado/migración, búsqueda, perfiles, "
                + "vencimiento, localOnly, filtros, payload, compartir y «Copiar para el chat»)");
    }

    // ------------------------------------------------------------------
    // CRUD, búsqueda y archivo cifrado
    // ------------------------------------------------------------------

    private static void runCore(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        File notesFile = new File(dir, NotesFile.FILE_NAME);
        File tempFile = new File(dir, NotesFile.TEMP_FILE_NAME);
        File corruptFile = new File(dir, NotesFile.CORRUPT_FILE_NAME);

        expect(true, store.list().isEmpty(), "lista vacía al empezar");
        expect(true, store.get("nada") == null, "get de id inexistente devuelve null");
        expect(true, store.visibleNotes().isEmpty(), "visibleNotes vacío al empezar");

        NotesStore.Note first = store.add("Primera", "cuerpo uno");
        expect(true, first != null, "add devuelve la nota");
        expect(true, first != null && !first.id.isEmpty(), "la nota nueva tiene id");
        expect(false, first.synced, "la nota nace sin sincronizar");
        expect(1, store.list().size(), "una nota tras el primer add");
        expect("Primera", store.get(first.id).title, "get devuelve el título");
        expect("cuerpo uno", store.get(first.id).body, "get devuelve el cuerpo");
        expect(true, first.createdAt > 0L, "createdAt se rellena");
        expect(first.createdAt, first.updatedAt, "al crear, updatedAt == createdAt");
        expect(NotesCatalog.PROFILE_GENERAL, first.profile, "add simple usa perfil general");
        expect(NotesCatalog.TYPE_NOTE, first.type, "add simple usa tipo note");
        expect("", first.status, "nota general sin estado");
        expect(NotesCatalog.PRIORITY_MEDIUM, first.priority, "nota simple con prioridad media");
        expect(0, first.tags.size(), "nota simple sin etiquetas");
        expect("", first.dueDate, "nota simple sin vencimiento");
        expect(false, first.localOnly, "nota simple sin localOnly");
        expect(false, NotesStore.isLocalOnly(first), "isLocalOnly false en nota normal");
        expect(false, NotesStore.isLocalOnly(null), "isLocalOnly tolera null");
        expect(1, store.visibleNotes().size(), "visibleNotes incluye la nota");
        expect(NotesStore.LOCAL_ONLY_LABEL, NotesStore.localOnlyLabel(), "localOnlyLabel para la interfaz");

        expect(true, notesFile.isFile(), "notes.json existe en el directorio");
        byte[] raw = NotesTestCipher.raw(dir);
        expect(true, NotesFile.isEncrypted(raw), "el archivo nuevo nace cifrado");
        expect(false, new String(raw, StandardCharsets.ISO_8859_1).contains("Primera"),
                "el título no queda en claro en el archivo");
        expect(false, tempFile.exists(), "no queda temporal tras escribir");
        expect(false, corruptFile.exists(), "sin respaldo si el contenido es válido");
        String json = CIPHER.readJson(dir);
        expect(true, json.trim().startsWith("["), "el archivo descifrado es un array JSON");
        for (String key : new String[]{"id", "synced", "updatedAt", "profile", "type",
                "tags", "priority", "dueDate", "localOnly"}) {
            expect(true, json.contains("\"" + key + "\""), "el JSON guarda " + key);
        }

        NotesStore.Note second = store.add("Segunda", "nota sobre café y planes");
        expect(true, second != null, "segunda nota creada");
        expect(2, store.list().size(), "dos notas tras el segundo add");

        NotesStore.Note updated = store.update(first.id, "Primera editada", "nuevo cuerpo");
        expect(true, updated != null, "update devuelve la nota actualizada");
        expect("Primera editada", updated.title, "update cambia el título");
        expect(true, updated.updatedAt >= first.updatedAt, "updatedAt no retrocede");
        expect(updated.createdAt, first.createdAt, "update conserva createdAt");
        expect(first.id, updated.id, "update conserva el id (id estable)");
        expect("nuevo cuerpo", store.get(first.id).body, "el cambio persiste en disco");
        expect(true, store.update("no-existe", "x", "y") == null, "update de id inexistente devuelve null");

        NotesStore.Note third = store.add("García en el café", "crónica del puerto");
        expect(true, third != null, "tercera nota con acentos");
        expect(3, store.list().size(), "tres notas antes de buscar");
        expect(3, store.search("").size(), "búsqueda vacía devuelve todas");
        expect(3, store.search("   ").size(), "búsqueda en blanco devuelve todas");
        expect(2, store.search("CAFÉ").size(), "búsqueda sin distinguir mayúsculas");
        expect(1, store.search("garcia").size(), "búsqueda sin acentos encuentra García");
        expect(1, store.search("GARCÍA").size(), "búsqueda acentuada encuentra García");
        expect(third.id, store.search("garcia").get(0).id, "la búsqueda devuelve la nota correcta");
        expect(2, store.search("cafe").size(), "cafe sin tilde encuentra café");
        expect(1, store.search("cronica").size(), "cronica sin tilde encuentra crónica");
        expect(0, store.search("inexistente").size(), "búsqueda sin coincidencias");
        expect(first.id, store.search("editada").get(0).id, "búsqueda en el cuerpo y el título");

        expect(true, store.markSynced(second.id), "markSynced devuelve true");
        expect(true, store.get(second.id).synced, "markSynced marca la nota");
        expect(second.id, store.get(second.id).id, "markSynced no regenera el id");
        expect(false, store.get(first.id).synced, "las demás notas siguen pendientes");
        expect(true, store.markSynced(second.id), "markSynced es idempotente");
        expect(true, store.get(second.id).synced, "idempotente conserva synced");
        expect(true, store.update(second.id, "Segunda", "nota sobre café y planes").synced,
                "guardar sin cambios conserva synced (no reencola)");
        expect(true, new NotesStore(dir, CIPHER).get(second.id).synced,
                "synced persiste al reabrir");
        expect(false, store.markSynced("no-existe"), "markSynced de id inexistente es false");
        expect(3, store.list().size(), "markSynced no borra notas");

        store.update(second.id, "Segunda", "cambio");
        expect(false, store.get(second.id).synced, "editar una nota la deja pendiente");
        expect(second.id, store.get(second.id).id, "editar no cambia el id");

        NotesStore.Note titleOnly = store.add("Solo título", "");
        expect(true, titleOnly != null, "se guarda una nota solo con título");
        expect("", titleOnly.body, "la nota solo con título no tiene cuerpo");
        JSONObject payload = NotesSync.payloadFor(titleOnly);
        expect("Solo título", payload.optString("title", ""), "el payload lleva el título solo");
        expect("", payload.optString("body", ""), "el payload acepta cuerpo vacío");
        expect(titleOnly.id, payload.optString("id", ""), "el payload lleva el id estable");
        expect(false, payload.has("localOnly"), "el payload no incluye localOnly");
        expect(false, payload.toString().contains("chat"), "el payload ya no lleva destino de chat");
        expect("", payload.optString("dueDate", ""), "el payload envía dueDate vacío si no hay");

        int beforeRemove = store.list().size();
        expect(true, store.remove(first.id), "remove devuelve true");
        expect(true, store.get(first.id) == null, "la nota borrada ya no está");
        expect(beforeRemove - 1, store.list().size(), "queda una nota menos");
        expect(false, store.remove("no-existe"), "remove de id inexistente es false");

        NotesStore reopened = new NotesStore(dir, CIPHER);
        expect(store.list().size(), reopened.list().size(), "otra instancia lee las notas");
        expect(true, reopened.get(second.id) != null, "los datos persisten entre instancias");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(dir)), "el archivo sigue cifrado al reabrir");
    }

    // ------------------------------------------------------------------
    // Cifrado en reposo y respaldo si el keystore no está
    // ------------------------------------------------------------------

    private static void runCrypto(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        NotesStore.Note note = store.add("Cifrada", "cuerpo secreto");
        expect(true, note != null, "nota creada con cifrador inyectado");
        byte[] raw = NotesTestCipher.raw(dir);
        expect(true, NotesFile.isEncrypted(raw), "el archivo lleva la cabecera mágica");
        expect(true, NotesFile.MAGIC.length < raw.length, "hay datos después de la cabecera");
        expect(true, NotesFile.payload(raw).length > 0, "payload cifrado no vacío");
        String visible = new String(raw, StandardCharsets.ISO_8859_1);
        expect(false, visible.contains("Cifrada"), "el título no aparece en claro");
        expect(false, visible.contains("cuerpo secreto"), "el cuerpo no aparece en claro");
        expect(false, new File(dir, NotesFile.TEMP_FILE_NAME).exists(), "sin temporal tras cifrar");
        expect(true, CIPHER.readJson(dir).contains(note.id), "el id se conserva tras descifrar");
        expect(true, CIPHER.readJson(dir).contains("\"title\":\"Cifrada\""), "el JSON descifrado es correcto");

        NotesStore other = new NotesStore(dir, new NotesTestCipher());
        expect(1, other.list().size(), "otra instancia descifra el archivo");
        expect("Cifrada", other.get(note.id).title, "el título sobrevive al descifrado");
        expect(true, other.markSynced(note.id), "markSynced funciona sobre archivo cifrado");
        expect(true, new NotesStore(dir, CIPHER).get(note.id).synced, "synced persiste cifrado");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(dir)), "markSynced reescribe cifrado");
    }

    private static void runFallback(File dir) throws Exception {
        NotesStore failing = new NotesStore(dir, new FailingNotesCipher());
        expect(false, failing.isPlaintextFallback(), "sin fallo todavía no hay respaldo plano");
        NotesStore.Note note = failing.add("Sin keystore", "se guarda plano");
        expect(true, note != null, "sin keystore la nota no se pierde");
        expect(true, failing.isPlaintextFallback(), "el fallo de cifrado se expone a la interfaz");
        byte[] raw = NotesTestCipher.raw(dir);
        expect(false, NotesFile.isEncrypted(raw), "el respaldo queda en JSON plano");
        expect(true, new String(raw, StandardCharsets.UTF_8).contains("Sin keystore"),
                "el JSON plano conserva la nota");
        expect(1, failing.list().size(), "el respaldo plano se puede leer");
        expect("Sin keystore", failing.list().get(0).title, "el respaldo conserva el título");

        NotesStore migrator = new NotesStore(dir, CIPHER);
        expect(1, migrator.list().size(), "el cifrador nuevo lee el respaldo plano");
        expect(false, migrator.isPlaintextFallback(), "con cifrador bueno no hay respaldo plano");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(dir)),
                "al leer el plano se migra a cifrado");
        expect(false, new File(dir, NotesFile.CORRUPT_FILE_NAME).exists(),
                "el respaldo plano no se marca como corrupto");
    }

    // ------------------------------------------------------------------
    // Migración del archivo plano antiguo y tolerancia
    // ------------------------------------------------------------------

    private static void runMigration(File dir) throws Exception {
        File notesFile = new File(dir, NotesFile.FILE_NAME);
        write(notesFile, "[{\"id\":\"legacy-1\",\"title\":\"Vieja\",\"body\":\"cuerpo viejo\","
                + "\"createdAt\":1000,\"updatedAt\":2000,\"synced\":true},"
                + "{\"id\":\"legacy-2\",\"title\":\"Con tags\",\"body\":\"\","
                + "\"tags\":\"guion, escena\",\"createdAt\":10,\"updatedAt\":20},"
                + "{\"title\":\"sin id\"}]");
        NotesStore legacy = new NotesStore(dir, CIPHER);
        expect(2, legacy.list().size(), "la migración salta la entrada sin id");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(dir)),
                "leer el formato plano lo migra a cifrado");
        expect(false, new File(dir, NotesFile.CORRUPT_FILE_NAME).exists(),
                "leer el formato anterior no genera respaldo corrupto");
        NotesStore.Note old = legacy.get("legacy-1");
        expect(true, old != null, "la nota antigua se lee");
        expect(NotesCatalog.PROFILE_GENERAL, old.profile, "migración: perfil general");
        expect(NotesCatalog.TYPE_NOTE, old.type, "migración: tipo note");
        expect("", old.status, "migración: sin estado");
        expect(NotesCatalog.PRIORITY_MEDIUM, old.priority, "migración: prioridad media");
        expect("", old.project, "migración: sin proyecto");
        expect("", old.subject, "migración: sin personaje/módulo");
        expect("", old.dueDate, "migración: sin vencimiento");
        expect(false, old.localOnly, "migración: localOnly false");
        expect(0, old.tags.size(), "migración: sin etiquetas");
        expect(true, old.synced, "migración: conserva synced");
        expect(1000L, old.createdAt, "migración: conserva createdAt");
        expect(2000L, old.updatedAt, "migración: conserva updatedAt");
        NotesStore.Note tagged = legacy.get("legacy-2");
        expect(2, tagged.tags.size(), "migración: tolera etiquetas como texto");
        expect("guion, escena", tagged.tagsText(), "migración: etiquetas de texto separadas");
        expect(true, old.updatedAt > tagged.updatedAt, "migración: el orden temporal se conserva");
        legacy.update("legacy-1", "Vieja editada", "cuerpo nuevo");
        String migrated = CIPHER.readJson(dir);
        expect(true, migrated.contains("\"profile\":\"general\""), "al escribir usa el esquema canónico");
        expect(true, migrated.contains("\"type\":\"note\""), "el esquema canónico guarda note");
        expect(false, migrated.contains("sin id"), "la entrada inválida no se reescribe");
    }

    // ------------------------------------------------------------------
    // Integridad, escritura atómica y JSON corrupto
    // ------------------------------------------------------------------

    private static void runTamper(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        store.add("Integridad", "cuerpo");
        File notesFile = new File(dir, NotesFile.FILE_NAME);
        byte[] raw = NotesTestCipher.raw(dir);
        raw[raw.length - 1] ^= (byte) 0xFF;
        Files.write(notesFile.toPath(), raw);

        NotesStore broken = new NotesStore(dir, CIPHER);
        expect(0, broken.list().size(), "un archivo manipulado se rechaza");
        File corrupt = new File(dir, NotesFile.CORRUPT_FILE_NAME);
        expect(true, corrupt.isFile(), "el archivo manipulado se conserva como corrupto");
        expect(false, notesFile.exists(), "el archivo manipulado se aparta del camino");
        expect(true, new NotesStore(dir, CIPHER).add("Tras manipulación", "ok") != null,
                "se puede volver a escribir tras el respaldo");
        expect(1, new NotesStore(dir, CIPHER).list().size(), "la nota nueva se lee");
    }

    private static void runAtomic(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        expect(true, store.add("Antes", "ok") != null, "nota previa a la escritura atómica");
        File tempFile = new File(dir, NotesFile.TEMP_FILE_NAME);
        expect(true, tempFile.mkdir(), "se bloquea el temporal con un directorio");
        expect(true, store.add("No debe entrar", "bloqueado") == null, "add falla si no puede escribir");
        expect(1, store.list().size(), "la lista no cambia tras el fallo");
        expect(true, CIPHER.readJson(dir).contains("Antes"), "el archivo anterior sigue intacto");
        expect(true, tempFile.delete(), "se retira el bloqueo del temporal");
        expect(true, store.add("Después", "ok") != null, "vuelve a escribir tras desbloquear");
        expect(false, tempFile.exists(), "sin temporal al terminar");
        expect(2, store.list().size(), "las dos notas están tras recuperar");
    }

    private static void runRecovery(File dir) throws Exception {
        File notesFile = new File(dir, NotesFile.FILE_NAME);
        write(notesFile, "{esto no es json");
        NotesStore recovered = new NotesStore(dir, CIPHER);
        File corrupt = new File(dir, NotesFile.CORRUPT_FILE_NAME);
        expect(0, recovered.list().size(), "JSON corrupto se tolera con lista vacía");
        expect(true, corrupt.isFile(), "se respalda el archivo dañado");
        expect(true, read(corrupt).contains("esto no es json"), "el respaldo conserva el contenido");
        expect(false, notesFile.exists(), "el archivo corrupto se aparta del camino");
        expect(true, recovered.add("Después del caos", "funciona") != null, "se puede escribir tras recuperar");
        expect(1, recovered.list().size(), "la nota nueva está en la lista");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(dir)), "la recuperación escribe cifrado");
    }

    // ------------------------------------------------------------------
    // Utilidades compartidas con NotesStoreExtras
    // ------------------------------------------------------------------

    static NotesFilter onlyProfile(String profile) {
        NotesFilter filter = new NotesFilter();
        filter.profile = profile;
        return filter;
    }

    static boolean containsId(List<NotesStore.Note> notes, String id) {
        for (NotesStore.Note note : notes) {
            if (note != null && note.id.equals(id)) return true;
        }
        return false;
    }

    static File sub(File parent, String name) {
        File dir = new File(parent, name);
        dir.mkdirs();
        return dir;
    }

    static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    static void expect(long expected, long actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    static void expect(String expected, String actual, String label) {
        checks++;
        boolean same = expected == null ? actual == null : expected.equals(actual);
        if (!same) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    static String read(File file) throws Exception {
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    static void write(File file, String content) throws Exception {
        Files.write(file.toPath(), content.getBytes(StandardCharsets.UTF_8));
    }

    private static void deleteRecursively(File target) {
        if (target == null || !target.exists()) return;
        File[] children = target.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        target.delete();
    }
}
