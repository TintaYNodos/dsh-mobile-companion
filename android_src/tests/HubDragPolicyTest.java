/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Prueba Java pura de {@link HubDragPolicy}: el cierre de la hoja del Hub por
 * arrastre no se puede ejercitar sin un dispositivo, pero su decision
 * (dismiss / restore / none), el umbral y el desvanecido son aritmetica y se
 * fijan aqui para que una regresion no vuelva a colarse.
 */
final class HubDragPolicyTest {

    private static int checks = 0;
    private static int failures = 0;

    private HubDragPolicyTest() {
    }

    public static void main(String[] args) {
        constants();
        dismissThreshold();
        dragDetection();
        fade();
        dropDecision();

        System.out.println("HubDragPolicy: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (umbral 120 dp / 25 %, slop 6 dp y decisiones)");
    }

    private static void constants() {
        expect(120, HubDragPolicy.DISMISS_DP, "umbral de cierre en dp");
        expect(6, HubDragPolicy.DRAG_SLOP_DP, "slop del arrastre en dp");
        expect(true, HubDragPolicy.DISMISS_FRACTION == 0.25f, "fraccion de pantalla del umbral");
        expect(true, HubDragPolicy.MAX_FADE == 0.4f, "tope de desvanecido");
        expect(true, !HubDragPolicy.ACTION_DISMISS.equals(HubDragPolicy.ACTION_RESTORE),
                "acciones de soltar distintas");
        expect(true, !HubDragPolicy.ACTION_NONE.equals(HubDragPolicy.ACTION_DISMISS),
                "ninguna accion se confunde con cerrar");
    }

    private static void dismissThreshold() {
        // 120 dp en px = 360; 25 % de 2400 px = 600: manda el menor (360).
        expect(360, HubDragPolicy.dismissAfterPx(360, 2400), "pantalla alta: manda 120 dp");
        // 25 % de 800 px = 200: manda la fraccion.
        expect(200, HubDragPolicy.dismissAfterPx(360, 800), "pantalla baja: manda el 25 %");
        // 25 % de 480 px = 120: empate, mismo resultado.
        expect(120, HubDragPolicy.dismissAfterPx(360, 480), "empate entre 120 dp y 25 %");
        expect(0, HubDragPolicy.dismissAfterPx(360, 0), "alto cero no da umbral negativo");
        expect(0, HubDragPolicy.dismissAfterPx(360, -100), "alto negativo se acota a cero");
        expect(100, HubDragPolicy.dismissAfterPx(100, 10000), "un umbral menor se respeta");
    }

    private static void dragDetection() {
        expect(true, HubDragPolicy.isDrag(7f, 6), "7 px supera el slop de 6");
        expect(false, HubDragPolicy.isDrag(6f, 6), "exactamente 6 px no es arrastre");
        expect(false, HubDragPolicy.isDrag(5.9f, 6), "menos de 6 px no es arrastre");
        expect(false, HubDragPolicy.isDrag(0f, 6), "sin mover no hay arrastre");
        expect(false, HubDragPolicy.isDrag(-20f, 6), "subir no inicia el gesto de cierre");
    }

    private static void fade() {
        expect(true, HubDragPolicy.dragAlpha(0f, 2400) == 1f, "sin mover la hoja es opaca");
        expect(true, near(HubDragPolicy.dragAlpha(1200f, 2400), 0.75f), "baja la mitad: 0,75");
        expect(true, near(HubDragPolicy.dragAlpha(2400f, 2400), 0.6f), "baja el alto entero: tope 0,6");
        expect(true, near(HubDragPolicy.dragAlpha(24000f, 2400), 0.6f), "no baja del tope de desvanecido");
        expect(true, HubDragPolicy.dragAlpha(10f, 0) <= 1f, "alto cero no rompe la opacidad");
    }

    private static void dropDecision() {
        expect(HubDragPolicy.ACTION_NONE, HubDragPolicy.dropAction(0f, 360), "soltar en el sitio no hace nada");
        expect(HubDragPolicy.ACTION_NONE, HubDragPolicy.dropAction(-5f, 360), "soltar arriba no hace nada");
        expect(HubDragPolicy.ACTION_RESTORE, HubDragPolicy.dropAction(1f, 360), "un pixel de arrastre vuelve");
        expect(HubDragPolicy.ACTION_RESTORE, HubDragPolicy.dropAction(359f, 360), "justo debajo del umbral vuelve");
        expect(HubDragPolicy.ACTION_DISMISS, HubDragPolicy.dropAction(360f, 360), "justo en el umbral cierra");
        expect(HubDragPolicy.ACTION_DISMISS, HubDragPolicy.dropAction(361f, 360), "pasado el umbral cierra");
        expect(HubDragPolicy.ACTION_DISMISS, HubDragPolicy.dropAction(360f, 0), "umbral cero cierra con cualquier arrastre");
    }

    private static boolean near(float value, float expected) {
        return Math.abs(value - expected) <= 0.001f;
    }

    private static void expect(long expected, long actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    private static void expect(String expected, String actual, String label) {
        checks++;
        boolean same = expected == null ? actual == null : expected.equals(actual);
        if (!same) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
