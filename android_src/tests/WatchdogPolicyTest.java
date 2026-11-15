/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Prueba de regresión Java pura de WatchdogPolicy. Sin Android y sin
 * dependencias: reproduce cuelgues del SSE con marcas de tiempo sintéticas.
 *
 * No entra en el APK: build-apk.ps1 compila solo `android_src\*.java` (sin
 * recursión), así que esta carpeta queda fuera del binario. Se ejecuta a mano:
 *
 *   javac -encoding UTF-8 -d out\test android_src\WatchdogPolicy.java android_src\tests\WatchdogPolicyTest.java
 *   java -cp out\test com.tintaynodos.dshcompanion.WatchdogPolicyTest
 */
final class WatchdogPolicyTest {

    private static int checks = 0;
    private static int failures = 0;

    private WatchdogPolicyTest() {
    }

    public static void main(String[] args) {
        final WatchdogPolicy policy = new WatchdogPolicy();
        final long t0 = 1_000_000L;

        // 1. Con eventos recientes no se toca nada.
        WatchdogPolicy.State live = state(t0, t0, t0);
        expect(WatchdogPolicy.Action.OK, policy.decide(live, t0 + 60_000L), "evento hace 1 min");
        expect(WatchdogPolicy.Action.OK, policy.decide(live, t0 + 179_999L), "justo antes del umbral");
        expect(0, live.failedReconnects, "sin reconexiones acumuladas");

        // 2. A los 3 min de silencio: RECONNECT (una sola vez por ventana).
        WatchdogPolicy.State stall = state(t0, t0, t0);
        expect(WatchdogPolicy.Action.RECONNECT, policy.decide(stall, t0 + 180_000L), "3 min de silencio");
        expect(1, stall.failedReconnects, "primera reconexión contada");
        expect(WatchdogPolicy.Action.OK, policy.decide(stall, t0 + 200_000L), "gracia del reconnect");
        expect(WatchdogPolicy.Action.RECONNECT, policy.decide(stall, t0 + 240_000L), "segunda reconexión");
        expect(2, stall.failedReconnects, "dos reconexiones acumuladas");
        // Al siguiente chequeo, dos fallos seguidos → RESTART.
        expect(WatchdogPolicy.Action.RESTART, policy.decide(stall, t0 + 260_000L), "RESTART tras dos fallos");
        expect(0, stall.failedReconnects, "el RESTART limpia el contador");
        expect(t0 + 260_000L, stall.lastRestartAt, "queda marcado el reinicio");

        // 3. Dentro de los 5 min posteriores al RESTART: paciencia, sin acción.
        expect(WatchdogPolicy.Action.OK, policy.decide(stall, t0 + 261_000L), "1 s tras el RESTART");
        expect(WatchdogPolicy.Action.OK, policy.decide(stall, t0 + 559_999L), "justo antes del límite");
        // 4. 5 min sin recuperar: ALERT, una sola vez.
        expect(WatchdogPolicy.Action.ALERT, policy.decide(stall, t0 + 560_000L), "ALERT a los 5 min");
        expect(WatchdogPolicy.Action.OK, policy.decide(stall, t0 + 620_000L), "el aviso no se repite");
        expect(WatchdogPolicy.Action.OK, policy.decide(stall, t0 + 900_000L), "no insiste en bucle");

        // 5. Si la conexión vuelve, el estado se limpia y la escucha sigue.
        WatchdogPolicy.State recovered = stall;
        policy.markConnected(recovered, t0 + 700_000L);
        expect(0L, recovered.restartArmedAt, "recuperado tras el RESTART");
        expect(false, recovered.alertSent, "se perdona el aviso previo");
        expect(WatchdogPolicy.Action.OK, policy.decide(recovered, t0 + 720_000L), "vuelve a estar OK");

        // 6. Límite: nunca dos RESTART en menos de 10 min.
        long now = 5_000_000L;
        WatchdogPolicy.State cooled = state(now - 900_000L, now - 900_000L, now - 900_000L);
        policy.decide(cooled, now - 800_000L); // RECONNECT #1
        policy.decide(cooled, now - 700_000L); // RECONNECT #2
        cooled.failedReconnects = WatchdogPolicy.MAX_FAILED_RECONNECTS;
        cooled.lastRestartAt = now - 5 * 60_000L; // hace 5 min: aún en enfriamiento
        expect(WatchdogPolicy.Action.OK, policy.decide(cooled, now), "RESTART bloqueado por enfriamiento");
        cooled.lastRestartAt = now - WatchdogPolicy.DEFAULT_RESTART_COOLDOWN_MS; // justo 10 min
        expect(WatchdogPolicy.Action.RESTART, policy.decide(cooled, now), "RESTART permitido a los 10 min");

        // 7. El keep-alive del puente también cuenta como vida.
        WatchdogPolicy.State keepAlive = state(t0, t0, t0);
        policy.markEvent(keepAlive, t0 + 170_000L);
        expect(WatchdogPolicy.Action.OK, policy.decide(keepAlive, t0 + 180_000L), "keep-alive reciente");

        // 8. Deshabilitado: no propone nada ni toca contadores.
        WatchdogPolicy.State off = state(t0, t0, t0);
        off.enabled = false;
        expect(WatchdogPolicy.Action.OK, policy.decide(off, t0 + 3_600_000L), "watchdog desactivado");
        expect(0, off.failedReconnects, "desactivado no cuenta reconexiones");
        expect(0L, off.lastReconnectAt, "desactivado no reconecta");

        // 9. Umbrales configurables y edades legibles.
        WatchdogPolicy custom = new WatchdogPolicy(60_000L, 10_000L, 120_000L, 300_000L);
        WatchdogPolicy.State customState = state(t0, t0, t0);
        expect(WatchdogPolicy.Action.OK, custom.decide(customState, t0 + 59_999L), "umbral propio, aún fresco");
        expect(WatchdogPolicy.Action.RECONNECT, custom.decide(customState, t0 + 60_000L), "umbral propio, 60 s");
        long base = 1_000_000_000L;
        expect("nunca", WatchdogPolicy.describeAge(base, 0L), "edad nunca");
        expect("hace 35 s", WatchdogPolicy.describeAge(base, base - 35_000L), "edad segundos");
        expect("hace 3 min", WatchdogPolicy.describeAge(base, base - 180_000L), "edad minutos");
        expect("hace 2 h", WatchdogPolicy.describeAge(base, base - 7_200_000L), "edad horas");
        expect("hace 4 d", WatchdogPolicy.describeAge(base, base - 4 * 86_400_000L), "edad dias");

        System.out.println("WatchdogPolicy: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (politica del watchdog verificada)");
    }

    private static WatchdogPolicy.State state(long eventAt, long okAt, long attemptAt) {
        WatchdogPolicy.State state = new WatchdogPolicy.State();
        state.enabled = true;
        state.lastEventAt = eventAt;
        state.lastOkAt = okAt;
        state.lastConnectAttemptAt = attemptAt;
        return state;
    }

    private static void expect(long expected, long actual, String label) {
        checks++;
        if (expected != actual) {
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

    private static void expect(WatchdogPolicy.Action expected, WatchdogPolicy.Action actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    private static void expect(String expected, String actual, String label) {
        checks++;
        if (!expected.equals(actual)) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }

    private static void expect(int expected, int actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
