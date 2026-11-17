/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.graphics.Typeface;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

/**
 * Construcción visual del editor de notas: cabecera fija de una sola fila,
 * contenido desplazable (perfil, tipo, campos con etiqueta visible, estado,
 * prioridad, cuerpo, fecha límite y privacidad) y barra de acciones fija.
 *
 * La cabecera mide una fila («←» con descripción «Volver», título a una línea
 * con elipsis y estado de guardado en línea) y las acciones («Enviar»,
 * «Compartir», «Borrar») caben en una fila horizontal deslizable, de una sola
 * línea y 48 dp de alto: con el teclado abierto y la letra al 200 % no se parten
 * palabras y el cuerpo conserva al menos cuatro líneas. El cuerpo es un campo
 * multilínea que crece con el texto; {@link NotesEditor} lo desplaza a la vista
 * cuando aparece el teclado.
 *
 * Se separa de {@link NotesEditor} para que ese archivo quede por debajo del
 * límite de líneas del proyecto. La vista no guarda estado: solo crea los
 * widgets, enlaza los botones con {@link Actions} y los devuelve en
 * {@link Parts} para que el editor ponga los valores y los observadores.
 */
final class NotesEditorView {

    /** Acciones del editor, implementadas por {@link NotesEditor}. */
    interface Actions {
        void onClose();

        void onSend();

        void onShare();

        void onDelete();

        void onProfile(String profile);

        void onType(String type);

        void onStatus(String status);

        void onPriority(String priority);

        void onLocalOnly(boolean value);

        void onPickDueDate();

        void onClearDueDate();
    }

    /** Widgets que el editor necesita para leer, escribir y repintar. */
    static final class Parts {
        NotesChips.Row profileRow;
        NotesChips.Row typeRow;
        NotesChips.Row statusRow;
        NotesChips.Row priorityRow;
        LinearLayout statusBlock;
        TextView projectLabelView;
        TextView subjectLabelView;
        EditText titleField;
        EditText projectField;
        EditText subjectField;
        EditText tagsField;
        EditText bodyField;
        TextView saveState;
        TextView localOnlyHint;
        Button dueButton;
        Button clearDueButton;
        Button sendButton;
        Button shareButton;
        Button deleteButton;
        ScrollView scroll;
    }

    private NotesEditorView() {
    }

    static Parts build(Activity activity, LinearLayout root, NotesStore.Draft draft,
                       String noteId, Actions actions) {
        Parts parts = new Parts();
        root.removeAllViews();
        root.addView(header(activity, noteId, parts, actions));

        parts.scroll = new ScrollView(activity);
        parts.scroll.setFillViewport(true);
        parts.scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(parts.scroll);

        LinearLayout fields = NotesUi.column(activity);
        fields.setPadding(dp(activity, 18), 0, dp(activity, 18), dp(activity, 10));
        parts.scroll.addView(fields);

        // Perfil y tipo: filas de chips que se repintan en sitio.
        parts.profileRow = NotesChoices.profile(activity, draft.profile, actions::onProfile);
        fields.addView(NotesUi.fieldLabel(activity, "Perfil"));
        fields.addView(parts.profileRow.view());

        parts.typeRow = NotesChoices.type(activity, draft.profile, draft.type, actions::onType);
        fields.addView(NotesUi.fieldLabel(activity, "Tipo"));
        fields.addView(parts.typeRow.view());

        // Título.
        parts.titleField = touch(activity, UiKit.field(activity, "Título de la nota…", draft.title));
        parts.titleField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
        parts.titleField.setTypeface(Typeface.DEFAULT_BOLD);
        addLabelledField(activity, fields, "Título", parts.titleField);

        // Proyecto y personaje/módulo/fuente, cada uno con su etiqueta visible
        // (el texto cambia con el perfil y vive en Parts).
        parts.projectField = touch(activity,
                UiKit.field(activity, NotesCatalog.projectLabel(draft.profile), draft.project));
        parts.projectLabelView = addLabelledField(activity, fields,
                NotesCatalog.projectLabel(draft.profile), parts.projectField);

        parts.subjectField = touch(activity,
                UiKit.field(activity, NotesCatalog.subjectLabel(draft.profile), draft.subject));
        parts.subjectLabelView = addLabelledField(activity, fields,
                NotesCatalog.subjectLabel(draft.profile), parts.subjectField);

        parts.tagsField = touch(activity,
                UiKit.field(activity, "Etiquetas separadas por comas", draft.tagsText()));
        addLabelledField(activity, fields, "Etiquetas", parts.tagsField);

        // Estado (solo si el perfil los tiene).
        parts.statusBlock = NotesUi.column(activity);
        parts.statusRow = NotesChoices.status(activity, draft.profile, draft.status,
                actions::onStatus);
        parts.statusBlock.addView(NotesUi.fieldLabel(activity, "Estado"));
        parts.statusBlock.addView(parts.statusRow.view());
        fields.addView(parts.statusBlock);

        parts.priorityRow = NotesChoices.priority(activity, draft.priority, actions::onPriority);
        fields.addView(NotesUi.fieldLabel(activity, "Prioridad"));
        fields.addView(parts.priorityRow.view());

        // Cuerpo: multilínea, al menos cuatro líneas, crece con el texto.
        parts.bodyField = body(activity, draft.body);
        TextView bodyLabel = NotesUi.fieldLabel(activity, "Cuerpo");
        bodyLabel.setLabelFor(parts.bodyField.getId());
        fields.addView(bodyLabel);
        fields.addView(parts.bodyField);

        // Fecha límite.
        fields.addView(NotesUi.fieldLabel(activity, "Fecha límite"));
        fields.addView(dueRow(activity, parts, actions));

        // Privacidad: nota que no sale del teléfono, con interruptor de 48 dp.
        LinearLayout localCard = UiKit.settingSwitchCard(activity,
                "Solo en el teléfono (no se envía a la PC)",
                "Se queda en el teléfono. «Enviar a la PC» se deshabilita y, al compartir, "
                        + "se pedirá confirmación.",
                draft.localOnly,
                (button, checked) -> actions.onLocalOnly(checked));
        switchTouchTarget(activity, localCard);
        fields.addView(localCard);
        parts.localOnlyHint = NotesUi.smallText(activity,
                "«Enviar a la PC» está deshabilitado: esta nota solo se queda en el teléfono.",
                11.5f, NotesUi.dangerInk(activity));
        parts.localOnlyHint.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        parts.localOnlyHint.setPadding(0, dp(activity, 2), 0, dp(activity, 4));
        fields.addView(parts.localOnlyHint);

        root.addView(actionsRow(activity, noteId, parts, actions));
        return parts;
    }

    /**
     * Cabecera compacta de una fila: «←» (descripción «Volver»), título a una
     * línea con elipsis y el estado de guardado en línea. Ocupa ~48 dp y deja
     * sitio al cuerpo cuando el teclado está abierto.
     */
    private static View header(Activity activity, String noteId, Parts parts, Actions actions) {
        LinearLayout header = NotesUi.row(activity);
        header.setPadding(dp(activity, 14), dp(activity, 4), dp(activity, 12), dp(activity, 4));

        Button back = NotesUi.actionButton(activity, "←", false, actions::onClose);
        back.setContentDescription("Volver");
        back.setSingleLine(true);
        back.setMinWidth(dp(activity, NotesChips.MIN_TOUCH_DP));
        back.setMinimumWidth(dp(activity, NotesChips.MIN_TOUCH_DP));
        header.addView(back);

        TextView heading = NotesUi.smallText(activity, noteId == null ? "Nueva nota" : "Editar nota",
                15f, ThemePalette.ink(activity));
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        heading.setSingleLine(true);
        heading.setEllipsize(TextUtils.TruncateAt.END);
        heading.setPadding(dp(activity, 10), 0, dp(activity, 6), 0);
        heading.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(heading);

        parts.saveState = NotesUi.smallText(activity, "", 10.5f,
                ThemePalette.inkDim(activity));
        parts.saveState.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        parts.saveState.setSingleLine(true);
        parts.saveState.setEllipsize(TextUtils.TruncateAt.END);
        header.addView(parts.saveState);
        return header;
    }

    private static View dueRow(Activity activity, Parts parts, Actions actions) {
        LinearLayout row = NotesUi.row(activity);
        parts.dueButton = NotesUi.actionButton(activity, "Sin fecha", false, actions::onPickDueDate);
        parts.dueButton.setContentDescription("Fecha límite: sin fecha. Abre el selector de fecha");
        parts.dueButton.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(parts.dueButton);

        parts.clearDueButton = NotesUi.actionButton(activity, "Quitar fecha", false,
                actions::onClearDueDate);
        parts.clearDueButton.setContentDescription("Quitar la fecha límite");
        LinearLayout.LayoutParams clearParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clearParams.setMarginStart(dp(activity, NotesChips.GAP_DP));
        parts.clearDueButton.setLayoutParams(clearParams);
        row.addView(parts.clearDueButton);
        return row;
    }

    /**
     * Barra de acciones de una sola fila: tres botones de etiqueta corta dentro
     * de un contenedor horizontal deslizable. Al medirse con ancho libre, cada
     * botón conserva su texto entero (no se parten palabras ni al 200 %) y el
     * conjunto sigue alcanzable con el teclado abierto porque está fuera del
     * ScrollView, anclado abajo.
     */
    private static View actionsRow(Activity activity, String noteId, Parts parts, Actions actions) {
        HorizontalScrollView scroller = new HorizontalScrollView(activity);
        scroller.setHorizontalScrollBarEnabled(false);
        scroller.setFillViewport(false);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(activity, 18), dp(activity, 4), dp(activity, 12), dp(activity, 8));
        scroller.setLayoutParams(params);

        LinearLayout row = NotesUi.row(activity);
        parts.sendButton = action(activity, "Enviar", true, "Enviar a la PC", actions::onSend);
        NotesSendGuard.watch(parts.sendButton);
        row.addView(parts.sendButton);
        parts.shareButton = action(activity, "Compartir", false, "Compartir nota",
                actions::onShare);
        row.addView(parts.shareButton);
        String deleteLabel = noteId == null ? "Descartar" : "Borrar";
        parts.deleteButton = action(activity, deleteLabel, false,
                noteId == null ? "Descartar la nota nueva" : "Borrar la nota", actions::onDelete);
        row.addView(parts.deleteButton);
        scroller.addView(row);
        return scroller;
    }

    /** Botón de acción de una línea, 48 dp de alto y 8 dp de separación. */
    private static Button action(Activity activity, String label, boolean primary,
                                 String description, Runnable onClick) {
        Button button = NotesUi.actionButton(activity, label, primary, onClick);
        button.setContentDescription(description);
        button.setSingleLine(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginEnd(dp(activity, NotesChips.GAP_DP));
        button.setLayoutParams(params);
        return button;
    }

    private static EditText body(Activity activity, String value) {
        EditText body = new EditText(activity);
        body.setId(View.generateViewId());
        body.setHint("Escribe aquí…");
        body.setGravity(Gravity.TOP | Gravity.START);
        body.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        body.setTextColor(ThemePalette.ink(activity));
        body.setHintTextColor(ThemePalette.inkDim(activity));
        body.setBackground(ThemePalette.rounded(activity, ThemePalette.raised(activity),
                ThemePalette.outline(activity), 8f));
        body.setPadding(dp(activity, 12), dp(activity, 11), dp(activity, 12), dp(activity, 11));
        body.setMinLines(4);
        body.setMinHeight(dp(activity, NotesChips.MIN_TOUCH_DP));
        body.setMinimumHeight(dp(activity, NotesChips.MIN_TOUCH_DP));
        body.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        body.setText(value);
        body.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return body;
    }

    /** Añade etiqueta + campo; devuelve la etiqueta (para textos cambiantes). */
    private static TextView addLabelledField(Activity activity, LinearLayout fields,
                                             String label, EditText field) {
        if (field.getId() == View.NO_ID) field.setId(View.generateViewId());
        TextView labelView = NotesUi.fieldLabel(activity, label);
        labelView.setLabelFor(field.getId());
        fields.addView(labelView);
        fields.addView(field);
        return labelView;
    }

    /** Campo de texto con marcador AA y área táctil de 48 dp. */
    private static EditText touch(Activity activity, EditText input) {
        input.setHintTextColor(ThemePalette.inkDim(activity));
        input.setMinHeight(dp(activity, NotesChips.MIN_TOUCH_DP));
        input.setMinimumHeight(dp(activity, NotesChips.MIN_TOUCH_DP));
        return input;
    }

    /** El interruptor de privacidad también mide 48 dp de alto. */
    private static void switchTouchTarget(Activity activity, ViewGroup card) {
        int min = dp(activity, NotesChips.MIN_TOUCH_DP);
        for (int i = 0; i < card.getChildCount(); i++) {
            View child = card.getChildAt(i);
            if (!(child instanceof Switch)) continue;
            TextView toggle = (TextView) child;
            toggle.setMinimumHeight(min);
            toggle.setMinHeight(min);
        }
        card.setMinimumHeight(min);
    }

    private static int dp(Activity activity, float value) {
        return ThemePalette.dp(activity, value);
    }
}
