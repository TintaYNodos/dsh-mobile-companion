/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.text.Layout;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import java.util.function.Consumer;

/**
 * Desplazamiento del cuerpo del editor, detección del teclado y restauración del
 * desplazamiento de la lista de notas.
 *
 * Con el teclado abierto y la letra grande el cuerpo debe quedar a la vista con
 * al menos cuatro líneas: {@link #revealBody} coloca el campo del cuerpo al
 * inicio del área visible y, si el cursor queda por debajo, desplaza lo justo
 * para que también se vea, sin salirse del final del cuerpo.
 *
 * En Android 11+ los insets (`WindowInsets.Type.ime()`) ya avisan del teclado.
 * En Android 8–10, con `adjustResize`, la ventana se redimensiona sin inset de
 * teclado: {@link #watchKeyboard} escucha los cambios de alto de la raíz con un
 * `OnGlobalLayoutListener` y avisa para volver a llamar a `ensureBodyVisible()`.
 *
 * {@link #restoreScrollAndFocus} devuelve la lista a su posición y el foco de
 * TalkBack a la nota editada cuando se vuelve del editor.
 *
 * Vive fuera de {@link NotesEditor} para que ese archivo quede por debajo del
 * límite de líneas del proyecto.
 */
final class NotesEditorScroll {

    /** Cambio de alto (dp) que delata la apertura o el cierre del teclado. */
    private static final float IME_RESIZE_DP = 100f;

    private NotesEditorScroll() {
    }

    /** Programa el desplazamiento al cuerpo en el siguiente ciclo de dibujo. */
    static void revealBody(Activity activity, ScrollView scroll, EditText body) {
        if (activity == null || scroll == null || body == null) return;
        scroll.post(() -> scrollToBody(activity, scroll, body));
    }

    /**
     * Avisa cuando el teclado abre o cierra porque la raíz cambió de alto. Es la
     * vía que funciona en API 26–29 con `adjustResize`; en versiones nuevas el
     * aviso llega además por los insets y la pantalla ignora el duplicado.
     */
    static void watchKeyboard(Activity activity, View root, Consumer<Boolean> onChanged) {
        if (activity == null || root == null || onChanged == null) return;
        final int threshold = ThemePalette.dp(activity, IME_RESIZE_DP);
        final int[] tallest = {0};
        final boolean[] visible = {false};
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            int height = root.getHeight();
            if (height <= 0) return;
            if (height > tallest[0]) tallest[0] = height;
            boolean next = height < tallest[0] - threshold;
            if (next == visible[0]) return;
            visible[0] = next;
            onChanged.accept(next);
        });
    }

    /**
     * Lleva el cuerpo al inicio del área visible y, si el cursor no cabe, lo
     * desplaza lo justo sin perder al menos una vista del principio del cuerpo.
     * Así se ven varias líneas del cuerpo y nunca solo la cabecera del campo.
     */
    private static void scrollToBody(Activity activity, ScrollView scroll, EditText body) {
        Layout layout = body.getLayout();
        int line = 0;
        if (layout != null) {
            int cursor = body.getSelectionEnd();
            if (cursor < 0) cursor = 0;
            try {
                line = layout.getLineForOffset(cursor);
            } catch (RuntimeException ignored) {
                line = 0;
            }
        }
        int lineHeight = body.getLineHeight();
        if (lineHeight <= 0) lineHeight = ThemePalette.dp(activity, 22);
        int pad = ThemePalette.dp(activity, 11);

        int bodyTop = body.getTop();
        View parent = (View) body.getParent();
        while (parent != null && parent != scroll) {
            bodyTop += parent.getTop();
            parent = parent.getParent() instanceof View ? (View) parent.getParent() : null;
        }

        int bodyBottom = bodyTop + body.getHeight();
        int viewport = scroll.getHeight();
        int cursorBottom = bodyTop + pad + line * lineHeight + lineHeight;
        // Arranca con el cuerpo arriba (máximo de líneas visibles) y solo baja lo
        // necesario para que la línea del cursor también quede a la vista.
        int desired = Math.max(0, bodyTop);
        if (viewport > 0 && cursorBottom > desired + viewport) {
            desired = cursorBottom - viewport;
        }
        if (viewport > 0 && body.getHeight() >= viewport) {
            desired = Math.min(desired, Math.max(0, bodyBottom - viewport));
        }
        // Salto inmediato (no animado): con el teclado abriéndose, la medición
        // posterior debe ver ya las cuatro líneas del cuerpo, sin depender de
        // que termine una animación.
        scroll.scrollTo(0, Math.max(0, desired));
    }

    /**
     * Restaura la posición de la lista y el foco de TalkBack en la nota editada;
     * si esa nota ya no está, lleva el foco al buscador ({@code onMissing}).
     */
    static void restoreScrollAndFocus(final ScrollView scroll, final LinearLayout column,
                                      final int scrollY, final String focusId,
                                      final Runnable onMissing) {
        if (scroll == null) return;
        scroll.post(() -> {
            if (scrollY > 0) scroll.scrollTo(0, scrollY);
            if (focusId == null) return;
            if (!focusCard(column, focusId) && onMissing != null) onMissing.run();
        });
    }

    private static boolean focusCard(LinearLayout column, String noteId) {
        if (column == null || noteId == null) return false;
        for (int i = 0; i < column.getChildCount(); i++) {
            View child = column.getChildAt(i);
            if (child == null || !noteId.equals(child.getTag())) continue;
            child.requestFocus();
            child.performAccessibilityAction(
                    android.view.accessibility.AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS,
                    null);
            child.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent
                    .TYPE_VIEW_FOCUSED);
            return true;
        }
        return false;
    }
}
