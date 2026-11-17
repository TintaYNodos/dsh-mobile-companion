/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * Lógica de envío de la lista de notas: qué está pendiente, cuántas notas se
 * quedan fuera, el diálogo de confirmación de «Enviar todas» y las acciones de
 * envío de la pantalla. También presta a la pantalla el banner del aviso de
 * almacenamiento sin cifrar.
 *
 * Se separa de {@link NotesActivity} para que esa pantalla quede por debajo del
 * límite de líneas del proyecto. No toca el almacén: solo lee la lista que se le
 * pasa; {@link NotesSync} hace la petición y omite las notas `localOnly`.
 */
final class NotesSender {

    /** Aviso cuando no hay ninguna PC configurada o alcanzable. */
    static final String NO_PC_MESSAGE =
            "PC no disponible: las notas se quedan en el teléfono";

    /** Aviso cuando el AndroidKeyStore no está disponible y se guarda en claro. */
    static final String PLAINTEXT_WARNING =
            "Aviso: el almacenamiento seguro no está disponible; "
                    + "las notas se guardan sin cifrar en este teléfono.";

    private NotesSender() {
    }

    /** true si hay una PC (bunquer) configurada y en uso en este teléfono. */
    static boolean hasPc(Activity activity) {
        if (activity == null) return false;
        String url = MainActivity.getActiveBunkerUrl(activity);
        return url != null && !url.trim().isEmpty();
    }

    /** Aviso visible y para TalkBack cuando no hay PC disponible. */
    static void updatePcBanner(Activity activity, TextView banner) {
        if (banner == null) return;
        boolean available = hasPc(activity);
        banner.setText(available ? "" : NO_PC_MESSAGE);
        banner.setVisibility(available ? View.GONE : View.VISIBLE);
        banner.setContentDescription(available ? "" : NO_PC_MESSAGE);
    }

    /** Banner oculto (región viva POLITE) para el aviso de cifrado caído. */
    static TextView plaintextBanner(Activity activity) {
        TextView banner = NotesUi.smallText(activity, "", 11.5f, NotesUi.dangerInk(activity));
        banner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        banner.setPadding(ThemePalette.dp(activity, 18), ThemePalette.dp(activity, 2),
                ThemePalette.dp(activity, 18), ThemePalette.dp(activity, 4));
        banner.setVisibility(View.GONE);
        return banner;
    }

    /**
     * Muestra el aviso una sola vez por pantalla: si el respaldo en texto plano
     * ya se detectó, solo mantiene el banner visible, sin volver a anunciarlo en
     * cada repintado (la marca de "ya avisado" va en el tag de la vista).
     */
    static void warnPlaintextOnce(NotesStore store, TextView banner) {
        if (banner == null || store == null || !store.isPlaintextFallback()) return;
        banner.setVisibility(View.VISIBLE);
        if (banner.getTag() != null) return;
        banner.setTag(PLAINTEXT_WARNING);
        banner.setText(PLAINTEXT_WARNING);
        banner.setContentDescription(PLAINTEXT_WARNING);
    }

    /** Envía el lote de notas visibles pendientes y avisa al terminar. */
    static void sendAll(Activity activity, NotesStore store, List<NotesStore.Note> notes,
                        Runnable onDone) {
        List<NotesStore.Note> pending = pending(notes);
        if (pending.isEmpty()) {
            toast(activity, "No hay notas pendientes de enviar");
            return;
        }
        NotesSync.sendAll(activity, store, pending, report -> onDone.run());
    }

    /** Envía una nota; explica por qué no se puede (solo teléfono o sin PC). */
    static void sendOne(Activity activity, NotesStore store, NotesStore.Note note,
                        Runnable onDone) {
        if (note == null) return;
        if (NotesStore.isLocalOnly(note)) {
            toast(activity, "Solo en el teléfono: esta nota no se envía a la PC");
            return;
        }
        if (!hasPc(activity)) {
            toast(activity, NO_PC_MESSAGE);
            return;
        }
        NotesSync.sendNote(activity, store, note, report -> onDone.run());
    }

    private static void toast(Activity activity, String message) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
    }

    /** Notas enviables: con título, sin enviar y que no son solo del teléfono. */
    static List<NotesStore.Note> pending(List<NotesStore.Note> notes) {
        List<NotesStore.Note> pending = new ArrayList<>();
        if (notes == null) return pending;
        for (NotesStore.Note note : notes) {
            if (note == null || note.synced || NotesStore.isLocalOnly(note)) continue;
            if (note.title.trim().isEmpty()) continue;
            pending.add(note);
        }
        return pending;
    }

    /** Notas marcadas como «Solo en el teléfono». */
    static int localOnlyCount(List<NotesStore.Note> notes) {
        int count = 0;
        if (notes == null) return count;
        for (NotesStore.Note note : notes) {
            if (NotesStore.isLocalOnly(note)) count++;
        }
        return count;
    }

    /** Texto y descripción accesible de «Enviar todas» (solo enviables). */
    static void updateSendAllButton(Button button, List<NotesStore.Note> notes) {
        if (button == null) return;
        // H-03: la tercera ruta de envío también se apunta al candado compartido.
        NotesSendGuard.watch(button);
        int pending = pending(notes).size();
        if (pending == 0) {
            button.setVisibility(android.view.View.GONE);
            return;
        }
        button.setVisibility(android.view.View.VISIBLE);
        String text = pending == 1
                ? "Enviar la nota pendiente a la PC"
                : "Enviar las " + pending + " notas pendientes a la PC";
        button.setText(text);
        int localOnly = localOnlyCount(notes);
        String excluded = localOnly == 0 ? ""
                : (localOnly == 1 ? "; no incluye la nota solo del teléfono"
                : "; no incluye las notas solo del teléfono");
        button.setContentDescription(text + excluded);
    }

    /**
     * Diálogo de confirmación de «Enviar todas»: dice cuántas notas van, cuántas
     * se quedan por ser solo del teléfono y cuántas por estar ya enviadas.
     */
    static void confirmSendAll(Activity activity, List<NotesStore.Note> notes,
                               boolean hasPc, Runnable onSend) {
        List<NotesStore.Note> pending = pending(notes);
        if (pending.isEmpty()) {
            Toast.makeText(activity, "No hay notas pendientes de enviar",
                    Toast.LENGTH_SHORT).show();
            return;
        }
        int localOnly = localOnlyCount(notes);

        StringBuilder message = new StringBuilder();
        message.append(pending.size() == 1
                ? "Se enviará 1 nota pendiente a la PC."
                : "Se enviarán " + pending.size() + " notas pendientes a la PC.");
        if (localOnly > 0) {
            message.append("\nNo se incluye ")
                    .append(localOnly == 1 ? "1 nota" : localOnly + " notas")
                    .append(localOnly == 1 ? " marcada" : " marcadas")
                    .append(" como «Solo en el teléfono».");
        }
        message.append("\nTampoco las que ya se enviaron.");
        if (!hasPc) message.append("\n\n").append(NO_PC_MESSAGE).append('.');

        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle("Enviar todas las notas")
                .setMessage(message.toString());
        if (hasPc) {
            builder.setPositiveButton("Enviar", (dialog, which) -> onSend.run());
            builder.setNegativeButton("Cancelar", null);
        } else {
            builder.setPositiveButton("Entendido", null);
        }
        AlertDialog dialog = builder.create();
        UiKit.styleDialog(activity, dialog);
        dialog.show();
    }
}
