/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Reglas del cierre por arrastre de la hoja del Hub, aisladas de Android para
 * poder probarlas en una JVM (no se puede arrastrar sin dispositivo).
 *
 * El gesto se inicia en el tirador o en la cabecera, no en el cuerpo, para no
 * robarle el scroll. La hoja se cierra si se suelta pasados 120 dp o el 25 %
 * del alto de pantalla (el menor de los dos); si se suelta antes, vuelve a su
 * sitio. Mover menos de 6 dp no cuenta como arrastre.
 */
final class HubDragPolicy {

    static final int DRAG_SLOP_DP = 6;
    static final int DISMISS_DP = 120;
    static final float DISMISS_FRACTION = 0.25f;
    /** Tope del desvanecido mientras se arrastra. */
    static final float MAX_FADE = 0.4f;
    static final String ACTION_NONE = "none";
    static final String ACTION_RESTORE = "restore";
    static final String ACTION_DISMISS = "dismiss";

    private HubDragPolicy() {}

    /** Umbral de cierre: 120 dp o el 25 % del alto, el menor en pixeles. */
    static int dismissAfterPx(int dismissDpPx, int screenHeightPx) {
        return Math.min(dismissDpPx, Math.round(Math.max(0, screenHeightPx) * DISMISS_FRACTION));
    }

    /** Mover mas de 6 dp ya cuenta como arrastre (evita temblores del dedo). */
    static boolean isDrag(float movedPx, int slopPx) {
        return movedPx > slopPx;
    }

    /** Opacidad mientras la hoja baja: se desvanece como mucho un 40 %. */
    static float dragAlpha(float movedPx, int screenHeightPx) {
        float denominator = Math.max(1f, Math.max(0, screenHeightPx) * 2f);
        return 1f - Math.min(MAX_FADE, movedPx / denominator);
    }

    /** {@link #ACTION_DISMISS}, {@link #ACTION_RESTORE} o {@link #ACTION_NONE}. */
    static String dropAction(float travelledPx, int dismissAfterPx) {
        if (travelledPx <= 0f) return ACTION_NONE;
        return travelledPx >= dismissAfterPx ? ACTION_DISMISS : ACTION_RESTORE;
    }
}
