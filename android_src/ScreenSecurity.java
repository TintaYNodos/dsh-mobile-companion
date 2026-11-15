/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.content.SharedPreferences;
import android.view.WindowManager;

/**
 * P34: FLAG_SECURE opcional (Ajustes -> Seguridad).
 *
 * Con el bloqueo biométrico activo la pantalla se marca segura por defecto:
 * evita capturas, grabaciones y la miniatura en Recientes mientras hay una
 * sesión abierta. El usuario puede desactivarlo explícitamente en Ajustes; si
 * nunca lo tocó, el valor efectivo sigue al bloqueo biométrico.
 */
class ScreenSecurity {

    private ScreenSecurity() {}

    /** Valor efectivo: preferencia explícita o, si no existe, el biométrico. */
    static boolean isEnabled(Context context) {
        if (context == null) return false;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PrefKeys.PREFS, Context.MODE_PRIVATE);
            if (prefs.contains(PrefKeys.KEY_SECURE_SCREEN)) {
                return prefs.getBoolean(PrefKeys.KEY_SECURE_SCREEN, false);
            }
            return prefs.getBoolean(PrefKeys.KEY_BIOMETRIC_LOCK, false);
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** Aplica o retira FLAG_SECURE en la ventana de la actividad. */
    static void apply(MainActivity activity) {
        if (activity == null || activity.getWindow() == null) return;
        try {
            if (ScreenSecurity.isEnabled(activity)) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        } catch (Throwable ignored) {
        }
    }
}
