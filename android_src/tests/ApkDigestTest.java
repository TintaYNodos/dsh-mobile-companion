/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * D1 (5.1.10): regresion Java pura de ApkDigest.resolveExpected.
 *
 * Antes, UpdateInstaller hacia `githubDigest.isEmpty()` con el valor de
 * UpdateRelease.expectedDigestFor(), que devuelve null para las URLs del buner:
 * NullPointerException, toast "Error al descargar" y la actualizacion del buner
 * nunca se instalaba. El arnes de abajo reproduce esa expresion con null y
 * comprueba que la ruta nueva usa el SHA-256 del servidor para el buner y el
 * digest de GitHub para GitHub.
 *
 * No entra en el APK: build-apk.ps1 compila solo `android_src\*.java` (sin
 * recursion), asi que esta carpeta queda fuera del binario. Se ejecuta a mano:
 *
 *   javac -encoding UTF-8 -d out\test android_src\ApkDigest.java android_src\tests\ApkDigestTest.java
 *   java -cp out\test com.tintaynodos.dshcompanion.ApkDigestTest
 *
 * ApkDigest es Java puro: no importa android.*, por eso este test tampoco.
 */
final class ApkDigestTest {

    private static int checks = 0;
    private static int failures = 0;

    private static final String SERVER_SHA =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final String GITHUB_SHA =
            "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    private static final String OTHER_SHA =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    private ApkDigestTest() {
    }

    public static void main(String[] args) {
        // --- D1: la ruta del buner usa el ancla del servidor ---------------
        // expectedDigestFor() devuelve null para una URL que no es de GitHub.
        String bunkerGithubDigest = null;
        expect(SERVER_SHA, ApkDigest.resolveExpected(bunkerGithubDigest, SERVER_SHA),
                "buner: expectedDigestFor null -> ancla = SHA del servidor");
        expect(ApkDigest.DECISION_OK,
                ApkDigest.decision(ApkDigest.resolveExpected(null, SERVER_SHA), SERVER_SHA),
                "buner: APK coincide con el SHA del servidor -> ok");
        expect(ApkDigest.DECISION_MISMATCH,
                ApkDigest.decision(ApkDigest.resolveExpected(null, SERVER_SHA), OTHER_SHA),
                "buner: APK distinto del SHA del servidor -> mismatch");
        expect(ApkDigest.DECISION_OK,
                ApkDigest.decision(ApkDigest.resolveExpected(null, "sha256:" + SERVER_SHA), SERVER_SHA),
                "buner: prefijo sha256: se normaliza");

        // Buner que aun no publica apkSha256: no hay ancla y se instala como
        // antes (no se debe bloquear una actualizacion legitima del buner).
        expect(null, ApkDigest.resolveExpected(null, ""), "buner sin SHA -> sin ancla");
        expect(null, ApkDigest.resolveExpected(null, null), "buner con null -> sin ancla");
        expect(ApkDigest.DECISION_NO_ANCHOR,
                ApkDigest.decision(ApkDigest.resolveExpected(null, ""), SERVER_SHA),
                "buner sin SHA -> decision no-anchor (instala)");

        // Buner que publica un SHA corrupto: fail-closed, no se instala.
        expect("", ApkDigest.resolveExpected(null, "no-es-un-sha"), "buner con SHA roto -> vacio");
        expect(ApkDigest.DECISION_MISSING,
                ApkDigest.decision(ApkDigest.resolveExpected(null, "no-es-un-sha"), SERVER_SHA),
                "buner con SHA roto -> decision missing (rechaza)");

        // --- Ruta de GitHub: manda su digest, no el del buner --------------
        expect(ApkDigest.DECISION_OK,
                ApkDigest.decision(ApkDigest.resolveExpected(GITHUB_SHA, SERVER_SHA), GITHUB_SHA),
                "GitHub: usa su digest");
        expect(ApkDigest.DECISION_MISMATCH,
                ApkDigest.decision(ApkDigest.resolveExpected(GITHUB_SHA, SERVER_SHA), SERVER_SHA),
                "GitHub: el SHA del buner no sustituye al digest");
        // Release de GitHub que no publica digest: expectedDigestFor devuelve ""
        // y NO debe caer al SHA del buner (seria aceptar un APK ajeno sin ancla).
        expect("", ApkDigest.resolveExpected("", SERVER_SHA),
                "GitHub sin digest -> vacio, sin fallback al buner");
        expect(ApkDigest.DECISION_MISSING,
                ApkDigest.decision(ApkDigest.resolveExpected("", SERVER_SHA), SERVER_SHA),
                "GitHub sin digest -> decision missing (rechaza)");

        // --- Regresion D1: la expresion antigua revienta con null ----------
        // Arnes: simula el valor que expectedDigestFor() devuelve para el buner
        // y demuestra que el codigo anterior lanzaba NPE. La ruta nueva no.
        String simulatedExpectedDigestFor = null;
        boolean oldPathThrew = false;
        try {
            simulatedExpectedDigestFor.isEmpty();
        } catch (NullPointerException expectedNpe) {
            oldPathThrew = true;
        }
        expect(true, oldPathThrew, "regresion D1: el codigo antiguo .isEmpty() sobre null lanzaba NPE");

        boolean newPathThrew = false;
        String recovered = null;
        try {
            recovered = ApkDigest.resolveExpected(simulatedExpectedDigestFor, SERVER_SHA);
        } catch (RuntimeException unexpected) {
            newPathThrew = true;
        }
        expect(false, newPathThrew, "fix D1: resolveExpected(null, SHA) no lanza");
        expect(SERVER_SHA, recovered, "fix D1: resolveExpected(null, SHA) devuelve el SHA del servidor");

        // --- ApkDigest.pickExpected: clasifica la URL por origen -----------
        expect(null, ApkDigest.pickExpected("http://192.168.1.20:57420/DSH-Companion.apk",
                        "", "", "", ""),
                "pickExpected: URL del buner -> null (sin ancla de GitHub)");
        expect(GITHUB_SHA, ApkDigest.pickExpected("https://github.com/x/y.apk",
                        "https://github.com/x/y.apk", "sha256:" + GITHUB_SHA, "", ""),
                "pickExpected: asset de GitHub -> digest publicado");
        expect("", ApkDigest.pickExpected("https://github.com/x/y.apk",
                        "https://github.com/x/y.apk", "", "", ""),
                "pickExpected: asset de GitHub sin digest -> vacio");
        expect("", ApkDigest.pickExpected("https://github.com/otro.apk",
                        "https://github.com/x/y.apk", "sha256:" + GITHUB_SHA, "", ""),
                "pickExpected: URL de GitHub desconocida -> vacio (fail-closed)");

        // --- Normalizacion y decision --------------------------------------
        expect(SERVER_SHA, ApkDigest.normalize("sha256:" + SERVER_SHA.toUpperCase()),
                "normalize: prefijo y mayusculas");
        expect("", ApkDigest.normalize(null), "normalize: null");
        expect("", ApkDigest.normalize("1234"), "normalize: longitud incorrecta");
        expect(ApkDigest.DECISION_MISMATCH, ApkDigest.decision(SERVER_SHA, ""),
                "decision: digest real vacio -> mismatch");
        expect(ApkDigest.DECISION_OK, ApkDigest.decision(SERVER_SHA, SERVER_SHA),
                "decision: iguales -> ok");

        System.out.println("ApkDigest: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (D1: buner usa ancla del servidor, GitHub su digest)");
    }

    private static void expect(String expected, String actual, String label) {
        checks++;
        if (expected == null ? actual != null : !expected.equals(actual)) {
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
