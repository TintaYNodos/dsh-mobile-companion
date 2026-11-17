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
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(ThemePalette.dp(a, 10), ThemePalette.dp(a, 10));
        dotParams.setMarginEnd(ThemePalette.dp(a, 7));
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

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.END);
        float storedFraction = a.prefs.getFloat(KEY_PILL_Y, 0.35f);
        params.topMargin = (int) (a.getResources().getDisplayMetrics().heightPixels * storedFraction);
        params.setMarginEnd(ThemePalette.dp(a, 10));
        a.pill.setLayoutParams(params);
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
                        a.dragging = false;
                        a.ui.removeCallbacks(a.collapsePill);
                        PillUi.expandPill(a);
                        return true;

                    case MotionEvent.ACTION_MOVE: {
                        float dx = Math.abs(event.getRawX() - a.touchStartX);
                        float dy = Math.abs(event.getRawY() - a.touchStartY);
                        if (!a.dragging && (dx > ThemePalette.dp(a, 6) || dy > ThemePalette.dp(a, 6))) a.dragging = true;

                        if (a.dragging) {
                            int limit = a.getResources().getDisplayMetrics().heightPixels
                                    - view.getHeight() - ThemePalette.dp(a, 48);
                            float next = event.getRawY() + a.dragOffsetY;
                            view.setY(Math.max(ThemePalette.dp(a, 44), Math.min(next, limit)));
                        }
                        return true;
                    }

                    case MotionEvent.ACTION_UP:
                        if (!a.dragging) {
                            // performClick respeta el contrato de accesibilidad y
                            // dispara el mismo manejador que TalkBack.
                            view.performClick();
                        } else {
                            float fraction = view.getY() / Math.max(1, a.getResources().getDisplayMetrics().heightPixels);
                            a.prefs.edit().putFloat(KEY_PILL_Y, Math.min(0.95f, Math.max(0.02f, fraction))).apply();
                            PillUi.collapseSoon(a);
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
        PillUi.setPillExpanded(a, !a.prefs.getBoolean(KEY_PILL_EXPANDED_ONCE, false), false);
        PillUi.collapseSoon(a);
    }

    static void paintDot(MainActivity a, int fill) {
        if (a.pillDot == null) return;
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(fill);
        a.pillDot.setBackground(drawable);
    }

    static void setPillExpanded(MainActivity a, boolean expanded, boolean animate) {
        if (a.pill == null) return;

        a.pillLabel.setVisibility(expanded ? View.VISIBLE : View.GONE);
        a.pill.setPadding(expanded ? ThemePalette.dp(a, 12) : ThemePalette.dp(a, 14), ThemePalette.dp(a, 8), expanded ? ThemePalette.dp(a, 14) : ThemePalette.dp(a, 14), ThemePalette.dp(a, 8));
        a.pill.setBackground(ThemePalette.rounded(a, ThemePalette.color(a, Color.parseColor("#161B22"), Color.parseColor("#FFFFFF")),
                expanded ? ThemePalette.accentPrimary(a) : ThemePalette.outline(a),
                expanded ? 14f : 999f));
        a.pill.animate().cancel();
        a.pill.animate().alpha(expanded ? 1f : 0.94f).setDuration(animate ? 200 : 0).start();
        a.pillLabel.setTextColor(ThemePalette.ink(a));
        PillUi.updatePillDescription(a);

        if (expanded) {
            a.prefs.edit().putBoolean(KEY_PILL_EXPANDED_ONCE, true).apply();
        }
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
        a.pill.setVisibility(PillUi.isLandscape(a) || a.isImeVisible
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
        } else {
            if (!PillUi.isLandscape(a)) {
                a.pill.setVisibility(View.VISIBLE);
            }
        }
    }

    static void applyOrientationLayout(MainActivity a, int orientation) {
        if (a.pill != null) {
            if (orientation == Configuration.ORIENTATION_LANDSCAPE || a.isImeVisible) {
                a.pill.setVisibility(View.GONE);
            } else {
                a.pill.setVisibility(View.VISIBLE);
                ViewGroup.LayoutParams lp = a.pill.getLayoutParams();
                if (lp instanceof FrameLayout.LayoutParams) {
                    FrameLayout.LayoutParams flp = (FrameLayout.LayoutParams) lp;
                    float storedFraction = a.prefs != null ? a.prefs.getFloat(KEY_PILL_Y, 0.35f) : 0.35f;
                    flp.topMargin = (int) (a.getResources().getDisplayMetrics().heightPixels * storedFraction);
                    a.pill.setLayoutParams(flp);
                }
            }
        }
    }
}
