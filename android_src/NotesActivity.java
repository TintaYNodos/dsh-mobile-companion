/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * Notas locales del teléfono. Pantalla nativa (sin AndroidX) que usa los mismos
 * helpers de estilo que el resto de la app.
 *
 * Funciona con la PC apagada y sin red: las notas viven en un archivo JSON
 * (notes.json) dentro del directorio privado de la app. Esta pantalla es la
 * lista (búsqueda, chips de perfil y filtros) y orquesta al {@link NotesEditor};
 * el envío a la computadora vive en {@link NotesSync}.
 *
 * Accesibilidad y teclado:
 * - `FLAG_SECURE`: ni capturas ni miniatura en Recientes.
 * - Si el AndroidKeyStore no está disponible y se guarda sin cifrar, se muestra
 *   una sola vez un banner de aviso con región viva POLITE.
 * - La búsqueda espera 250 ms y pide la lista ya filtrada y ordenada al almacén
 *   (`store.list(filter)`); nunca lee `notes.json` por tecla.
 * - Una región viva POLITE anuncia «N resultados» al cambiar la lista.
 * - Con el teclado abierto y la letra grande se ocultan los filtros (vuelven al
 *   cerrar); en Android 8–10 el teclado se detecta por el redimensionado de la
 *   raíz (`OnGlobalLayoutListener`, ver {@link NotesEditorScroll}).
 * - Al volver del editor se conservan posición y foco de TalkBack.
 * - «Enviar todas» pide confirmación y dice cuántas notas se quedan fuera.
 */
public class NotesActivity extends Activity {

    private static final long SEARCH_DEBOUNCE_MS = 250L;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable searchTask = this::reloadNotes;

    private NotesStore store;
    private LinearLayout root;
    private NotesFilterUi filterUi;
    private View filterView;
    private TextView subtitle;

    private NotesSearchBar searchBar;
    private LinearLayout listColumn;
    private ScrollView listScroll;
    private Button sendAllButton;
    private TextView pcBanner;
    private TextView plaintextBanner;
    private TextView resultStatus;
    private boolean keyboardVisible;

    private NotesEditor editor;

    /** Caché de la lista: ya viene filtrada y ordenada por el almacén. */
    private final List<NotesStore.Note> notesCache = new ArrayList<>();
    private int savedScrollY = -1;
    private String pendingFocusId;
    private String pendingQuery = "";
    private boolean restorePending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTheme(ThemePalette.isDark(this) ? R.style.Theme_Companion : R.style.Theme_Companion_Light);

        // Las notas son personales: sin capturas de pantalla ni miniatura en la
        // vista de Recientes mientras la pantalla está abierta.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);

        store = new NotesStore(getFilesDir());
        plaintextBanner = NotesSender.plaintextBanner(this);
        filterUi = new NotesFilterUi(this, new NotesFilterUi.Listener() {
            @Override
            public void onFilterChanged() {
                updateSearchHint();
                reloadNotes();
            }

            @Override
            public void onOrderChanged() {
                reloadNotes();
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+: contenido a pantalla completa; insets en `applyInsets`.
            getWindow().setDecorFitsSystemWindows(false);
        }

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(ThemePalette.surface(this));
        setContentView(root);
        root.setOnApplyWindowInsetsListener(this::applyInsets);
        NotesEditorScroll.watchKeyboard(this, root, this::setKeyboardVisible);
        ThemePalette.applySystemBarsTheme(this);

        showList();
    }

    /** Barras y teclado como relleno de la raíz (no solo `adjustResize`). */
    private WindowInsets applyInsets(View view, WindowInsets insets) {
        int top;
        int bottom;
        boolean imeVisible = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
            android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
            top = bars.top;
            bottom = Math.max(bars.bottom, ime.bottom);
            imeVisible = insets.isVisible(WindowInsets.Type.ime());
            setKeyboardVisible(imeVisible);
        } else {
            top = insets.getSystemWindowInsetTop();
            // En pre-R adjustResize ya encoge la ventana: sumar el inset IME como
            // padding contaria el teclado dos veces (el inset llega consumido).
            bottom = 0;
            // Android 8–10: adjustResize avisa por el alto de la raíz (watchKeyboard).
            if (bottom > dp(80)) setKeyboardVisible(true);
        }
        if (view.getPaddingTop() != top || view.getPaddingBottom() != bottom) {
            view.setPadding(0, top, 0, bottom);
        }
        if (imeVisible && editor != null) editor.ensureBodyVisible();
        return insets;
    }

    /** Cambio de teclado: recoloca el cuerpo y ajusta el espacio de la lista. */
    private void setKeyboardVisible(boolean visible) {
        if (visible == keyboardVisible) return;
        keyboardVisible = visible;
        updateListChrome();
        if (editor != null) editor.ensureBodyVisible();
    }

    /** Con teclado abierto y letra grande se colapsa el chrome; al cerrar vuelve. */
    private void updateListChrome() {
        NotesFilterUi.updateChrome(filterView, subtitle, keyboardVisible,
                getResources().getConfiguration().fontScale);
    }

    // ------------------------------------------------------------------
    // Lista
    // ------------------------------------------------------------------

    private void showList() {
        editor = null;
        root.removeAllViews();

        LinearLayout header = NotesUi.row(this);
        header.setPadding(dp(18), dp(12), dp(18), dp(2));

        TextView heading = NotesUi.smallText(this, "Notas", 20f, ThemePalette.ink(this));
        heading.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        heading.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(heading);

        Button newNote = NotesUi.actionButton(this, "+ Nueva", true, this::openNewNote);
        newNote.setContentDescription("Nueva nota");
        header.addView(newNote);
        root.addView(header);

        subtitle = NotesUi.smallText(this,
                "Se guardan en el teléfono: funcionan sin la PC y sin conexión.",
                11.5f, ThemePalette.inkDim(this));
        subtitle.setPadding(dp(18), 0, dp(18), dp(4));
        root.addView(subtitle);

        pcBanner = NotesUi.smallText(this, "", 11.5f, ThemePalette.accentInk(this));
        pcBanner.setPadding(dp(18), dp(2), dp(18), dp(4));
        pcBanner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(pcBanner);
        updatePcBanner();
        root.addView(plaintextBanner);

        searchBar = new NotesSearchBar(this, NotesSearchBar.hintFor(filterUi.filter().profile),
                new NotesSearchBar.Listener() {
            @Override
            public void onQueryChanged() {
                onSearchEdited();
            }

            @Override
            public void onClear() {
                ui.removeCallbacks(searchTask);
                reloadNotes();
            }
        });
        root.addView(searchBar.view());
        searchBar.setQuery(pendingQuery);

        filterView = filterUi.build();
        root.addView(filterView);

        resultStatus = NotesSearchBar.resultStatus(this);
        root.addView(resultStatus);

        listColumn = new LinearLayout(this);
        listColumn.setOrientation(LinearLayout.VERTICAL);
        listColumn.setPadding(dp(18), dp(6), dp(18), dp(8));

        listScroll = new ScrollView(this);
        listScroll.setFillViewport(false);
        listScroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        listScroll.addView(listColumn);
        root.addView(listScroll);

        sendAllButton = NotesUi.actionButton(this, "Enviar todas a la PC", false,
                () -> NotesSender.confirmSendAll(this, notesCache, NotesSender.hasPc(this),
                        this::sendAll));
        LinearLayout.LayoutParams footer = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        footer.setMargins(dp(18), dp(4), dp(18), dp(10));
        sendAllButton.setLayoutParams(footer);
        root.addView(sendAllButton);

        updateListChrome();
        reloadNotes();
    }

    private void onSearchEdited() {
        ui.removeCallbacks(searchTask);
        ui.postDelayed(searchTask, SEARCH_DEBOUNCE_MS);
    }

    /**
     * Relee las notas con la búsqueda, los filtros y el orden actuales. Usa
     * {@code store.list(filter)} —no {@code visibleNotes()}— para que el orden
     * por vencimiento (`SORT_DUE_DATE`) lo aplique el almacén y para respetar
     * búsqueda y filtros.
     */
    private void reloadNotes() {
        if (filterUi == null || store == null) return;
        filterUi.setQuery(searchBar == null ? "" : searchBar.query());
        filterUi.setProjects(store.projects());
        NotesFilter filter = filterUi.filter();
        notesCache.clear();
        for (NotesStore.Note note : store.list(filter)) {
            // El título es obligatorio; las entradas antiguas sin él no se ven.
            if (!note.title.trim().isEmpty()) notesCache.add(note);
        }
        refreshList();
    }

    /** Repinta la lista desde la caché; nunca toca el archivo. */
    private void refreshList() {
        if (listColumn == null || isFinishing() || isDestroyed()) return;
        listColumn.removeAllViews();
        NotesFilter filter = filterUi.filter();

        if (notesCache.isEmpty()) {
            TextView empty = NotesUi.smallText(this, filter.isEmpty()
                    ? "Todavía no hay notas. Pulsa «+ Nueva» para crear la primera."
                    : "Ninguna nota coincide con la búsqueda o los filtros.",
                    12.5f, ThemePalette.inkDim(this));
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(12), dp(24), dp(12), dp(24));
            listColumn.addView(empty);
        } else {
            for (NotesStore.Note note : notesCache) {
                listColumn.addView(NotesUi.noteCard(this, note,
                        () -> openEditor(note.id),
                        () -> sendNote(note)));
            }
        }
        updateResultCount();
        NotesSender.warnPlaintextOnce(store, plaintextBanner);
        NotesSender.updateSendAllButton(sendAllButton, notesCache);
        if (restorePending) restoreListState();
    }

    /** Región viva: anuncia «N resultados» solo cuando cambia el número. */
    private void updateResultCount() {
        NotesSearchBar.updateResultCount(resultStatus, notesCache.size());
    }

    /** Texto de ayuda del buscador según el perfil activo (no «personaje» fijo). */
    private void updateSearchHint() {
        if (searchBar != null) searchBar.setHint(NotesSearchBar.hintFor(filterUi.filter().profile));
    }

    private void restoreListState() {
        final int scrollY = savedScrollY;
        final String focusId = pendingFocusId;
        savedScrollY = -1;
        pendingFocusId = null;
        restorePending = false;
        NotesEditorScroll.restoreScrollAndFocus(listScroll, listColumn, scrollY, focusId,
                () -> {
                    if (searchBar != null) searchBar.focus();
                });
    }

    private void updatePcBanner() {
        NotesSender.updatePcBanner(this, pcBanner);
    }

    // ------------------------------------------------------------------
    // Envío
    // ------------------------------------------------------------------

    private void sendAll() {
        NotesSender.sendAll(this, store, notesCache, () -> {
            rememberListState(null);
            reloadNotes();
        });
    }

    private void sendNote(NotesStore.Note note) {
        final String focusId = note == null ? null : note.id;
        NotesSender.sendOne(this, store, note, () -> {
            rememberListState(focusId);
            reloadNotes();
        });
    }

    private void rememberListState(String focusId) {
        if (listScroll != null) savedScrollY = listScroll.getScrollY();
        pendingFocusId = focusId;
        restorePending = true;
    }

    // ------------------------------------------------------------------
    // Editor
    // ------------------------------------------------------------------

    private void openNewNote() {
        openEditor(null);
    }

    private void openEditor(String noteId) {
        rememberListState(null);
        pendingQuery = searchBar == null ? "" : searchBar.query();
        root.removeAllViews();
        editor = new NotesEditor(this, root, store, noteId, id -> onEditorDone(id));
        editor.open();
    }

    private void onEditorDone(String noteId) {
        editor = null;
        pendingFocusId = noteId;
        restorePending = true;
        showList();
    }

    // ------------------------------------------------------------------

    private int dp(float value) {
        return ThemePalette.dp(this, value);
    }

    @Override
    public void onResume() {
        super.onResume();
        updatePcBanner();
    }

    @Override
    public void onPause() {
        if (editor != null) editor.save();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (editor != null) {
            editor.close();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (editor != null) editor.cancelPendingSave();
        ui.removeCallbacks(searchTask);
        super.onDestroy();
    }
}
