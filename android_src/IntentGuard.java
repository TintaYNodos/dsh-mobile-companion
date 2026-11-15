/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * P18: los extras privilegiados de MainActivity (exportada) solo se aceptan si
 * el intent los firmó esta misma aplicación.
 *
 * MainActivity está exportada (LAUNCHER y ACTION_SEND). Cualquier aplicación
 * puede lanzarla con `trigger_update` o `shortcut_action` en los extras y
 * provocar una descarga/instalación o abrir diálogos internos. Como el paquete
 * emisor no es fiable (getCallingPackage solo se rellena con
 * startActivityForResult y un intent explícito puede falsificarse), los
 * productores internos (notificación de actualización, atajos dinámicos y
 * widget) firman el intent con un token secreto guardado en las preferencias
 * privadas (MODE_PRIVATE). Otra aplicación no puede leerlo.
 *
 * ACTION_SEND se mantiene abierto: compartir texto es una función pública.
 */
class IntentGuard {

    /** Extra con el token de confianza para los extras privilegiados. */
    static final String EXTRA_AUTH = "intent_auth";

    private static final String PREF_TOKEN = "internal_intent_token";
    private static final SecureRandom RNG = new SecureRandom();
    private static final Object LOCK = new Object();

    private IntentGuard() {}

    /** Token de confianza de la instalación; se crea la primera vez. */
    static String token(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PrefKeys.PREFS, Context.MODE_PRIVATE);
        synchronized (LOCK) {
            String current = prefs.getString(PREF_TOKEN, null);
            if (current != null && current.length() >= 32) return current;
            byte[] buffer = new byte[24];
            RNG.nextBytes(buffer);
            StringBuilder sb = new StringBuilder(buffer.length * 2);
            for (byte b : buffer) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            String created = sb.toString();
            prefs.edit().putString(PREF_TOKEN, created).apply();
            return created;
        }
    }

    /** Firma un intent de la propia app con el token de confianza. */
    static Intent sign(Context context, Intent intent) {
        if (intent == null) return null;
        String token = IntentGuard.token(context);
        if (token != null && !token.isEmpty()) intent.putExtra(EXTRA_AUTH, token);
        return intent;
    }

    /**
     * true solo si el intent va dirigido a esta app y trae el token correcto.
     * Los intents sin extras privilegiados no necesitan pasar por aquí.
     */
    static boolean isTrusted(Context context, Intent intent) {
        if (context == null || intent == null) return false;
        String packageName = context.getPackageName();

        String targetPackage = intent.getPackage();
        if (targetPackage != null && !packageName.equals(targetPackage)) return false;
        ComponentName component = intent.getComponent();
        if (component != null && component.getPackageName() != null
                && !packageName.equals(component.getPackageName())) {
            return false;
        }

        String provided = intent.getStringExtra(EXTRA_AUTH);
        if (provided == null || provided.trim().isEmpty()) return false;
        String expected = IntentGuard.token(context);
        if (expected == null || expected.isEmpty()) return false;
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }
}
