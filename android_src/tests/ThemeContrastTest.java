/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Prueba Java pura del contraste de los colores de peligro de {@link ThemePalette}.
 *
 * El hallazgo de la 5.4.0 era que #EF4444 sobre raised (#21262D / #F6F8FA) daba
 * 4,04:1 / 3,53:1, por debajo del minimo AA de 4,5:1 a 13 sp. Aqui se calcula
 * el ratio WCAG 2.x de las constantes reales contra los fondos reales y se
 * documenta en la salida.
 *
 * No toca Android: solo aritmetica sobre los enteros ARGB.
 */
final class ThemeContrastTest {

    private static final int RAISED_DARK = 0xFF21262D;
    private static final int SURFACE_DARK = 0xFF161B22;
    private static final int RAISED_LIGHT = 0xFFF6F8FA;
    private static final int SURFACE_LIGHT = 0xFFFFFFFF;
    /** Rojo retirado; se conserva solo para demostrar que incumplia AA. */
    private static final int OLD_RED = 0xFFEF4444;
    private static final double AA = 4.5;

    private static int checks = 0;
    private static int failures = 0;

    private ThemeContrastTest() {
    }

    public static void main(String[] args) {
        double darkRaised = ratio(ThemePalette.DANGER_DARK, RAISED_DARK);
        double darkSurface = ratio(ThemePalette.DANGER_DARK, SURFACE_DARK);
        double lightRaised = ratio(ThemePalette.DANGER_LIGHT, RAISED_LIGHT);
        double lightSurface = ratio(ThemePalette.DANGER_LIGHT, SURFACE_LIGHT);

        expect(true, darkRaised >= AA, "rojo oscuro sobre raised cumple AA (>= 4,5)");
        expect(true, darkSurface >= AA, "rojo oscuro sobre surface cumple AA (>= 4,5)");
        expect(true, lightRaised >= AA, "rojo claro sobre raised cumple AA (>= 4,5)");
        expect(true, lightSurface >= AA, "rojo claro sobre surface cumple AA (>= 4,5)");

        // Los valores medidos quedan documentados y fijados (tolerancia 0,01).
        expect(true, near(darkRaised, 6.04), "ratio oscuro/raised = 6,04:1");
        expect(true, near(darkSurface, 6.86), "ratio oscuro/surface = 6,86:1");
        expect(true, near(lightRaised, 4.93), "ratio claro/raised = 4,93:1");
        expect(true, near(lightSurface, 5.24), "ratio claro/surface = 5,24:1");

        // El color anterior no llega a AA: si alguien vuelve a #EF4444, falla.
        expect(true, ratio(OLD_RED, RAISED_DARK) < AA, "el #EF4444 retirado incumplia AA en oscuro");
        expect(true, ratio(OLD_RED, RAISED_LIGHT) < AA, "el #EF4444 retirado incumplia AA en claro");
        expect(true, ThemePalette.DANGER_DARK != ThemePalette.DANGER_LIGHT,
                "el rojo se adapta por tema (uno solo no cumple en ambos fondos)");

        System.out.println("ThemeContrast: " + checks + " comprobaciones, " + failures + " fallos.");
        System.out.println("  oscuro: #FF7B72 / raised 6,04:1 / surface 6,86:1");
        System.out.println("  claro:  #D1242F / raised 4,93:1 / surface 5,24:1");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (contraste AA en ambos temas)");
    }

    /** Canal sRGB 0-255 a luminancia relativa lineal. */
    static double linear(int channel) {
        double c = channel / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /** Luminancia relativa WCAG de un color ARGB opaco. */
    static double luminance(int rgb) {
        int r = (rgb >> 16) & 0xFF;
        int g = (rgb >> 8) & 0xFF;
        int b = rgb & 0xFF;
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    }

    /** Ratio de contraste WCAG entre dos colores opacos. */
    static double ratio(int a, int b) {
        double la = luminance(a);
        double lb = luminance(b);
        double hi = Math.max(la, lb);
        double lo = Math.min(la, lb);
        return (hi + 0.05) / (lo + 0.05);
    }

    private static boolean near(double value, double expected) {
        return Math.abs(value - expected) <= 0.01;
    }

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label);
        }
    }
}
