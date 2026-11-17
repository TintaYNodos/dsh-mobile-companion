/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * H-11: regresión Java pura de {@link UpdateInstaller#isVersionNewer}.
 *
 * El comparador antiguo hacía `replaceAll("[^0-9.]", "")`: `5.2.9-rc1` se
 * convertía en `5.2.91` y parecía más nueva que `5.2.9`, así que la app ofrecía
 * instalar un pre-release como si fuera una actualización. El comparador actual
 * descarta el sufijo de pre-release/build antes de comparar y falla cerrado
 * (false) cuando alguna de las dos cadenas no es una versión numérica.
 *
 * No entra en el APK (build-apk.ps1 compila solo `android_src\*.java`, sin
 * recursión). Se ejecuta a mano:
 *
 *   javac -encoding UTF-8 -cp android.jar -d out\test android_src\UpdateInstaller.java android_src\tests\UpdateVersionTest.java
 *   java -cp out\test com.tintaynodos.dshcompanion.UpdateVersionTest
 */
final class UpdateVersionTest {

    private static int checks = 0;
    private static int failures = 0;

    private UpdateVersionTest() {
    }

    public static void main(String[] args) {
        // --- Caso normal: el parche sí es más nuevo ------------------------
        expect(true, UpdateInstaller.isVersionNewer("5.2.10", "5.2.9"),
                "5.2.10 > 5.2.9");
        expect(false, UpdateInstaller.isVersionNewer("5.2.9", "5.2.10"),
                "5.2.9 no es más nueva que 5.2.10");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10", "5.2.10"),
                "la misma versión no es más nueva");
        expect(true, UpdateInstaller.isVersionNewer("5.2.10", "5.2"),
                "5.2.10 > 5.2 (las partes que faltan cuentan como 0)");
        expect(false, UpdateInstaller.isVersionNewer("5.2", "5.2.0"),
                "5.2 no es más nueva que 5.2.0");
        expect(true, UpdateInstaller.isVersionNewer("6.0", "5.9.99"),
                "comparación numérica, no lexicográfica");
        expect(true, UpdateInstaller.isVersionNewer("15.0", "9.9"),
                "15 > 9 como número, no como texto");

        // --- H-11: sufijos de pre-release -----------------------------------
        expect(false, UpdateInstaller.isVersionNewer("5.2.10-rc1", "5.2.10"),
                "5.2.10-rc1 no es más nueva que 5.2.10");
        expect(false, UpdateInstaller.isVersionNewer("5.2.9-rc1", "5.2.9"),
                "5.2.9-rc1 no es más nueva que 5.2.9 (antes el bug la volvía 5.2.91)");
        expect(true, UpdateInstaller.isVersionNewer("5.2.9-rc1", "5.2.8"),
                "5.2.9-rc1 sí es más nueva que 5.2.8");
        expect(false, UpdateInstaller.isVersionNewer("5.2.9-beta2", "5.2.10"),
                "5.2.9-beta2 es anterior a 5.2.10");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10-pre1", "5.2.10"),
                "5.2.10-pre1 no es más nueva que 5.2.10");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10-alpha", "5.2.10"),
                "5.2.10-alpha no es más nueva que 5.2.10");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10+build7", "5.2.10"),
                "5.2.10+build7 equivale a 5.2.10");

        // --- Prefijo v ------------------------------------------------------
        expect(true, UpdateInstaller.isVersionNewer("v5.2.10", "5.2.9"),
                "v5.2.10 > 5.2.9");
        expect(true, UpdateInstaller.isVersionNewer("V5.2.10", "v5.2.9"),
                "prefijo v/V en mayúscula o minúscula");
        expect(false, UpdateInstaller.isVersionNewer("v5.2.10", "5.2.10"),
                "v5.2.10 no es más nueva que 5.2.10");

        // --- Basura: fail-closed, nunca se ofrece actualizar ----------------
        expect(false, UpdateInstaller.isVersionNewer("no-es-version", "5.2.9"),
                "basura remota no es más nueva");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10", "basura"),
                "versión local ilegible: no se anuncia nada");
        expect(false, UpdateInstaller.isVersionNewer("", "5.2.9"),
                "cadena vacía no es más nueva");
        expect(false, UpdateInstaller.isVersionNewer(null, "5.2.9"),
                "null remoto no es más nuevo");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10", null),
                "null local no anuncia actualización");
        expect(false, UpdateInstaller.isVersionNewer("...", "5.2.9"),
                "solo puntos no es una versión");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10.beta", "5.2.9"),
                "componente no numérico sin guion: fail-closed");
        expect(false, UpdateInstaller.isVersionNewer("5.x.10", "5.2.9"),
                "componente no numérico: fail-closed");
        expect(false, UpdateInstaller.isVersionNewer("5.2.10-", "5.2.10"),
                "sufijo vacío no altera la comparación");

        System.out.println("UpdateVersion: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (H-11: pre-release/build descartados antes de comparar)");
    }

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
