/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.util.function.Consumer;
/**
 * Editor de una nota: perfil, tipo, texto, proyecto/módulo, etiquetas, estado,
 * prioridad, vencimiento y privacidad, con autoguardado.
 *
 * Se construye sobre la raíz de {@link NotesActivity} y le devuelve el control
 * con {@link Listener#onDone(String)} al volver o borrar. Cada cambio se guarda
 * 500 ms después de la última tecla (y también al pausar la pantalla).
 *
 * Accesibilidad: el estado del autoguardado vive en un TextView con
 * `ACCESSIBILITY_LIVE_REGION_POLITE` y solo se anuncia cuando cambia (nunca por
 * tecla); es la ÚNICA vía de anuncio (no se llama además a
 * `announceForAccessibility` con el mismo texto). «Enviar a la PC» se
 * deshabilita, con explicación, en las notas que solo viven en el teléfono; al
 * abrir el teclado el cuerpo se desplaza a la vista para que el cursor quede
 * visible. «Copiar para el chat» reutiliza el envío cuando la nota no está
 * enviada y deja en el portapapeles una referencia al archivo de la nota en la
 * PC.
 */
final class NotesEditor implements NotesEditorView.Actions {

    private static final long AUTO_SAVE_MS = 500L;

    interface Listener {
        /** Se llama cuando el editor terminó; `noteId` puede ser null si se descartó. */
        void onDone(String noteId);
    }

    private final Activity activity;
    private final LinearLayout root;
    private final NotesStore store;
    private final Listener listener;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable autoSave = this::saveNow;

    private NotesEditorView.Parts parts;
    private NotesStore.Draft draft;
    private String noteId;
    private boolean loading = true;
    private boolean closed;
    private String saveStateText = "";

    NotesEditor(Activity activity, LinearLayout root, NotesStore store, String noteId,
                Listener listener) {
        this.activity = activity;
        this.root = root;
        this.store = store;
        this.noteId = noteId;
        this.listener = listener;
    }

    void open() {
        NotesStore.Note note = noteId == null ? null : store.get(noteId);
        if (note == null) noteId = null;
        draft = note == null ? new NotesStore.Draft() : NotesStore.Draft.from(note);
        closed = false;
        loading = true;
        ui.removeCallbacks(autoSave);
        parts = NotesEditorView.build(activity, root, draft, noteId, this);
        wireFields();
        saveStateText = "Autoguardado";
        parts.saveState.setText("Autoguardado");
        parts.saveState.setTextColor(ThemePalette.inkDim(activity));
        updateStatusVisibility();
        updateDueRow();
        updateLocalOnlyState(false);
        loading = false;
    }

    private void wireFields() {
        watch(parts.titleField, value -> draft.title = value);
        watch(parts.projectField, value -> draft.project = value);
        watch(parts.subjectField, value -> draft.subject = value);
        watch(parts.tagsField, value -> draft.tags = NotesTags.parseTags(value));
        watch(parts.bodyField, value -> draft.body = value);
        parts.bodyField.setOnFocusChangeListener((view, hasFocus) -> {
            if (hasFocus) ensureBodyVisible();
        });
    }

    /** Guarda ya y vuelve a la lista. */
    void close() {
        if (closed) return;
        ui.removeCallbacks(autoSave);
        saveNow();
        finish(noteId);
    }

    /** Guardado diferido al pausar la pantalla. */
    void save() {
        ui.removeCallbacks(autoSave);
        saveNow();
    }

    void cancelPendingSave() {
        ui.removeCallbacks(autoSave);
    }

    // ------------------------------------------------------------------
    // Acciones de la vista
    // ------------------------------------------------------------------

    @Override
    public void onClose() {
        close();
    }

    @Override
    public void onSend() {
        send();
    }

    @Override
    public void onCopyForChat() {
        ui.removeCallbacks(autoSave);
        saveNow();
        NotesChatCopy.copy(activity, store, draft, noteId);
    }

    @Override
    public void onShare() {
        share();
    }

    @Override
    public void onDelete() {
        confirmDelete();
    }

    @Override
    public void onProfile(String profile) {
        applyProfile(profile);
    }

    @Override
    public void onType(String type) {
        if (type.equals(draft.type)) return;
        draft.type = type;
        scheduleAutoSave();
    }

    @Override
    public void onStatus(String status) {
        if (status.equals(draft.status)) return;
        draft.status = status;
        scheduleAutoSave();
    }

    @Override
    public void onPriority(String priority) {
        if (priority.equals(draft.priority)) return;
        draft.priority = priority;
        scheduleAutoSave();
    }

    @Override
    public void onLocalOnly(boolean value) {
        if (draft.localOnly == value) return;
        draft.localOnly = value;
        updateLocalOnlyState(true);
        scheduleAutoSave();
    }

    @Override
    public void onPickDueDate() {
        NotesDates.pick(activity, draft.dueDate, picked -> {
            draft.dueDate = picked;
            updateDueRow();
            scheduleAutoSave();
        });
    }

    @Override
    public void onClearDueDate() {
        if (draft.dueDate.isEmpty()) return;
        draft.dueDate = "";
        updateDueRow();
        scheduleAutoSave();
    }

    // ------------------------------------------------------------------
    // Perfil, vencimiento y privacidad
    // ------------------------------------------------------------------

    private void applyProfile(String profile) {
        if (profile.equals(draft.profile)) return;
        draft.profile = profile;
        draft.type = NotesCatalog.defaultType(profile);
        draft.status = NotesCatalog.defaultStatus(profile);

        String projectLabel = NotesCatalog.projectLabel(profile);
        String subjectLabel = NotesCatalog.subjectLabel(profile);
        parts.projectLabelView.setText(projectLabel);
        parts.subjectLabelView.setText(subjectLabel);
        parts.projectField.setHint(projectLabel);
        parts.subjectField.setHint(subjectLabel);

        parts.typeRow.setValues(NotesChoices.typeValues(profile),
                NotesChoices.typeLabels(NotesChoices.typeValues(profile)), draft.type);
        parts.statusRow.setValues(NotesChoices.statusValues(profile),
                NotesChoices.statusLabels(NotesChoices.statusValues(profile)), draft.status);
        updateStatusVisibility();
        scheduleAutoSave();
    }

    private void updateStatusVisibility() {
        boolean hasStatuses = NotesCatalog.statusesFor(draft.profile).length > 0;
        parts.statusBlock.setVisibility(hasStatuses ? View.VISIBLE : View.GONE);
    }

    private void updateDueRow() {
        String iso = NotesText.dateOr(draft.dueDate);
        draft.dueDate = iso;
        if (iso.isEmpty()) {
            parts.dueButton.setText("Sin fecha");
            parts.dueButton.setContentDescription(
                    "Fecha límite: sin fecha. Abre el selector de fecha");
            parts.clearDueButton.setVisibility(View.GONE);
        } else {
            parts.dueButton.setText(NotesDates.display(iso));
            parts.dueButton.setContentDescription("Fecha límite: "
                    + NotesDates.longDisplay(iso) + ". Abre el selector de fecha");
            parts.clearDueButton.setVisibility(View.VISIBLE);
        }
    }

    private void updateLocalOnlyState(boolean announce) {
        boolean localOnly = draft.localOnly;
        parts.sendButton.setEnabled(!localOnly);
        parts.sendButton.setAlpha(localOnly ? 0.5f : 1f);
        parts.sendButton.setContentDescription(localOnly
                ? "Enviar a la PC, deshabilitado: esta nota es solo del teléfono"
                : "Enviar a la PC");
        parts.shareButton.setContentDescription(localOnly
                ? "Compartir nota; pedirá confirmación porque es solo del teléfono"
                : "Compartir nota");
        parts.localOnlyHint.setVisibility(localOnly ? View.VISIBLE : View.GONE);
        if (announce) {
            parts.sendButton.announceForAccessibility(localOnly
                    ? "Enviar a la PC deshabilitado. La nota solo se queda en el teléfono."
                    : "Enviar a la PC habilitado. La nota puede enviarse a la PC.");
        }
    }

    /** Desplaza el cuerpo a la vista (teclado abierto o foco en el campo). */
    void ensureBodyVisible() {
        if (parts == null || closed) return;
        NotesEditorScroll.revealBody(activity, parts.scroll, parts.bodyField);
    }

    // ------------------------------------------------------------------
    // Autoguardado
    // ------------------------------------------------------------------

    private void watch(EditText field, Consumer<String> onChange) {
        field.addTextChangedListener(new NotesUi.Watcher() {
            @Override
            public void afterTextChanged(Editable editable) {
                onChange.accept(NotesUi.text(editable));
                scheduleAutoSave();
            }
        });
    }

    private void scheduleAutoSave() {
        if (loading) return;
        setSaveState("Guardando…", ThemePalette.inkDim(activity));
        ui.removeCallbacks(autoSave);
        ui.postDelayed(autoSave, AUTO_SAVE_MS);
    }

    /**
     * Cambia el estado visible y lo anuncia solo cuando el texto cambia. El
     * anuncio lo hace la región viva POLITE del propio TextView: aquí no se
     * llama a `announceForAccessibility` para no anunciarlo dos veces.
     */
    private void setSaveState(String text, int color) {
        if (text.equals(saveStateText)) return;
        saveStateText = text;
        if (parts == null || parts.saveState == null) return;
        parts.saveState.setText(text);
        parts.saveState.setTextColor(color);
    }

    /** Crea la nota la primera vez y la actualiza después. */
    private void saveNow() {
        if (loading || draft == null) return;
        if (noteId == null && !draft.hasContent()) return;
        if (draft.title.trim().isEmpty()) {
            // El título es obligatorio: no se guarda ni se pisa la nota guardada.
            setSaveState("Falta el título", NotesUi.dangerInk(activity));
            return;
        }

        NotesStore.Note saved = noteId == null ? store.add(draft) : store.update(noteId, draft);
        if (saved == null) {
            setSaveState("No se pudo guardar", NotesUi.dangerInk(activity));
            return;
        }
        noteId = saved.id;
        if (parts.deleteButton != null && "Descartar".equals(parts.deleteButton.getText().toString())) {
            parts.deleteButton.setText("Borrar");
            parts.deleteButton.setContentDescription("Borrar la nota");
        }
        setSaveState("Guardado", ThemePalette.accentInk(activity));
    }

    // ------------------------------------------------------------------
    // Enviar, compartir y borrar
    // ------------------------------------------------------------------

    private void send() {
        if (draft.localOnly) {
            toast("Nota solo en el teléfono: no se envía a la PC");
            return;
        }
        ui.removeCallbacks(autoSave);
        saveNow();
        if (noteId == null) {
            toast("La nota está vacía: escribe algo antes de enviarla");
            return;
        }
        NotesStore.Note note = store.get(noteId);
        if (note == null) return;
        NotesSync.sendNote(activity, store, note, report -> {
            // El candado H-03 ya se soltó: se reafirma el estado real del botón
            // por si el usuario cambió «solo en el teléfono» durante el envío.
            updateLocalOnlyState(false);
            if (report.outcome == NotesSync.Outcome.BUSY) {
                setSaveState("Envío en curso", ThemePalette.inkDim(activity));
            } else if (report.allSent()) {
                setSaveState("Enviada a la PC", ThemePalette.accentInk(activity));
            } else if (report.sent == 0) {
                setSaveState("Se queda en el teléfono", NotesUi.dangerInk(activity));
            }
        });
    }

    private void share() {
        ui.removeCallbacks(autoSave);
        saveNow();
        if (draft.title.trim().isEmpty() && !draft.hasContent()) {
            toast("La nota está vacía: escribe algo antes de compartirla");
            return;
        }
        NotesEditorShare.share(activity, draft);
    }

    private void confirmDelete() {
        if (noteId == null) {
            discard();
            return;
        }
        NotesEditorShare.confirmDelete(activity, () -> {
            ui.removeCallbacks(autoSave);
            String target = noteId;
            noteId = null;
            if (!store.remove(target)) {
                noteId = target;
                toast("No se pudo borrar la nota");
                return;
            }
            finish(null);
        });
    }

    private void discard() {
        ui.removeCallbacks(autoSave);
        noteId = null;
        finish(null);
    }

    private void finish(String finishedNoteId) {
        if (closed) return;
        closed = true;
        listener.onDone(finishedNoteId);
    }

    private void toast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
    }
}
