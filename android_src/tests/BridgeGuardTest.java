/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * P1 (5.1.9): regresión de las funciones puras de BridgeGuard, el guardián del
 * nonce del puente JavaScript.
 *
 * BridgeGuard importa android.net.Uri (para comparar el origen del frame
 * principal), así que este test NO es Java puro estricto como
 * CleartextPolicyTest/WatchdogPolicyTest: se compila con el resto de android_src
 * y se ejecuta con android.jar en el classpath. Las clases stub de android.jar no
 * se ejecutan nunca: solo se llaman constantTimeEquals y randomHex, que no tocan
 * Android. No entra en el APK: build-apk.ps1 compila solo `android_src\*.java`
 * (sin recursión).
 *
 * <pre>
 *   javac -encoding UTF-8 -cp "%SDK%\platforms\android-35\android.jar" -d out\test ^
 *     out\gen\com\tintaynodos\dshcompanion\R.java android_src\*.java android_src\tests\BridgeGuardTest.java
 *   java -cp "out\test;%SDK%\platforms\android-35\android.jar" ^
 *     com.tintaynodos.dshcompanion.BridgeGuardTest
 * </pre>
 */
final class BridgeGuardTest {

    private static int checks = 0;
    private static int failures = 0;

    private BridgeGuardTest() {
    }

    public static void main(String[] args) {
        // Comparación en tiempo constante: igualdad exacta y rechazo fail-closed.
        expect(true, BridgeGuard.constantTimeEquals("abc123", "abc123"), "iguales");
        expect(false, BridgeGuard.constantTimeEquals("abc123", "abc124"), "distintos");
        expect(false, BridgeGuard.constantTimeEquals("abc", "abc "), "longitud distinta");
        expect(false, BridgeGuard.constantTimeEquals("abc", null), "derecha null");
        expect(false, BridgeGuard.constantTimeEquals(null, "abc"), "izquierda null");
        expect(false, BridgeGuard.constantTimeEquals(null, null), "ambos null");
        expect(false, BridgeGuard.constantTimeEquals("", "a"), "vacio contra valor");
        expect(true, BridgeGuard.constantTimeEquals("nonce-\u00f1-\u20ac", "nonce-\u00f1-\u20ac"),
                "UTF-8 multibyte");

        // Nonce aleatorio: bytes -> hex, y cada rotación es distinta.
        String first = BridgeGuard.randomHex(16);
        String second = BridgeGuard.randomHex(16);
        expect(first != null && first.matches("[0-9a-f]{32}"), true, "randomHex(16) es 32 hex");
        expect(BridgeGuard.randomHex(0).length() == 32, true, "randomHex(0) usa 16 bytes");
        expect(BridgeGuard.randomHex(-4).length() == 32, true, "randomHex negativo usa 16 bytes");
        expect(BridgeGuard.randomHex(32).length() == 64, true, "randomHex(32) es 64 hex");
        expect(first.equals(second), false, "dos rotaciones no coinciden");

        // 200 nonces: con 128 bits de entropía no debe repetirse ninguno.
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < 200; i++) seen.add(BridgeGuard.randomHex(16));
        expect(seen.size() == 200, true, "200 nonces distintos");

        System.out.println("BridgeGuard: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK");
    }

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FAIL " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
