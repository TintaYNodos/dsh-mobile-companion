/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import android.content.res.Configuration;
import android.view.MotionEvent;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Pildora flotante de conexion, arrastre y visibilidad con el teclado.
 */
class PillUi {
    /** Parametros de la pildora: se coloca por fracciones de pantalla, asi se
     * recuerda donde la dejo el usuario (arriba/abajo y derecha/izquierda). */
    private static FrameLayout.LayoutParams pillParams(MainActivity a) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.START);
        float fractionY = a.prefs.getFloat(KEY_PILL_Y, 0.35f);
        float fractionX = a.prefs.getFloat(KEY_PILL_X, 0.82f);
        params.topMargin = (int) (a.getResources().getDisplayMetrics().heightPixels * fractionY);
        params.setMarginStart((int) (a.getResources().getDisplayMetrics().widthPixels * fractionX));
        return params;
    }

    /** Limites de pantalla para que la pildora no se salga por ningun borde. */
    static float clampX(MainActivity a, float x, int width) {
        int screen = a.getResources().getDisplayMetrics().widthPixels;
        float margin = ThemePalette.dp(a, 6);
        return Math.max(margin, Math.min(x, Math.max(margin, screen - width - margin)));
    }

    static float clampY(MainActivity a, float y, int height) {
        int screen = a.getResources().getDisplayMetrics().heightPixels;
        float top = ThemePalette.dp(a, 44);
        return Math.max(top, Math.min(y, Math.max(top, screen - height - ThemePalette.dp(a, 48))));
    }

    /** Ajustes: permite mostrar la pildora en horizontal (por defecto oculta). */
    static boolean showsInLandscape(MainActivity a) {
        return a.prefs != null && a.prefs.getBoolean(KEY_PILL_LANDSCAPE, false);
    }

    /** Repinta visibilidad y posicion tras cambiar el ajuste de horizontal. */
    static void refreshVisibility(MainActivity a) {
        applyOrientationLayout(a, a.getResources().getConfiguration().orientation);
    }

    static void buildPill(MainActivity a) {
        a.pill = new LinearLayout(a);
        a.pill.setOrientation(LinearLayout.HORIZONTAL);
        a.pill.setGravity(Gravity.CENTER);
        // 48 dp de área táctil: el mínimo recomendado para un objetivo aislado.
        a.pill.setMinimumWidth(ThemePalette.dp(a, 48));
        a.pill.setMinimumHeight(ThemePalette.dp(a, 48));
        a.pill.setClickable(true);
        a.pill.setFocusable(true);
        a.pill.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);

        a.pillDot = new View(a);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(ThemePalette.dp(a, 14), ThemePalette.dp(a, 14));
        dotParams.setMarginEnd(0);
        a.pillDot.setLayoutParams(dotParams);
        a.pillDot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        PillUi.paintDot(a, Color.parseColor("#F59E0B"));

        a.pillLabel = new TextView(a);
        a.pillLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        a.pillLabel.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        a.pillLabel.setSingleLine(true);
        a.pillLabel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

        a.pill.addView(a.pillDot);
        a.pill.addView(a.pillLabel);

        a.pill.setLayoutParams(pillParams(a));
        a.pill.setElevation(ThemePalette.dp(a, 8));

        // El clic accesible (TalkBack, ENTER, D-pad) entra por aquí.
        a.pill.setOnClickListener(v -> HubSheet.openHub(a));

        a.pill.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        a.touchStartX = event.getRawX();
                        a.touchStartY = event.getRawY();
                        a.dragOffsetY = view.getY() - event.getRawY();
                        a.dragOffsetX = view.getX() - event.getRawX();
                        a.dragging = false;
                        a.ui.removeCallbacks(a.collapsePill);
                        return true;

                    case MotionEvent.ACTION_MOVE: {
                        float dx = Math.abs(event.getRawX() - a.touchStartX);
                        float dy = Math.abs(event.getRawY() - a.touchStartY);
                        if (!a.dragging && (dx > ThemePalette.dp(a, 6) || dy > ThemePalette.dp(a, 6))) a.dragging = true;

                        if (a.dragging) {
                            view.setX(clampX(a, event.getRawX() + a.dragOffsetX, view.getWidth()));
                            view.setY(clampY(a, event.getRawY() + a.dragOffsetY, view.getHeight()));
                        }
                        return true;
                    }

                    case MotionEvent.ACTION_UP:
                        if (!a.dragging) {
                            // performClick respeta el contrato de accesibilidad y
                            // dispara el mismo manejador que TalkBack.
                            view.performClick();
                        } else {
                            float fx = view.getX() / Math.max(1, a.getResources().getDisplayMetrics().widthPixels);
                            float fy = view.getY() / Math.max(1, a.getResources().getDisplayMetrics().heightPixels);
                            a.prefs.edit()
                                    .putFloat(KEY_PILL_X, Math.min(0.95f, Math.max(0f, fx)))
                                    .putFloat(KEY_PILL_Y, Math.min(0.95f, Math.max(0.02f, fy)))
                                    .apply();
                        }
                        return true;

                    case MotionEvent.ACTION_CANCEL:
                        PillUi.collapseSoon(a);
                        return true;
                }
                return false;
            }
        });

        a.pill.setOnLongClickListener(v -> {
            if (a.webView != null) a.webView.reload();
            Toast.makeText(a, "Recargando", Toast.LENGTH_SHORT).show();
            return true;
        });

        a.root.addView(a.pill);
        // Siempre con la etiqueta: reducirla a un punto al desplegar el teclado
        // la hacia casi invisible y confundia. Se oculta entera mientras el
        // teclado esta abierto y vuelve completa al cerrarlo.
        PillUi.setPillExpanded(a, true, false);
    }

    static void paintDot(MainActivity a, int fill) {
        if (a.pillDot == null) return;
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(fill);
        a.pillDot.setBackground(drawable);
    }

    /** La pildora es solo el punto de estado: sin texto, siempre redonda. El
     * nombre sigue disponible para TalkBack por contentDescription. */
    static void setPillExpanded(MainActivity a, boolean expanded, boolean animate) {
        if (a.pill == null) return;
        a.pillLabel.setVisibility(View.GONE);
        int pad = ThemePalette.dp(a, 12);
        a.pill.setPadding(pad, pad, pad, pad);
        a.pill.setBackground(ThemePalette.rounded(a,
                ThemePalette.color(a, Color.parseColor("#161B22"), Color.parseColor("#FFFFFF")),
                ThemePalette.outline(a), 999f));
        a.pill.animate().cancel();
        a.pill.animate().alpha(0.94f).setDuration(animate ? 200 : 0).start();
        PillUi.updatePillDescription(a);
    }

    /**
     * Descripcion para lectores de pantalla: la pildora colapsada no muestra
     * texto, asi que sin esto TalkBack solo anunciaria un elemento sin nombre.
     */
    static void updatePillDescription(MainActivity a) {
        if (a.pill == null) return;
        String stateText;
        switch (a.state) {
            case STATE_ONLINE:
                stateText = "conectado";
                break;
            case STATE_RETRYING:
                stateText = "reconectando";
                break;
            default:
                stateText = "sin conexión";
                break;
        }
        a.pill.setContentDescription("Conexión con " + PcRegistryStore.activeLabel(a) + ": " + stateText
                + ". Doble toque para abrir las opciones de conexión.");
    }

    static void expandPill(MainActivity a) {
        PillUi.setPillExpanded(a, true, true);
    }

    static void collapseSoon(MainActivity a) {
        a.ui.removeCallbacks(a.collapsePill);
        a.ui.postDelayed(a.collapsePill, 3200);
    }

    static void refreshPillLabel(MainActivity a) {
        if (a.pillLabel != null) a.pillLabel.setText(PcRegistryStore.activeLabel(a));
    }

    /** Devuelve la pildora a su opacidad de reposo tras hacer scroll. */
    static void resetPillAlpha(MainActivity a) {
        if (a.pill != null) {
            a.pill.animate().cancel();
            a.pill.animate().alpha(0.94f).setDuration(200).start();
        }
    }

    /** true si la píldora se ocultó para un modal del sistema (hoja de compartir). */
    private static boolean hiddenForSystemSheet = false;

    /**
     * Share-sheet (HOJA_ERRORES_CAPTURAS.md:56-59): la píldora quedaba visible
     * detrás del selector de compartir. Se oculta al lanzarlo y se restaura al
     * volver a la actividad, con las mismas condiciones que el teclado o el
     * paisaje. Si no hay píldora (p. ej. desde Notas), no hace nada.
     */
    static void hideForSystemSheet() {
        MainActivity a = MainActivity.getInstance();
        if (a == null || a.pill == null) return;
        a.pill.animate().cancel();
        a.pill.setVisibility(View.GONE);
        hiddenForSystemSheet = true;
    }

    /** Restaura la píldora tras volver del selector del sistema. */
    static void restoreAfterSystemSheet() {
        if (!hiddenForSystemSheet) return;
        hiddenForSystemSheet = false;
        MainActivity a = MainActivity.getInstance();
        if (a == null || a.pill == null) return;
        a.pill.setVisibility((PillUi.isLandscape(a) && !PillUi.showsInLandscape(a)) || a.isImeVisible
                ? View.GONE : View.VISIBLE);
    }


    static boolean isLandscape(MainActivity a) {
        return a.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
    }

    static void onImeVisibilityChanged(MainActivity a, boolean visible) {
        if (a.isImeVisible == visible) return;
        a.isImeVisible = visible;
        if (a.pill == null) return;
        if (visible) {
            a.pill.setVisibility(View.GONE);
        } else if (!PillUi.isLandscape(a) || PillUi.showsInLandscape(a)) {
            a.pill.setVisibility(View.VISIBLE);
            a.pill.setLayoutParams(pillParams(a));
        }
    }

    /** El teclado puede estar abierto sin que el listener haya avisado (p. ej.
     * tras rotar): se comprueba con el area visible real de la ventana. */
    static boolean keyboardProbablyOpen(MainActivity a) {
        try {
            android.graphics.Rect visible = new android.graphics.Rect();
            a.getWindow().getDecorView().getWindowVisibleDisplayFrame(visible);
            // Antes del primer layout el area visible es 0: no es teclado, es
            // que la ventana aun no existe (si no, la pildora nacia oculta).
            if (visible.bottom <= 0 || visible.height() <= 0) return a.isImeVisible;
            int screen = a.getResources().getDisplayMetrics().heightPixels;
            return screen - visible.bottom > screen * 0.15;
        } catch (Exception e) {
            return a.isImeVisible;
        }
    }

    static void applyOrientationLayout(MainActivity a, int orientation) {
        if (a.pill == null) return;
        boolean landscape = orientation == Configuration.ORIENTATION_LANDSCAPE;
        boolean ime = a.isImeVisible || keyboardProbablyOpen(a);
        if (ime || (landscape && !showsInLandscape(a))) {
            a.pill.setVisibility(View.GONE);
            return;
        }
        a.pill.setVisibility(View.VISIBLE);
        a.pill.setLayoutParams(pillParams(a));
        // La posicion se guarda por fraccion del ancho: al pasar de apaisado a
        // vertical esa fraccion puede dejar la pildora FUERA de la pantalla
        // (parecia desaparecer). Se recoloca dentro de los bordes en cuanto se
        // mide y se corrige la fraccion guardada.
        a.pill.post(() -> PillUi.reclampPill(a));
    }

    /** Mete la pildora dentro de la pantalla y guarda la fraccion ya corregida. */
    static void reclampPill(MainActivity a) {
        if (a.pill == null || a.pill.getWidth() <= 0) return;
        int w = a.getResources().getDisplayMetrics().widthPixels;
        int h = a.getResources().getDisplayMetrics().heightPixels;
        float x = clampX(a, a.pill.getX(), a.pill.getWidth());
        float y = clampY(a, a.pill.getY(), a.pill.getHeight());
        a.pill.setX(x);
        a.pill.setY(y);
        a.prefs.edit()
                .putFloat(KEY_PILL_X, Math.min(0.95f, Math.max(0f, x / Math.max(1, w))))
                .putFloat(KEY_PILL_Y, Math.min(0.95f, Math.max(0.02f, y / Math.max(1, h))))
                .apply();
    }

    /** Al volver a la app: restaura tras el selector del sistema, recupera la
     * opacidad (el scroll la dejaba casi invisible si la app se pausaba antes de
     * repintarla), recalcula visibilidad y la mete dentro de los bordes. */
    static void onResumeRestore(MainActivity a) {
        PillUi.restoreAfterSystemSheet();
        if (a.pill == null) return;
        a.pill.setAlpha(0.94f);
        PillUi.refreshVisibility(a);
        a.pill.post(() -> PillUi.reclampPill(a));
    }
}
