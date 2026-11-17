/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Prueba Java pura de la preferencia de comandos rapidos: perfil por defecto,
 * seleccion de los 4 chips (y resto detras de "+") y Notas no desactivable.
 *
 * No entra en el APK: build-apk.ps1 compila solo `android_src\*.java` (sin
 * recursion). Se ejecuta a mano:
 *
 *   javac -encoding UTF-8 -cp android.jar -d out\test android_src\PrefKeys.java ^
 *     android_src\WatchdogPolicy.java android_src\tests\QuickCommandsTest.java ^
 *     android_src\tests\support\org\json\*.java
 *   java -cp "out\test;android.jar" com.tintaynodos.dshcompanion.QuickCommandsTest
 */
final class QuickCommandsTest {

    private static int checks = 0;
    private static int failures = 0;

    private QuickCommandsTest() {
    }

    public static void main(String[] args) {
        // 1. Perfil por defecto: ausente o roto cae en "auto"; auto usa escritura.
        expect("auto", PrefKeys.quickProfileOf(null), "perfil por defecto");
        expect("auto", PrefKeys.quickProfileOf("roto"), "JSON roto cae en auto");
        expect("auto", PrefKeys.normalizeProfile("otro"), "perfil invalido cae en auto");
        expect("escena,estilo,fuentes,continuar", join(PrefKeys.quickDefaults("auto")), "default auto");
        expect("escena,estilo,fuentes,continuar", join(PrefKeys.quickDefaults("escritura")), "default escritura");
        expect("auditar,explicar,pruebas,continuar", join(PrefKeys.quickDefaults("codigo")), "default codigo");

        // 2. Seleccion: maximo 4 chips visibles; el resto, detras del chip "+".
        String[] seis = {"escena", "estilo", "fuentes", "continuar", "pendientes", "coherencia"};
        expect(4, PrefKeys.quickVisible(seis).length, "maximo 4 chips");
        expect("escena,estilo,fuentes,continuar", join(PrefKeys.quickVisible(seis)), "primeros 4");
        expect("pendientes,coherencia", join(PrefKeys.quickOverflow(seis)), "resto detras de +");
        expect(0, PrefKeys.quickOverflow(new String[]{"escena"}).length, "sin + si caben");
        expect(2, PrefKeys.quickVisible(new String[]{"escena", "estilo"}).length, "menos de 4 no se rellena");

        // 3. Notas: siempre visible y nunca entra en la lista de ids activos.
        expect(true, PrefKeys.quickAlwaysOn("notas"), "Notas siempre visible");
        expect(false, PrefKeys.quickAlwaysOn("escena"), "los demas se pueden apagar");
        expect(false, PrefKeys.quickToggle(null, "notas", true).contains("\"notas\""), "Notas no entra en activos");
        expect("escena", join(PrefKeys.quickActiveOf(PrefKeys.quickJson("escritura", new String[]{"notas", "escena"}))),
                "Notas se filtra del JSON");

        // 4. Activar/desactivar conserva perfil y orden; el id nuevo va al final.
        String raw = PrefKeys.quickJson("codigo", new String[]{"auditar", "depurar", "continuar"});
        String off = PrefKeys.quickToggle(raw, "depurar", false);
        expect("codigo", PrefKeys.quickProfileOf(off), "el toggle conserva el perfil");
        expect("auditar,continuar", join(PrefKeys.quickActiveOf(off)), "desactivar quita el id");
        String on = PrefKeys.quickToggle(off, "depurar", true);
        expect("auditar,continuar,depurar", join(PrefKeys.quickActiveOf(on)), "activar agrega al final");
        expect("auditar,continuar,depurar", join(PrefKeys.quickActiveOf(PrefKeys.quickToggle(on, "depurar", true))),
                "activar dos veces no duplica");

        // 5. Cambiar de perfil reinicia la lista activa a la de ese perfil.
        expect("auditar,explicar,pruebas,continuar", join(PrefKeys.quickActiveOf(PrefKeys.quickSetProfile(raw, "codigo"))),
                "perfil codigo");
        expect("escena,estilo,fuentes,continuar", join(PrefKeys.quickActiveOf(PrefKeys.quickSetProfile(raw, "auto"))),
                "perfil auto");

        // 6. Catalogo: ids aprobados, descripcion <=60 y notas en Trabajo.
        String[] esperados = {"escena", "dialogo", "estilo", "fuentes", "coherencia", "auditar", "explicar",
                "pruebas", "depurar", "diseno", "continuar", "pendientes", "notas"};
        expect(esperados.length, PrefKeys.QUICK_COMMANDS.length, "tamano del catalogo");
        for (int index = 0; index < esperados.length; index++) {
            expect(esperados[index], PrefKeys.QUICK_COMMANDS[index][0], "id del catalogo " + index);
            expect(true, PrefKeys.QUICK_COMMANDS[index][2].length() <= 60,
                    "descripcion <=60: " + PrefKeys.QUICK_COMMANDS[index][0]);
        }
        expect("trabajo", PrefKeys.QUICK_COMMANDS[12][3], "Notas en el grupo Trabajo");

        // 7. La configuracion que recibe el dock incluye perfil, ids e interruptores.
        String dock = PrefKeys.quickDockJson(raw, true, false);
        expect(true, dock.contains("\"perfil\":\"codigo\""), "dock: perfil");
        expect(true, dock.contains("\"activos\":[\"auditar\",\"depurar\",\"continuar\"]"), "dock: activos");
        expect(true, dock.contains("\"quick\":true") && dock.contains("\"keys\":false"), "dock: interruptores");
        expect(true, dock.contains("\"notas\":true"), "dock: notas fija");

        System.out.println("QuickCommands: " + checks + " comprobaciones, " + failures + " fallos.");
        if (failures > 0) {
            System.out.println("RESULTADO: FALLO");
            System.exit(1);
        }
        System.out.println("RESULTADO: OK (perfil, seleccion de 4 y Notas fija)");
    }

    private static String join(String[] values) {
        return String.join(",", values);
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

    private static void expect(int expected, int actual, String label) {
        checks++;
        if (expected != actual) {
            failures++;
            System.out.println("FALLO: " + label + " (esperado " + expected + ", obtenido " + actual + ")");
        }
    }
}
