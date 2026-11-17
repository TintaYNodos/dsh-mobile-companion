/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Chips táctiles y accesibles de la pantalla de notas.
 *
 * Todo chip mide al menos 48 dp de alto y deja 8 dp de separación con el
 * siguiente (objetivo táctil y separación de WCAG 2.5.5/2.5.8). Cada chip lleva
 * `setSelected(true)` cuando representa el valor activo y un
 * `contentDescription` del tipo «Perfil: Docente, seleccionado».
 *
 * {@link Row} es una fila de selección única que se repinta **en sitio**: al
 * cambiar de valor solo actualiza colores, `selected` y descripciones, sin
 * reconstruir los botones, así que el foco de TalkBack no se pierde. Cuando hay
 * que cambiar los valores (por ejemplo, los tipos al cambiar de perfil) se
 * reconstruye y el foco vuelve al chip elegido.
 */
final class NotesChips {

    /** Alto mínimo del objetivo táctil, en dp. */
    static final float MIN_TOUCH_DP = 48f;
    /** Separación mínima entre chips, en dp. */
    static final float GAP_DP = 8f;
    /** Escala de letra a partir de la cual el chrome de la lista se colapsa. */
    static final float LARGE_FONT_SCALE = 1.5f;

    private NotesChips() {
    }

    /** Botón con forma de chip, ya con área táctil y contraste del tema. */
    static Button chip(Activity activity, String text, boolean selected, Runnable onClick) {
        Button button = new Button(activity);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setMinHeight(dp(activity, MIN_TOUCH_DP));
        button.setMinimumHeight(dp(activity, MIN_TOUCH_DP));
        button.setMinimumWidth(dp(activity, MIN_TOUCH_DP));
        button.setPadding(dp(activity, 14), dp(activity, 8), dp(activity, 14), dp(activity, 8));
        paint(activity, button, selected);
        button.setOnClickListener(view -> onClick.run());
        return button;
    }

    /** Color, fondo y estado de selección de un chip (sin tocar textos). */
    static void paint(Activity activity, Button button, boolean selected) {
        button.setSelected(selected);
        if (selected) {
            // Blanco sobre el acento: 5,19:1 en claro y 4,63:1 en oscuro (AA).
            button.setTextColor(Color.WHITE);
            button.setBackground(ThemePalette.rounded(activity,
                    ThemePalette.accentPrimary(activity), Color.TRANSPARENT, 8f));
        } else {
            button.setTextColor(ThemePalette.ink(activity));
            button.setBackground(ThemePalette.rounded(activity, ThemePalette.raised(activity),
                    ThemePalette.outline(activity), 8f));
        }
    }

    /** Descripción para TalkBack: grupo, valor y si está seleccionado. */
    static String description(String group, String label, boolean selected) {
        return group + ": " + label + (selected ? ", seleccionado" : "");
    }

    /**
     * Fila deslizable de selección única. `values` y `labels` van en paralelo;
     * el valor vacío representa «Todos» en los filtros.
     */
    static final class Row {
        private final Activity activity;
        private final String group;
        private final Consumer<String> onSelect;
        private final LinearLayout content;
        private final HorizontalScrollView scroller;
        private final List<Button> buttons = new ArrayList<>();
        private final List<String> values = new ArrayList<>();
        private final List<String> labels = new ArrayList<>();
        private String selected;

        Row(Activity activity, String group, String[] values, String[] labels,
            String selected, Consumer<String> onSelect) {
            this.activity = activity;
            this.group = group;
            this.onSelect = onSelect;
            this.selected = selected == null ? "" : selected;
            this.content = new LinearLayout(activity);
            this.content.setOrientation(LinearLayout.HORIZONTAL);
            this.content.setGravity(Gravity.CENTER_VERTICAL);
            this.scroller = new HorizontalScrollView(activity);
            this.scroller.setHorizontalScrollBarEnabled(false);
            this.scroller.setFillViewport(false);
            this.scroller.addView(content);
            rebuild(values, labels);
        }

        /** Vista que se añade a la pantalla. */
        View view() {
            return scroller;
        }

        String selectedValue() {
            return selected;
        }

        /** Cambia el valor activo sin reconstruir los botones. */
        void setSelected(String value) {
            String next = value == null ? "" : value;
            if (next.equals(selected)) {
                updateVisuals();
                return;
            }
            selected = next;
            updateVisuals();
        }

        /** Cambia el catálogo de la fila (los tipos al cambiar de perfil). */
        void setValues(String[] newValues, String[] newLabels, String newSelected) {
            selected = newSelected == null ? "" : newSelected;
            rebuild(newValues, newLabels);
        }

        private void rebuild(String[] newValues, String[] newLabels) {
            boolean hadFocus = content.findFocus() != null;
            content.removeAllViews();
            buttons.clear();
            values.clear();
            labels.clear();
            if (newValues != null) {
                for (int i = 0; i < newValues.length; i++) {
                    final String value = newValues[i] == null ? "" : newValues[i];
                    String label = newLabels != null && i < newLabels.length && newLabels[i] != null
                            ? newLabels[i] : value;
                    final Button button = chip(activity, label, value.equals(selected),
                            () -> choose(value));
                    values.add(value);
                    labels.add(label);
                    buttons.add(button);
                    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.WRAP_CONTENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT);
                    params.setMarginEnd(dp(activity, GAP_DP));
                    content.addView(button, params);
                }
            }
            updateVisuals();
            if (hadFocus) {
                focusSelected();
            }
        }

        private void choose(String value) {
            if (value.equals(selected)) return;
            selected = value;
            updateVisuals();
            onSelect.accept(value);
        }

        private void updateVisuals() {
            for (int i = 0; i < buttons.size(); i++) {
                Button button = buttons.get(i);
                String value = values.get(i);
                String label = labels.get(i);
                boolean isSelected = value.equals(selected);
                paint(activity, button, isSelected);
                button.setContentDescription(description(group, label, isSelected));
            }
        }

        private void focusSelected() {
            for (int i = 0; i < buttons.size(); i++) {
                if (!values.get(i).equals(selected)) continue;
                final Button target = buttons.get(i);
                // Tras repintar, devuelve el foco normal y el de TalkBack al chip
                // elegido: un evento TYPE_VIEW_FOCUSED explícito hace que el
                // lector de pantalla lo anuncie aunque el árbol sea nuevo.
                content.post(() -> {
                    target.requestFocus();
                    target.performAccessibilityAction(
                            android.view.accessibility.AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null);
                    target.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED);
                });
                return;
            }
        }
    }

    private static int dp(Activity activity, float value) {
        return ThemePalette.dp(activity, value);
    }
}
