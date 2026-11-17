/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.text.Editable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Barra de búsqueda de la lista de notas: etiqueta visible «Buscar», campo de
 * texto y botón «Limpiar».
 *
 * La etiqueta usa `labelFor` para que el lector de pantalla anuncie el campo
 * como «Buscar» (no solo un marcador de posición). El texto de ayuda cambia con
 * el perfil activo ({@link #setHint(String)}) y se pinta con
 * {@link ThemePalette#inkDim(Activity)}, que mantiene contraste AA sobre la
 * superficie de la tarjeta; el campo y el botón tienen área táctil de 48 dp.
 *
 * El campo avisa al llamador con {@link Listener#onQueryChanged()} en cada
 * cambio (la pantalla aplica su retardo de 250 ms) y el botón de limpiar, que
 * solo se muestra cuando hay texto, pide un refresco inmediato. Además, esta
 * clase presta a la pantalla la región viva que anuncia «N resultados».
 *
 * Vive fuera de {@link NotesActivity} para que esa pantalla quede por debajo del
 * límite de líneas del proyecto.
 */
final class NotesSearchBar {

    interface Listener {
        /** El texto de búsqueda cambió (aplicar el retardo de la pantalla). */
        void onQueryChanged();

        /** Se pulsó «Limpiar»: refrescar ya, sin esperar al retardo. */
        void onClear();
    }

    /**
     * Texto de ayuda del buscador con el campo propio del perfil activo
     * (`NotesCatalog.subjectLabel`), nunca «personaje» fijo.
     */
    static String hintFor(String profile) {
        return "Buscar por título, cuerpo, etiquetas o "
                + NotesCatalog.subjectLabel(profile).toLowerCase(java.util.Locale.ROOT);
    }

    /** Región viva POLITE donde se anuncia «N resultados» al cambiar la lista. */
    static TextView resultStatus(Activity activity) {
        TextView status = NotesUi.smallText(activity, "", 11.5f, ThemePalette.inkDim(activity));
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setPadding(ThemePalette.dp(activity, 18), ThemePalette.dp(activity, 2),
                ThemePalette.dp(activity, 18), ThemePalette.dp(activity, 2));
        status.setVisibility(View.GONE);
        return status;
    }

    /** Actualiza la región viva; el anuncio ocurre solo cuando cambia el texto. */
    static void updateResultCount(TextView status, int count) {
        if (status == null) return;
        status.setVisibility(View.VISIBLE);
        String text = count == 0 ? "Sin resultados"
                : (count == 1 ? "1 resultado" : count + " resultados");
        if (text.contentEquals(status.getText())) return;
        status.setText(text);
    }

    private final Activity activity;
    private final Listener listener;
    private final LinearLayout column;
    private final EditText field;
    private final Button clearButton;
    private boolean silent;

    NotesSearchBar(Activity activity, String hint, Listener listener) {
        this.activity = activity;
        this.listener = listener;

        column = NotesUi.column(activity);
        TextView label = NotesUi.fieldLabel(activity, "Buscar");
        label.setPadding(dp(18), dp(8), dp(18), 0);
        column.addView(label);

        LinearLayout row = NotesUi.row(activity);
        row.setPadding(dp(18), dp(4), dp(18), dp(4));
        column.addView(row);

        field = touch(UiKit.field(activity, hint, ""));
        field.setId(View.generateViewId());
        label.setLabelFor(field.getId());
        field.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        field.addTextChangedListener(new NotesUi.Watcher() {
            @Override
            public void afterTextChanged(Editable editable) {
                updateClearButton();
                if (!silent) NotesSearchBar.this.listener.onQueryChanged();
            }
        });
        row.addView(field);

        clearButton = NotesUi.actionButton(activity, "Limpiar", false, this::clear);
        clearButton.setContentDescription("Limpiar búsqueda");
        clearButton.setVisibility(View.GONE);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginStart(dp(NotesChips.GAP_DP));
        row.addView(clearButton, params);
    }

    View view() {
        return column;
    }

    /** Texto actual del campo ("" si nunca se escribió). */
    String query() {
        return field.getText() == null ? "" : field.getText().toString();
    }

    void focus() {
        field.requestFocus();
    }

    /** Cambia el texto de ayuda (el llamador lo adapta al perfil activo). */
    void setHint(String hint) {
        field.setHint(hint == null ? "" : hint);
    }

    /** Restaura el texto sin disparar la búsqueda (al volver del editor). */
    void setQuery(String query) {
        silent = true;
        field.setText(query == null ? "" : query);
        silent = false;
        updateClearButton();
    }

    private void clear() {
        field.setText("");
        listener.onClear();
        field.requestFocus();
    }

    private void updateClearButton() {
        boolean hasText = field.getText() != null && field.getText().length() > 0;
        clearButton.setVisibility(hasText ? View.VISIBLE : View.GONE);
    }

    /** Marcador con contraste AA y área táctil de 48 dp. */
    private EditText touch(EditText input) {
        input.setHintTextColor(ThemePalette.inkDim(activity));
        int min = dp(NotesChips.MIN_TOUCH_DP);
        input.setMinHeight(min);
        input.setMinimumHeight(min);
        return input;
    }

    private int dp(float value) {
        return ThemePalette.dp(activity, value);
    }
}
