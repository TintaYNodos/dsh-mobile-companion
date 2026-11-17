/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.widget.Toast;

/**
 * Diálogos de «Compartir» y «Borrar» del editor de notas.
 *
 * Compartir usa {@link NotesShare#plan(NotesStore.Draft)}: si la nota es
 * `localOnly`, primero se pide confirmación y solo entonces se comparte el texto
 * completo con {@link NotesShare#text(NotesStore.Draft, boolean)}. Vive aparte de
 * {@link NotesEditor} para mantener ese archivo por debajo del límite de líneas.
 */
final class NotesEditorShare {

    private NotesEditorShare() {
    }

    /** Comparte la nota, pidiendo confirmación si es solo del teléfono. */
    static void share(Activity activity, NotesStore.Draft draft) {
        NotesShare.Plan plan = NotesShare.plan(draft);
        if (!plan.requiresConfirmation) {
            openChooser(activity, plan.subject, plan.text);
            return;
        }
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Nota solo del teléfono")
                .setMessage("Esta nota está marcada como «solo en el teléfono». "
                        + "¿Compartirla de todos modos?")
                .setPositiveButton("Compartir", (d, w) ->
                        openChooser(activity, NotesShare.subject(draft),
                                NotesShare.text(draft, true)))
                .setNegativeButton("Cancelar", null)
                .create();
        UiKit.styleDialog(activity, dialog);
        dialog.show();
    }

    /** Confirma el borrado del teléfono antes de ejecutar `onConfirmed`. */
    static void confirmDelete(Activity activity, Runnable onConfirmed) {
        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Borrar nota")
                .setMessage("¿Borrar esta nota del teléfono? Esta acción no se puede deshacer.")
                .setPositiveButton("Borrar", (d, w) -> onConfirmed.run())
                .setNegativeButton("Cancelar", null)
                .create();
        UiKit.styleDialog(activity, dialog);
        dialog.show();
    }

    private static void openChooser(Activity activity, String subject, String text) {
        if (text == null || text.trim().isEmpty()) {
            Toast.makeText(activity, "La nota está vacía: escribe algo antes de compartirla",
                    Toast.LENGTH_SHORT).show();
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, subject);
        send.putExtra(Intent.EXTRA_TEXT, text);
        // Share-sheet: la píldora no debe quedar visible detrás del selector del
        // sistema; se restaura en onResume de MainActivity al volver.
        PillUi.hideForSystemSheet();
        activity.startActivity(Intent.createChooser(send, "Compartir nota"));
    }
}
