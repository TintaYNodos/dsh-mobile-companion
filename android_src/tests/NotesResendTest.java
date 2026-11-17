/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.io.File;
import java.nio.file.Files;
import java.util.List;

/**
 * Regresión Java pura del reenvío de notas: la marca `synced` debe persistir y
 * una nota ya enviada no puede volver a la cola al reabrir el editor.
 *
 * El fallo reportado era ese bucle: al guardar sin cambios (abrir y cerrar el
 * editor, o el autoguardado al pausar) la nota perdía la marca, «Enviar todas»
 * la veía pendiente y la misma nota se POSTeaba otra vez a la PC. Aquí se
 * ejercita la lógica real de {@link NotesStore} y el filtro de pendientes de
 * {@link NotesSender}, sin Android en ejecución.
 *
 * No entra en el APK (build-apk.ps1 compila `android_src\*.java`, sin tests).
 * Se compila y ejecuta junto al resto de pruebas Java del proyecto:
 *
 *   javac -encoding UTF-8 -cp android.jar -d out\test android_src\*.java ^
 *       android_src\tests\*.java android_src\tests\support\org\json\*.java
 *   java -cp "out\test;android.jar" com.tintaynodos.dshcompanion.NotesResendTest
 */
final class NotesResendTest {

    private static final NotesTestCipher CIPHER = new NotesTestCipher();
    private static int checks = 0;
    private static int failures = 0;

    private NotesResendTest() {
    }

    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("dsh-notes-resend").toFile();
        try {
            markPersists(sub(root, "persist"));
            noRequeueOnReopen(sub(root, "reopen"));
            failureKeepsPending(sub(root, "failure"));
            sendAllSkipsSent(sub(root, "send-all"));
        } finally {
            delete(root);
        }
        System.out.println("NotesResend: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (la marca enviada persiste y no se reencola)");
    }

    /** (a) El envío correcto deja `synced=true` en `notes.json`. */
    private static void markPersists(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        NotesStore.Note note = store.add("Informe", "cuerpo");
        expect(true, note != null, "nota creada para probar la marca");
        expect(true, store.markSynced(note.id), "el envío correcto marca la nota");
        NotesStore.Note fresh = new NotesStore(dir, CIPHER).get(note.id);
        expect(true, fresh != null && fresh.synced, "synced sobrevive a reabrir la app");
        expect(true, CIPHER.readJson(dir).contains("\"synced\":true"), "notes.json guarda synced");
    }

    /** El editor guarda sin cambios al abrir o cerrar: no debe reencolar la nota. */
    private static void noRequeueOnReopen(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        NotesStore.Note note = store.add("Guion", "escena 1");
        store.markSynced(note.id);
        long updatedAt = store.get(note.id).updatedAt;
        NotesStore.Note saved = store.update(note.id, NotesStore.Draft.from(store.get(note.id)));
        expect(true, saved != null && saved.synced, "guardar sin cambios conserva synced");
        expect(updatedAt, saved.updatedAt, "guardar sin cambios no mueve updatedAt");
        expect(0, NotesSender.pending(store.list()).size(), "una enviada no vuelve a la cola");
        NotesStore.Note reopened = store.update(note.id, note.title, note.body);
        expect(true, reopened != null && reopened.synced,
                "update(título, cuerpo) sin cambios conserva synced");
        expect(true, new NotesStore(dir, CIPHER).get(note.id).synced, "sigue marcada en disco");
    }

    /** (b) Un envío fallido no marca: la nota queda pendiente y se reintenta. */
    private static void failureKeepsPending(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        NotesStore.Note note = store.add("Sin PC", "contenido");
        expect(false, store.get(note.id).synced, "un envío fallido no marca la nota");
        expect(1, NotesSender.pending(store.list()).size(), "sigue pendiente para reintentar");
        expect(true, new NotesStore(dir, CIPHER).get(note.id) != null, "no se pierde al fallar");
        expect(true, store.markSynced(note.id), "el reintento manual marca la nota");
        expect(0, NotesSender.pending(store.list()).size(), "tras el reintento sale de la cola");

        NotesStore.Note edited = store.update(note.id, "Sin PC editada", "contenido nuevo");
        expect(true, edited != null && !edited.synced, "editar de verdad la deja pendiente");
        expect(1, NotesSender.pending(store.list()).size(), "el cambio se reenvía a mano");

        NotesStore.Draft secret = new NotesStore.Draft();
        secret.title = "Privada";
        secret.localOnly = true;
        store.add(secret);
        expect(1, NotesSender.pending(store.list()).size(), "la nota localOnly no entra al lote");
    }

    /** (c) «Enviar todas» solo toma pendientes; (d) la enviada se reenvía a mano. */
    private static void sendAllSkipsSent(File dir) throws Exception {
        NotesStore store = new NotesStore(dir, CIPHER);
        NotesStore.Note sent = store.add("Ya enviada", "cuerpo");
        NotesStore.Note pending = store.add("Pendiente", "otro");
        store.markSynced(sent.id);
        List<NotesStore.Note> batch = NotesSender.pending(store.visibleNotes());
        expect(1, batch.size(), "«Enviar todas» solo toma la pendiente");
        expect(pending.id, batch.get(0).id, "la nota enviada no vuelve a enviarse");
        expect(true, NotesPayload.forNote(store.get(sent.id)) != null,
                "el reenvío manual explícito sigue disponible");
    }

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------

    private static File sub(File parent, String name) {
        File dir = new File(parent, name);
        dir.mkdirs();
        return dir;
    }

    private static void delete(File target) {
        File[] children = target.listFiles();
        if (children != null) {
            for (File child : children) delete(child);
        }
        target.delete();
    }

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
