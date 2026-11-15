/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;
import android.hardware.biometrics.BiometricPrompt;
import android.os.CancellationSignal;


import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Puerta biometrica de la app y confirmacion de acciones criticas.
 */
class BiometricGate {

    static void checkBiometricAuth(MainActivity a) {
        if (!a.prefs.getBoolean("biometric_lock_enabled", false)) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        // Una sola verificación por sesión: volver del selector de archivos o de
        // Ajustes no debe re-pedir la huella a media tarea.
        if (a.biometricUnlocked || a.biometricPromptActive) return;

        // Sin PIN, patrón ni huella configurados no hay nada que verificar; exigir
        // biometría dejaría la app inutilizable en un equipo recién configurado.
        android.app.KeyguardManager km =
                (android.app.KeyguardManager) a.getSystemService(Context.KEYGUARD_SERVICE);
        if (km != null && !km.isDeviceSecure()) {
            a.biometricUnlocked = true;
            return;
        }

        a.biometricPromptActive = true;
        CancellationSignal signal = new CancellationSignal();
        BiometricPrompt prompt = new BiometricPrompt.Builder(a)
                .setTitle("Acceso a DSH Companion")
                .setSubtitle("Confirma tu identidad para acceder a la sesión")
                .setNegativeButton("Cancelar", a.getMainExecutor(), (d, w) -> {
                    a.biometricPromptActive = false;
                    a.finish();
                })
                .build();

        prompt.authenticate(signal, a.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
                a.biometricUnlocked = true;
                a.biometricPromptActive = false;
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                super.onAuthenticationError(errorCode, errString);
                a.biometricPromptActive = false;
                switch (errorCode) {
                    case BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED:
                    case BiometricPrompt.BIOMETRIC_ERROR_CANCELED:
                        a.finish();
                        return;
                    case BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT:
                    case BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT:
                    case BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT:
                    case BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS:
                        // No hay forma de verificar ahora mismo: se bloquea el acceso
                        // pero se informa, en lugar de cerrar la app en bucle.
                        Toast.makeText(a,
                                "Verificación biométrica no disponible. Usa el bloqueo del teléfono.",
                                Toast.LENGTH_LONG).show();
                        a.finish();
                        return;
                    default:
                        // Error transitorio (hardware ocupado, cancelado por el sistema):
                        // se deja la app abierta y se reintenta en el próximo resume.
                        Toast.makeText(a,
                                "No se pudo verificar la identidad", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    static void requestCriticalBiometricApproval(MainActivity a, String key, String toolName) {
        if (!a.prefs.getBoolean("biometric_critical_actions_enabled", true) || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            a.vibrateHaptic("confirm");
            if (a.webView != null) {
                String safeKey = org.json.JSONObject.quote(key);
                a.webView.evaluateJavascript("if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__('allow', " + safeKey + "); }", null);
            }
            return;
        }

        CancellationSignal signal = new CancellationSignal();
        BiometricPrompt prompt = new BiometricPrompt.Builder(a)
                .setTitle("Confirmar acción crítica")
                .setSubtitle("Autorizar ejecución de " + (toolName != null && !toolName.isEmpty() ? toolName : "herramienta"))
                .setNegativeButton("Cancelar", a.getMainExecutor(), (d, w) -> {
                    a.vibrateHaptic("reject");
                    Toast.makeText(a, "Acción cancelada por el usuario", Toast.LENGTH_SHORT).show();
                })
                .build();

        try {
            prompt.authenticate(signal, a.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    a.vibrateHaptic("confirm");
                    if (a.webView != null) {
                        String safeKey = org.json.JSONObject.quote(key);
                        a.webView.evaluateJavascript("if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__('allow', " + safeKey + "); }", null);
                    }
                    Toast.makeText(a, "Acción autorizada biométricamente", Toast.LENGTH_SHORT).show();
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    a.vibrateHaptic("reject");
                    Toast.makeText(a, "No se autorizó la acción: " + errString, Toast.LENGTH_SHORT).show();
                }
            });
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Error de seguridad en autenticación biométrica: " + e.getMessage(), e);
            a.vibrateHaptic("reject");
            if (a.webView != null) {
                a.webView.evaluateJavascript("window.__DSH_RESOLVE_APPROVAL__(" + org.json.JSONObject.quote(key) + ", 'deny')", null);
            }
        }
    }
}
