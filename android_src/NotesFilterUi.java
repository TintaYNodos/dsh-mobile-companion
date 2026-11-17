/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Barra de filtros de la lista de notas: chips de perfil y chips de tipo, estado,
 * proyecto, prioridad, «Con fecha» y de orden (recientes o vencimiento).
 *
 * Todos los chips son táctiles (≥48 dp de alto, ≥8 dp de separación), llevan
 * `setSelected(true)` cuando el filtro está activo y un `contentDescription` con
 * el valor («Tipo: Examen, seleccionado»). Los chips de perfil se repintan en
 * sitio (sin reconstruir) y, cuando la barra se reconstruye, el foco normal y el
 * de TalkBack vuelven al chip que el usuario acaba de elegir.
 *
 * Mantiene su propio {@link NotesFilter}; la pantalla solo le pasa el texto de
 * búsqueda y lee los criterios al refrescar. Cada cambio de filtro avisa con
 * {@link Listener#onFilterChanged()} y cada cambio de orden con
 * {@link Listener#onOrderChanged()}: el orden lo aplica el almacén
 * ({@code store.list(filter)}), no la caché de la pantalla.
 */
final class NotesFilterUi {

    interface Listener {
        void onFilterChanged();

        /** Cambió el orden pedido al almacén (recientes / vencimiento). */
        void onOrderChanged();
    }

    private final Activity activity;
    private final Listener listener;
    private final NotesFilter filter = new NotesFilter();
    private final LinearLayout root;
    private final NotesChips.Row profileRow;
    private final HorizontalScrollView toolbarScroll;
    private final LinearLayout toolbar;
    private List<String> projects = new ArrayList<>();
    private String focusKey = "";

    NotesFilterUi(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        this.root = NotesUi.column(activity);
        root.setPadding(ThemePalette.dp(activity, 18), 0, ThemePalette.dp(activity, 18), 0);

        root.addView(NotesUi.fieldLabel(activity, "Perfil"));
        String[] values = new String[NotesCatalog.PROFILES.length + 1];
        String[] labels = new String[values.length];
        values[0] = "";
        labels[0] = "Todos";
        for (int i = 0; i < NotesCatalog.PROFILES.length; i++) {
            values[i + 1] = NotesCatalog.PROFILES[i];
            labels[i + 1] = NotesCatalog.profileLabel(NotesCatalog.PROFILES[i]);
        }
        profileRow = new NotesChips.Row(activity, "Perfil", values, labels, filter.profile,
                this::onProfile);
        root.addView(profileRow.view());

        root.addView(NotesUi.fieldLabel(activity, "Filtros"));
        toolbar = NotesUi.row(activity);
        toolbarScroll = new HorizontalScrollView(activity);
        toolbarScroll.setHorizontalScrollBarEnabled(false);
        toolbarScroll.setFillViewport(false);
        toolbarScroll.addView(toolbar);
        root.addView(toolbarScroll);
        renderToolbar();
    }

    View build() {
        return root;
    }

    /**
     * Con el teclado abierto y la letra grande (200 %) colapsa el chrome de la
     * lista —filas de filtros y subtítulo— para que la lista conserve alto útil;
     * al cerrar el teclado vuelve a mostrarse.
     */
    static void updateChrome(View filterView, View subtitle, boolean keyboardVisible,
                             float fontScale) {
        boolean compact = keyboardVisible && fontScale >= NotesChips.LARGE_FONT_SCALE;
        setVisible(filterView, compact);
        setVisible(subtitle, compact);
    }

    private static void setVisible(View view, boolean compact) {
        if (view == null) return;
        view.setVisibility(compact ? View.GONE : View.VISIBLE);
    }

    NotesFilter filter() {
        return filter;
    }

    void setQuery(String query) {
        filter.query = query == null ? "" : query;
    }

    /** Proyectos disponibles; si el filtro actual ya no existe, se limpia. */
    void setProjects(List<String> available) {
        List<String> next = available == null ? new ArrayList<>() : new ArrayList<>(available);
        boolean changed = !next.equals(projects);
        projects = next;
        if (!filter.project.isEmpty() && !projects.contains(filter.project)) {
            filter.project = "";
            changed = true;
        }
        if (changed) renderToolbar();
    }

    // ------------------------------------------------------------------
    // Chips y diálogos
    // ------------------------------------------------------------------

    private void onProfile(String profile) {
        if (profile.equals(filter.profile)) return;
        filter.profile = profile;
        dropInvalidTypeStatus();
        focusKey = "";
        renderToolbar();
        listener.onFilterChanged();
    }

    private void renderToolbar() {
        // Guarda el chip elegido (o el que tenía el foco) para devolvérselo
        // después de repintar: el árbol nuevo no conserva el foco.
        String restoreKey = focusKey;
        if (restoreKey.isEmpty()) {
            View focused = toolbar.findFocus();
            if (focused != null && focused.getTag() != null) {
                restoreKey = focused.getTag().toString();
            }
        }
        focusKey = "";
        toolbar.removeAllViews();
        addChip("type", "Tipo", typeLabel(), !filter.type.isEmpty(), this::chooseType);
        if (statusValues().length > 0) {
            addChip("status", "Estado", statusLabel(), !filter.status.isEmpty(),
                    this::chooseStatus);
        }
        if (!projects.isEmpty()) {
            addChip("project", "Proyecto", projectLabel(), !filter.project.isEmpty(),
                    this::chooseProject);
        }
        addChip("priority", "Prioridad", priorityLabel(), !filter.priority.isEmpty(),
                this::choosePriority);
        addToggle();
        addOrderChip();
        focusToolbar(restoreKey);
    }

    private void addChip(String key, String group, String value, boolean active, Runnable action) {
        String label = group + ": " + value;
        Button chip = NotesChips.chip(activity, label, active, () -> {
            focusKey = key;
            action.run();
        });
        chip.setContentDescription(NotesChips.description(group, value, active));
        chip.setTag(key);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginEnd(ThemePalette.dp(activity, NotesChips.GAP_DP));
        toolbar.addView(chip, params);
    }

    private void addToggle() {
        Button chip = NotesChips.chip(activity, "Con fecha", filter.withDueDate, () -> {
            focusKey = "due";
            filter.withDueDate = !filter.withDueDate;
            renderToolbar();
            listener.onFilterChanged();
        });
        chip.setContentDescription("Con fecha, "
                + (filter.withDueDate ? "seleccionado" : "no seleccionado"));
        chip.setTag("due");
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginEnd(ThemePalette.dp(activity, NotesChips.GAP_DP));
        toolbar.addView(chip, params);
    }

    /**
     * Control de orden: «Orden: Recientes» se convierte en «Orden: Vencimiento»
     * al tocarlo. Fija {@link NotesFilter#sort}, que el almacén usa para devolver
     * la lista ordenada por vencimiento (primero las notas con fecha más
     * próxima) o por última edición.
     */
    private void addOrderChip() {
        final boolean byDue = NotesFilter.SORT_DUE_DATE.equals(filter.sort);
        final String value = byDue ? "Vencimiento" : "Recientes";
        Button chip = NotesChips.chip(activity, "Orden: " + value, byDue, () -> {
            focusKey = "sort";
            filter.sort = byDue ? NotesFilter.SORT_UPDATED : NotesFilter.SORT_DUE_DATE;
            renderToolbar();
            listener.onOrderChanged();
        });
        chip.setContentDescription("Orden: " + value + (byDue ? ", seleccionado" : "")
                + ". Toca para ordenar por " + (byDue ? "recientes" : "vencimiento"));
        chip.setTag("sort");
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMarginEnd(ThemePalette.dp(activity, NotesChips.GAP_DP));
        toolbar.addView(chip, params);
    }

    /** Devuelve el foco normal y el de TalkBack al chip indicado. */
    private void focusToolbar(String key) {
        if (key == null || key.isEmpty()) return;
        for (int i = 0; i < toolbar.getChildCount(); i++) {
            final View child = toolbar.getChildAt(i);
            if (child.getTag() == null || !child.getTag().equals(key)) continue;
            child.post(() -> {
                if (!child.isAttachedToWindow()) return;
                child.requestFocus();
                child.performAccessibilityAction(
                        android.view.accessibility.AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null);
                child.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED);
            });
            return;
        }
    }

    private String[] typeValues() {
        if (filter.profile.isEmpty()) return NotesCatalog.allTypes();
        return NotesCatalog.typesFor(filter.profile);
    }

    private String[] statusValues() {
        if (filter.profile.isEmpty()) return NotesCatalog.allStatuses();
        return NotesCatalog.statusesFor(filter.profile);
    }

    private String typeLabel() {
        return filter.type.isEmpty() ? "Todos" : NotesCatalog.typeLabel(filter.type);
    }

    private String statusLabel() {
        return filter.status.isEmpty() ? "Todos" : NotesCatalog.statusLabel(filter.status);
    }

    private String projectLabel() {
        return filter.project.isEmpty() ? "Todos" : filter.project;
    }

    private String priorityLabel() {
        return filter.priority.isEmpty() ? "Todos" : NotesCatalog.priorityLabel(filter.priority);
    }

    private void chooseType() {
        String[] values = typeValues();
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = NotesCatalog.typeLabel(values[i]);
        choose("Tipo de nota", labels, values, filter.type, value -> {
            filter.type = value;
            renderToolbar();
            listener.onFilterChanged();
        });
    }

    private void chooseStatus() {
        String[] values = statusValues();
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = NotesCatalog.statusLabel(values[i]);
        choose("Estado", labels, values, filter.status, value -> {
            filter.status = value;
            renderToolbar();
            listener.onFilterChanged();
        });
    }

    private void chooseProject() {
        String[] values = projects.toArray(new String[0]);
        choose("Proyecto u obra", values, values, filter.project, value -> {
            filter.project = value;
            renderToolbar();
            listener.onFilterChanged();
        });
    }

    private void choosePriority() {
        String[] values = NotesCatalog.PRIORITIES.clone();
        String[] labels = new String[values.length];
        for (int i = 0; i < values.length; i++) labels[i] = NotesCatalog.priorityLabel(values[i]);
        choose("Prioridad", labels, values, filter.priority, value -> {
            filter.priority = value;
            renderToolbar();
            listener.onFilterChanged();
        });
    }

    /** Diálogo de selección única con "Todos" como primera opción. */
    private void choose(String title, String[] labels, String[] values, String current,
                        Consumer<String> onPicked) {
        int checked = 0;
        for (int i = 0; i < values.length; i++) {
            if (values[i].equals(current)) {
                checked = i + 1;
                break;
            }
        }
        final CharSequence[] items = new CharSequence[labels.length + 1];
        items[0] = "Todos";
        for (int i = 0; i < labels.length; i++) items[i + 1] = labels[i];

        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle(title)
                .setSingleChoiceItems(items, checked, (d, which) -> {
                    d.dismiss();
                    onPicked.accept(which == 0 ? "" : values[which - 1]);
                })
                .setNegativeButton("Cancelar", null)
                .create();
        UiKit.styleDialog(activity, dialog);
        dialog.show();
    }

    private void dropInvalidTypeStatus() {
        if (!filter.type.isEmpty() && !contains(typeValues(), filter.type)) filter.type = "";
        if (!filter.status.isEmpty() && !contains(statusValues(), filter.status)) filter.status = "";
    }

    private static boolean contains(String[] values, String expected) {
        for (String value : values) {
            if (value.equals(expected)) return true;
        }
        return false;
    }
}
