/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * P36: regresión Java pura de CleartextPolicy. Sin Android y sin dependencias.
 *
 * No entra en el APK: build-apk.ps1 compila solo `android_src\*.java` (sin
 * recursión), así que esta carpeta queda fuera del binario. Se ejecuta a mano:
 *
 *   javac -encoding UTF-8 -d out\test android_src\CleartextPolicy.java android_src\tests\CleartextPolicyTest.java
 *   java -cp out\test com.tintaynodos.dshcompanion.CleartextPolicyTest
 */
final class CleartextPolicyTest {

    private static int checks = 0;
    private static int failures = 0;

    private CleartextPolicyTest() {
    }

    public static void main(String[] args) {
        // Regla normal: https siempre; http solo a red privada/loopback/bunker.
        expect(true, CleartextPolicy.allows("https://example.com/x", null), "https publico");
        expect(true, CleartextPolicy.allows("http://192.168.1.20:57420/", null), "http LAN");
        expect(true, CleartextPolicy.allows("http://100.100.1.2:57420/", null), "http CGNAT");
        expect(true, CleartextPolicy.allows("http://127.0.0.1:57420/", null), "http loopback");
        expect(false, CleartextPolicy.allows("http://example.com/", null), "http publico");
        expect(false, CleartextPolicy.allows("http://8.8.8.8/", null), "http IP publica");
        expect(true, CleartextPolicy.allows("http://bunker.duckdns.org/", "bunker.duckdns.org"),
                "http del bunker configurado");
        expect(false, CleartextPolicy.allows("http://otro.duckdns.org/", "bunker.duckdns.org"),
                "http de un host ajeno al bunker");

        // Entradas raras: no lanzan y se deniegan.
        expect(false, CleartextPolicy.allows(null, null), "null");
        expect(false, CleartextPolicy.allows("   ", null), "vacia");
        expect(false, CleartextPolicy.allows("http://", null), "sin host");
        expect(false, CleartextPolicy.allows("http://[", null), "IPv6 rota");
        expect(false, CleartextPolicy.allows("http://1.2.3/", null), "IPv4 corta");

        // P36 fail-closed: si la evaluación falla, la carga se deniega siempre.
        CleartextPolicy.simulateFailure = true;
        try {
            expect(false, CleartextPolicy.allows("https://example.com/", null),
                    "fallo inyectado en https -> false");
            expect(false, CleartextPolicy.allows("http://192.168.1.20/", null),
                    "fallo inyectado en LAN -> false");
        } finally {
            CleartextPolicy.simulateFailure = false;
        }
        expect(true, CleartextPolicy.allows("https://example.com/", null),
                "tras el fallo vuelve a evaluar normalmente");

        System.out.println("CleartextPolicy: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (P36 fail-closed verificado)");
    }

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
