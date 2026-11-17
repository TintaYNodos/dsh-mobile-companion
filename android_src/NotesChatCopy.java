/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * «Copiar para el chat»: deja en el portapapeles una referencia de una línea
 * para pegar en cualquier chat de Harness, del tipo `Revisa la nota «…»
 * @companion/synced_chats/notes/<archivo>.md`, para que el agente lea el
 * archivo de la nota en la PC.
 *
 * La decisión y el texto son métodos puros (sin Android en ejecución), de modo
 * que la prueba Java los comprueba en la JVM. El envío reutiliza {@link NotesSync}
 * sin cambiar el comportamiento de «Enviar»: solo se envía cuando la nota no
 * está enviada y el usuario pulsa «Copiar para el chat». Las notas `localOnly`
 * no salen nunca del teléfono.
 *
 * El nombre del archivo lo asigna el puente al guardar la nota. Para poder
 * copiar la referencia en cualquier momento (aunque la app se haya reiniciado),
 * {@link NotesSync} lo guarda en un índice local por id. El índice se cifra con
 * {@link KeyStoreVault} porque el nombre incluye un resumen del título; si el
 * almacén seguro no está disponible queda en claro, como el respaldo de notas.
 */
final class NotesChatCopy {

    /** Texto exacto que se deja en el portapapeles. */
    static final String REFERENCE_HEAD = "Revisa la nota «";
    static final String REFERENCE_MIDDLE = "» @companion/synced_chats/notes/";

    static final String COPIED_MESSAGE = "Copiado. Pégalo en el chat que quieras.";
    static final String SEND_FAILED_MESSAGE =
            "No se pudo enviar: no hay archivo que el agente pueda leer";
    static final String LOCAL_ONLY_MESSAGE =
            "Nota solo en el teléfono: no sale del teléfono y el agente no puede leerla";
    static final String NO_FILE_MESSAGE =
            "No se conoce el archivo de esta nota en la PC: envíala una vez con «Enviar» y vuelve a copiar";
    static final String NO_TITLE_MESSAGE =
            "La nota necesita un título antes de copiarla para el chat";
    static final String COPY_FAILED_MESSAGE = "No se pudo copiar la referencia";

    /** Índice id -> archivo remoto; nombre sin extensión significativa de app. */
    private static final String INDEX_NAME = "notes_remote.dat";
    private static final int MAX_INDEX_LINES = 400;

    /** Qué hacer al pulsar «Copiar para el chat». */
    enum Step {
        /** Ya enviada y con archivo conocido: solo copiar. */
        COPY,
        /** Pendiente de envío: enviar con NotesSync y copiar si hay archivo. */
        SEND_THEN_COPY,
        REFUSE_LOCAL_ONLY,
        REFUSE_NO_TITLE,
        REFUSE_NO_FILE
    }

    private NotesChatCopy() {
    }

    // ------------------------------------------------------------------
    // Lógica pura (probada en la JVM)
    // ------------------------------------------------------------------

    /** Decide el paso sin tocar Android: localOnly y título manda primero. */
    static Step stepFor(boolean localOnly, boolean synced, String title, String knownFile) {
        if (localOnly) return Step.REFUSE_LOCAL_ONLY;
        if (title == null || title.trim().isEmpty()) return Step.REFUSE_NO_TITLE;
        if (synced) {
            return safeFile(knownFile).isEmpty() ? Step.REFUSE_NO_FILE : Step.COPY;
        }
        return Step.SEND_THEN_COPY;
    }

    /**
     * Texto que se copia: una sola línea, sin ruta absoluta y con el título y el
     * archivo tal como los conoce la app (el título se recorta y se aplana).
     * Devuelve "" si falta el título o el nombre de archivo no es válido.
     */
    static String reference(String title, String file) {
        String cleanTitle = oneLine(title);
        String cleanFile = safeFile(file);
        if (cleanTitle.isEmpty() || cleanFile.isEmpty()) return "";
        return REFERENCE_HEAD + cleanTitle + REFERENCE_MIDDLE + cleanFile;
    }

    /**
     * Nombre de archivo que el agente puede abrir: solo el nombre base `.md`,
     * sin barras, sin `..` y sin caracteres de control. Devuelve "" si no vale.
     */
    static String safeFile(String file) {
        if (file == null) return "";
        String name = file.trim();
        if (name.length() <= 3 || !name.endsWith(".md") || name.contains("..")) return "";
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (c == '/' || c == '\\' || c < 0x20 || c == 0x7f) return "";
        }
        return name;
    }

    private static String oneLine(String value) {
        if (value == null) return "";
        return value.replace('\r', ' ').replace('\n', ' ').replace('\t', ' ').trim();
    }

    // ------------------------------------------------------------------
    // Índice local id -> archivo del puente
    // ------------------------------------------------------------------

    /** Guarda (o reemplaza) el archivo que el puente asignó a una nota. */
    static synchronized void remember(File directory, Context context, String id, String file) {
        String noteId = id == null ? "" : id.trim();
        String name = safeFile(file);
        if (directory == null || noteId.isEmpty() || name.isEmpty()) return;
        StringBuilder merged = new StringBuilder();
        for (String line : readIndex(directory, context)) {
            if (line.startsWith(noteId + "\t")) continue;
            if (merged.length() > 0) merged.append('\n');
            merged.append(line);
        }
        if (merged.length() > 0) merged.append('\n');
        merged.append(noteId).append('\t').append(name);
        writeIndex(directory, context, merged.toString());
    }

    /** Archivo remoto recordado para la nota, o "" si no se conoce. */
    static synchronized String known(File directory, Context context, String id) {
        String noteId = id == null ? "" : id.trim();
        if (directory == null || noteId.isEmpty()) return "";
        for (String line : readIndex(directory, context)) {
            int tab = line.indexOf('\t');
            if (tab <= 0) continue;
            if (noteId.equals(line.substring(0, tab))) return safeFile(line.substring(tab + 1));
        }
        return "";
    }

    private static List<String> readIndex(File directory, Context context) {
        List<String> lines = new ArrayList<>();
        if (directory == null) return lines;
        String raw;
        try {
            raw = readText(new File(directory, INDEX_NAME));
        } catch (Throwable unreadable) {
            return lines;
        }
        String plain = KeyStoreVault.decryptForStorage(context, raw);
        for (String line : plain.split("\n", -1)) {
            String entry = line.trim();
            if (entry.isEmpty() || !entry.contains("\t")) continue;
            if (lines.size() >= MAX_INDEX_LINES) break;
            lines.add(entry);
        }
        return lines;
    }

    private static void writeIndex(File directory, Context context, String text) {
        if (directory == null) return;
        String sealed = KeyStoreVault.encryptForStorage(context, text);
        File target = new File(directory, INDEX_NAME);
        File temp = new File(directory, INDEX_NAME + ".tmp");
        try {
            FileOutputStream output = new FileOutputStream(temp);
            try {
                output.write(sealed.getBytes(StandardCharsets.UTF_8));
            } finally {
                output.close();
            }
        } catch (Throwable failed) {
            return;
        }
        if (!temp.renameTo(target)) {
            target.delete();
            temp.renameTo(target);
        }
    }

    private static String readText(File file) throws Exception {
        InputStream input = new FileInputStream(file);
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[2048];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            input.close();
        }
    }

    // ------------------------------------------------------------------
    // Acción del editor
    // ------------------------------------------------------------------

    /**
     * Flujo del botón: valida, envía si hace falta y copia la referencia. Un
     * fallo de envío no copia nada y se avisa con {@link #SEND_FAILED_MESSAGE}.
     */
    static void copy(Activity activity, NotesStore store, NotesStore.Draft draft, String noteId) {
        if (activity == null || store == null || draft == null) return;
        File directory = filesDirectory(activity);
        Context context = activity.getApplicationContext();
        NotesStore.Note note = noteId == null ? null : store.get(noteId);
        boolean synced = note != null && note.synced;
        String knownFile = note == null ? "" : known(directory, context, note.id);
        Step step = stepFor(draft.localOnly, synced, draft.title, knownFile);
        switch (step) {
            case COPY:
                copyText(activity, reference(draft.title, knownFile));
                return;
            case SEND_THEN_COPY:
                sendThenCopy(activity, store, note, directory, context);
                return;
            case REFUSE_LOCAL_ONLY:
                toast(activity, LOCAL_ONLY_MESSAGE);
                return;
            case REFUSE_NO_TITLE:
                toast(activity, NO_TITLE_MESSAGE);
                return;
            default:
                toast(activity, NO_FILE_MESSAGE);
        }
    }

    private static void sendThenCopy(Activity activity, NotesStore store, NotesStore.Note note,
                                     File directory, Context context) {
        if (note == null) {
            toast(activity, SEND_FAILED_MESSAGE);
            return;
        }
        NotesSync.sendNote(activity, store, note, report -> {
            String file = known(directory, context, note.id);
            if (report == null || !report.allSent() || file.isEmpty()) {
                toast(activity, SEND_FAILED_MESSAGE);
                return;
            }
            copyText(activity, reference(note.title, file));
        });
    }

    private static void copyText(Activity activity, String text) {
        if (text.isEmpty()) {
            toast(activity, NO_FILE_MESSAGE);
            return;
        }
        try {
            ClipboardManager manager =
                    (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (manager == null) {
                toast(activity, COPY_FAILED_MESSAGE);
                return;
            }
            manager.setPrimaryClip(ClipData.newPlainText("Nota para el chat", text));
            haptic(activity);
            toast(activity, COPIED_MESSAGE);
        } catch (Throwable error) {
            toast(activity, COPY_FAILED_MESSAGE);
        }
    }

    /** Mismo patrón háptico que las acciones de la app (sin vibrar de más). */
    private static void haptic(Activity activity) {
        try {
            View decor = activity.getWindow() == null ? null : activity.getWindow().getDecorView();
            if (decor != null) decor.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
        } catch (Throwable ignored) {
        }
    }

    private static File filesDirectory(Activity activity) {
        try {
            return activity.getFilesDir();
        } catch (Throwable missing) {
            return null;
        }
    }

    private static void toast(Activity activity, String message) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
    }
}
