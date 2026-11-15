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
import android.Manifest;
import android.app.NotificationManager;
import android.webkit.CookieManager;
import java.net.HttpURLConnection;
import java.net.URL;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import android.content.pm.PackageManager;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Permiso de notificaciones, visibilidad y aviso de prueba.
 */
class NotificationGate {
    static boolean canPostNotifications(MainActivity a) {
        if (android.os.Build.VERSION.SDK_INT < 33) {
            NotificationManager nm = (NotificationManager) a.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm == null || nm.areNotificationsEnabled();
        }
        return a.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    static void requestNotificationPermission(MainActivity a) {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
    }

    /**
     * ¿Debe mostrarse una notificacion ahora mismo? Fuera de la app si; dentro
     * solo con el telefono bloqueado, y nunca con el interruptor maestro apagado.
     */
    static boolean shouldShowNotification(Context context) {
        if (context == null) return true;
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!p.getBoolean("notifications_master_enabled", true)) return false;

            android.app.KeyguardManager km = (android.app.KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            boolean isLocked = (km != null && km.isKeyguardLocked());
            return isLocked || !MainActivity.sIsAppVisible;
        } catch (Throwable ignored) {
            return !MainActivity.sIsAppVisible;
        }
    }


    static void sendPcEventTest(MainActivity a) {
        String base = MainActivity.getActiveBunkerUrl(a);
        if (base == null || base.trim().isEmpty()) {
            Toast.makeText(a, "Configura primero la dirección de la computadora", Toast.LENGTH_LONG).show();
            return;
        }
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        final String endpoint = base.replaceAll("/+$", "") + "/dsh-companion/pc-events/test";

        if (!PcEventsService.isEnabled(a)) {
            Toast.makeText(a, "Activa «Notificaciones de la PC» y reintenta", Toast.LENGTH_LONG).show();
            return;
        }
        if (!PcEventsService.isRunning()) {
            PcEventsService.start(a);
        }

        new Thread(() -> {
            String result;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                String key = MainActivity.getAccessKey(a);
                if (key != null && !key.trim().isEmpty()) {
                    String b64 = Base64.encodeToString(("dsh:" + key.trim()).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
                    conn.setRequestProperty("Authorization", "Basic " + b64);
                }
                // La autorizacion habitual del telefono es su cookie de
                // dispositivo; sin enviarla, el puente contesta 403.
                try {
                    String cookie = CookieManager.getInstance().getCookie(endpoint);
                    if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
                } catch (Throwable ignored) {}
                int code = conn.getResponseCode();
                java.io.InputStream is = code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
                String body = "";
                if (is != null) {
                    java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
                    byte[] chunk = new byte[512];
                    int read;
                    while ((read = is.read(chunk)) != -1) buffer.write(chunk, 0, read);
                    body = buffer.toString("UTF-8");
                    is.close();
                }
                conn.disconnect();

                if (code != 200) {
                    result = "El puente respondió " + code;
                } else {
                    java.util.regex.Matcher m = java.util.regex.Pattern
                            .compile("\"listeners\"\\s*:\\s*(\\d+)").matcher(body);
                    int listeners = m.find() ? Integer.parseInt(m.group(1)) : 0;
                    result = listeners > 0
                            ? "Prueba enviada: el teléfono debería avisar en unos segundos"
                            : "El puente no tiene ningún teléfono escuchando: activa el interruptor y reintenta";
                }
            } catch (Throwable error) {
                result = "No se pudo hablar con el puente: " + error.getClass().getSimpleName();
            }

            final String message = result;
            a.ui.post(() -> Toast.makeText(a, message, Toast.LENGTH_LONG).show());
        }).start();
    }
}
