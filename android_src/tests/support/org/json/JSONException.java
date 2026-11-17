/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package org.json;

/**
 * SOLO PRUEBAS. `android.jar` incluye org.json como stubs que lanzan
 * "Stub!" fuera del dispositivo, así que los tests de JVM aportan esta
 * implementación mínima y real de org.json. No entra en el APK: build-apk.ps1
 * compila solo `android_src\*.java` (sin recursión), nunca `android_src\tests`.
 */
public class JSONException extends Exception {

    private static final long serialVersionUID = 1L;

    public JSONException(String message) {
        super(message);
    }

    public JSONException(String message, Throwable cause) {
        super(message, cause);
    }
}
