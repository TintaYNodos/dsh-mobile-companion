/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * H-03: regresión Java pura de {@link NotesSendGuard}.
 *
 * El candado es lo que impide que dos toques lanzados antes de que el botón se
 * deshabilite creen dos hilos y dupliquen la nota en la PC. Este arnés no toca
 * Android: el registro de botones está vacío, así que acquire/release prueban el
 * `AtomicBoolean` que comparten las tres rutas (tarjeta, «Enviar todas» y
 * editor).
 *
 * No entra en el APK (build-apk.ps1 compila solo `android_src\*.java`, sin
 * recursión). Se ejecuta a mano:
 *
 *   javac -encoding UTF-8 -cp android.jar -d out\test android_src\NotesSendGuard.java android_src\tests\NotesSendGuardTest.java
 *   java -cp out\test com.tintaynodos.dshcompanion.NotesSendGuardTest
 */
final class NotesSendGuardTest {

    private static int checks = 0;
    private static int failures = 0;

    private NotesSendGuardTest() {
    }

    public static void main(String[] args) {
        expect(true, NotesSendGuard.acquire(), "H-03: el primer envío toma el candado");
        expect(false, NotesSendGuard.acquire(), "H-03: el segundo toque no lanza otro envío");
        expect(false, NotesSendGuard.acquire(), "H-03: un tercer toque sigue bloqueado");

        NotesSendGuard.release();
        expect(true, NotesSendGuard.acquire(), "H-03: al soltar el candado el siguiente envío pasa");

        NotesSendGuard.release();
        NotesSendGuard.release();
        expect(true, NotesSendGuard.acquire(), "H-03: soltar dos veces no rompe el candado");
        NotesSendGuard.release();

        System.out.println("NotesSendGuard: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (H-03: un solo envío en vuelo a la vez)");
    }

    private static void expect(boolean expected, boolean actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
