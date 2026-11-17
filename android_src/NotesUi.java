/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Piezas visuales de la pantalla de Notas locales, construidas con los mismos
 * helpers de {@link UiKit} y {@link ThemePalette} que el resto de la app.
 *
 * Contraste: los pares de color de esta pantalla se eligieron midiendo la razón
 * WCAG. La insignia «Alta» usa fondo #B42318 con texto blanco (6,57:1), y el
 * rojo de aviso es #B42318 en claro (6,18:1 sobre tarjeta) y #FF7B72 en oscuro
 * (6,04:1 sobre tarjeta).
 */
final class NotesUi {

    // Colores de la pantalla con la razón WCAG ya comprobada; van como int para
    // que la clase se pueda probar en una JVM normal (sin Android en ejecución).
    private static final int DANGER_LIGHT = 0xFFB42318;
    private static final int DANGER_DARK = 0xFFFF7B72;
    private static final int HIGH_BADGE_BG = 0xFFB42318;

    private static final SimpleDateFormat DATE_FORMAT =
            new SimpleDateFormat("d MMM yyyy, HH:mm", new Locale("es", "ES"));

    private NotesUi() {
    }

    static int dp(Activity activity, float value) {
        return ThemePalette.dp(activity, value);
    }

    /** Rojo de aviso con contraste AA sobre las superficies de la pantalla. */
    static int dangerInk(Activity activity) {
        return ThemePalette.isDark(activity) ? DANGER_DARK : DANGER_LIGHT;
    }

    /** Elemento seleccionable con área táctil de 48 dp como mínimo. */
    static Button touchTarget(Activity activity, Button button) {
        button.setMinHeight(dp(activity, NotesChips.MIN_TOUCH_DP));
        button.setMinimumHeight(dp(activity, NotesChips.MIN_TOUCH_DP));
        return button;
    }

    /** Acción de la pantalla con área táctil cómoda (48 dp de alto). */
    static Button actionButton(Activity activity, String label, boolean primary, Runnable onClick) {
        return touchTarget(activity, UiKit.actionCompact(activity, label, primary, onClick));
    }

    // ------------------------------------------------------------------
    // Tarjeta de la lista
    // ------------------------------------------------------------------

    /**
     * Tarjeta de una nota: insignias, título a dos líneas, proyecto/personaje,
     * etiquetas, vista previa, vencimiento, marca de privacidad y «Enviar».
     *
     * La tarjeta es un solo nodo para TalkBack: su `contentDescription` resume
     * la nota y la acción («Abrir nota: …»), y todos los textos internos quedan
     * con `IMPORTANT_FOR_ACCESSIBILITY_NO` para que el lector de pantalla no los
     * lea una segunda vez. El botón «Enviar» es un nodo aparte y, si la nota es
     * solo del teléfono, queda deshabilitado y lo explica.
     */
    static LinearLayout noteCard(Activity activity, NotesStore.Note note,
                                 Runnable onOpen, Runnable onSend) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(activity, 14), dp(activity, 12), dp(activity, 14), dp(activity, 10));
        card.setBackground(ThemePalette.rounded(activity, ThemePalette.raised(activity),
                ThemePalette.outline(activity), 8f));
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardParams.bottomMargin = dp(activity, 8);
        card.setLayoutParams(cardParams);
        card.setTag(note.id);
        card.setContentDescription(cardDescription(note));
        card.setFocusable(true);
        card.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        card.setOnClickListener(view -> onOpen.run());

        card.addView(decorative(badgesRow(activity, note)));

        TextView title = new TextView(activity);
        title.setText(note.title.trim().isEmpty() ? "Nota sin título" : note.title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(ThemePalette.ink(activity));
        title.setMaxLines(2);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setPadding(0, dp(activity, 6), 0, 0);
        card.addView(decorative(title));

        String where = projectSubject(note);
        if (!where.isEmpty()) {
            TextView meta = smallText(activity, where, 11.5f, ThemePalette.inkDim(activity));
            meta.setSingleLine(true);
            meta.setEllipsize(TextUtils.TruncateAt.END);
            card.addView(decorative(meta));
        }

        String tags = tagsLine(note.tags);
        if (!tags.isEmpty()) {
            TextView tagLine = smallText(activity, tags, 11f, ThemePalette.accentInk(activity));
            tagLine.setMaxLines(2);
            tagLine.setEllipsize(TextUtils.TruncateAt.END);
            card.addView(decorative(tagLine));
        }

        String preview = previewText(note.body);
        if (!preview.isEmpty()) {
            TextView body = smallText(activity, preview, 12f, ThemePalette.inkDim(activity));
            body.setMaxLines(2);
            body.setEllipsize(TextUtils.TruncateAt.END);
            card.addView(decorative(body));
        }

        if (note.hasDueDate()) {
            String due = NotesDates.cardLabel(note.dueDate);
            int dueColor = NotesDates.isSoon(note.dueDate)
                    ? dangerInk(activity) : ThemePalette.inkDim(activity);
            TextView dueLine = smallText(activity, due, 11.5f, dueColor);
            dueLine.setTypeface(Typeface.DEFAULT_BOLD);
            dueLine.setPadding(0, dp(activity, 3), 0, 0);
            card.addView(decorative(dueLine));
        }

        if (note.localOnly) {
            TextView local = smallText(activity, NotesStore.LOCAL_ONLY_LABEL, 11.5f,
                    ThemePalette.accentInk(activity));
            local.setTypeface(Typeface.DEFAULT_BOLD);
            local.setPadding(0, dp(activity, 3), 0, 0);
            card.addView(decorative(local));
        }

        LinearLayout footer = row(activity);
        footer.setPadding(0, dp(activity, 6), 0, 0);
        TextView meta = smallText(activity, footerText(note), 10.5f, note.synced
                ? ThemePalette.accentInk(activity)
                : ThemePalette.inkDim(activity));
        meta.setMaxLines(2);
        meta.setEllipsize(TextUtils.TruncateAt.END);
        meta.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        footer.addView(decorative(meta));

        Button send = actionButton(activity, "Enviar", false, onSend);
        String titleText = note.title.trim().isEmpty() ? "nota sin título" : note.title.trim();
        if (note.localOnly) {
            send.setEnabled(false);
            send.setAlpha(0.5f);
            send.setContentDescription("Enviar a la PC: no disponible, la nota " + titleText
                    + " es solo del teléfono");
        } else {
            send.setContentDescription("Enviar a la PC: " + titleText);
        }
        send.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        footer.addView(send);
        card.addView(footer);
        return card;
    }

    /** Texto que la tarjeta ya resume: no debe ser un nodo aparte de TalkBack. */
    private static View decorative(View view) {
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        return view;
    }

    private static View badgesRow(Activity activity, NotesStore.Note note) {
        LinearLayout badges = row(activity);
        badges.addView(typeBadge(activity, note.type));
        int gap = (int) NotesChips.GAP_DP;
        if (!note.status.isEmpty()) {
            badges.addView(spaced(activity, statusBadge(activity,
                    NotesCatalog.statusLabel(note.status)), gap));
        }
        if (NotesCatalog.PRIORITY_HIGH.equals(note.priority)) {
            badges.addView(spaced(activity, priorityBadge(activity, note.priority), gap));
        }
        // A 200 % de escala el texto no cabe: se desliza en horizontal en vez de
        // recortarse.
        HorizontalScrollView scroller = new HorizontalScrollView(activity);
        scroller.setHorizontalScrollBarEnabled(false);
        scroller.setFillViewport(false);
        scroller.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        scroller.addView(badges);
        return scroller;
    }

    /** Descripción de TalkBack de la tarjeta completa. */
    static String cardDescription(NotesStore.Note note) {
        String title = note.title.trim().isEmpty() ? "Nota sin título" : note.title.trim();
        StringBuilder out = new StringBuilder("Abrir nota: ").append(title);
        out.append(", ").append(NotesCatalog.typeLabel(note.type));
        if (!note.status.isEmpty()) {
            out.append(", ").append(NotesCatalog.statusLabel(note.status));
        }
        out.append(", prioridad ").append(NotesCatalog.priorityLabel(note.priority));
        String where = projectSubject(note);
        if (!where.isEmpty()) out.append(", ").append(where);
        String tags = tagsLine(note.tags);
        if (!tags.isEmpty()) out.append(", etiquetas ").append(tags);
        if (note.hasDueDate()) {
            out.append(", vence ").append(NotesDates.shortDisplay(note.dueDate));
        } else {
            out.append(", sin fecha límite");
        }
        if (note.localOnly) {
            out.append(", solo en el teléfono");
        } else if (note.synced) {
            out.append(", enviada a la PC");
        } else {
            out.append(", pendiente de enviar");
        }
        String updated = formatDate(note.updatedAt);
        if (!updated.isEmpty()) out.append(", actualizada el ").append(updated);
        return out.toString();
    }

    /** "Obra · Personaje" con lo que exista; vacío si no hay ninguno. */
    static String projectSubject(NotesStore.Note note) {
        String project = note.project.trim();
        String subject = note.subject.trim();
        if (project.isEmpty()) return subject;
        if (subject.isEmpty()) return project;
        return project + " · " + subject;
    }

    static String tagsLine(List<String> tags) {
        if (tags == null || tags.isEmpty()) return "";
        StringBuilder out = new StringBuilder();
        for (String tag : tags) {
            if (tag == null || tag.trim().isEmpty()) continue;
            if (out.length() > 0) out.append("  ");
            out.append('#').append(tag.trim());
        }
        return out.toString();
    }

    static String footerText(NotesStore.Note note) {
        StringBuilder out = new StringBuilder(formatDate(note.updatedAt));
        out.append("  ·  ").append(NotesCatalog.priorityLabel(note.priority));
        if (note.localOnly) {
            out.append("  ·  ").append(NotesStore.LOCAL_ONLY_LABEL);
        } else if (note.synced) {
            out.append("  ·  Enviada");
        } else {
            out.append("  ·  Pendiente de enviar");
        }
        return out.toString();
    }

    // ------------------------------------------------------------------
    // Insignias
    // ------------------------------------------------------------------

    static TextView typeBadge(Activity activity, String type) {
        return badge(activity, NotesCatalog.typeLabel(type),
                Color.WHITE, ThemePalette.accentPrimary(activity));
    }

    static TextView statusBadge(Activity activity, String label) {
        return badge(activity, label, ThemePalette.ink(activity), ThemePalette.surface(activity));
    }

    /** Insignia de prioridad; «Alta» usa rojo oscuro con texto blanco (AA 6,57:1). */
    static TextView priorityBadge(Activity activity, String priority) {
        if (NotesCatalog.PRIORITY_HIGH.equals(priority)) {
            return badge(activity, NotesCatalog.priorityLabel(priority), Color.WHITE, HIGH_BADGE_BG);
        }
        return badge(activity, NotesCatalog.priorityLabel(priority), ThemePalette.ink(activity),
                ThemePalette.surface(activity));
    }

    private static TextView badge(Activity activity, String text, int textColor, int background) {
        TextView badge = new TextView(activity);
        badge.setText(text);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setTextColor(textColor);
        badge.setBackground(ThemePalette.rounded(activity, background,
                ThemePalette.outline(activity), 6f));
        badge.setPadding(dp(activity, 7), dp(activity, 2), dp(activity, 7), dp(activity, 2));
        return badge;
    }

    // ------------------------------------------------------------------
    // Contenedores y textos
    // ------------------------------------------------------------------

    /** Etiqueta visible encima de un campo (no solo el placeholder). */
    static TextView fieldLabel(Activity activity, String text) {
        TextView label = smallText(activity, text, 11.5f, ThemePalette.ink(activity));
        label.setTypeface(Typeface.DEFAULT_BOLD);
        label.setPadding(0, dp(activity, 8), 0, dp(activity, 4));
        return label;
    }

    static TextView smallText(Activity activity, String text, float sizeSp, int color) {
        TextView view = new TextView(activity);
        view.setText(text);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTextColor(color);
        return view;
    }

    static LinearLayout row(Activity activity) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        return row;
    }

    static LinearLayout column(Activity activity) {
        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    static View spaced(Activity activity, View view, int startMarginDp) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginStart(dp(activity, startMarginDp));
        view.setLayoutParams(params);
        return view;
    }

    static String formatDate(long millis) {
        if (millis <= 0L) return "";
        return DATE_FORMAT.format(new Date(millis));
    }

    /** Vista previa de una línea: el cuerpo sin saltos de línea. */
    static String previewText(String body) {
        return body == null ? "" : body.trim().replace('\n', ' ');
    }

    /** TextWatcher con los dos primeros callbacks vacíos. */
    abstract static class Watcher implements TextWatcher {
        @Override
        public void beforeTextChanged(CharSequence s, int start, int count, int after) {
        }

        @Override
        public void onTextChanged(CharSequence s, int start, int before, int count) {
        }
    }

    /** Evita imports sin uso en los llamadores y centraliza el Editable. */
    static String text(Editable editable) {
        return editable == null ? "" : editable.toString();
    }
}
