/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Seccion NOTIFICACIONES del dialogo de Ajustes: aviso maestro, avisos de la
 * PC y pruebas de la cadena de avisos.
 */
class SettingsNotifications {

    static void addSection(MainActivity a, LinearLayout form) {
        form.addView(UiKit.sectionHeader(a, "NOTIFICACIONES"));
        LinearLayout notifCard = new LinearLayout(a);
        notifCard.setOrientation(LinearLayout.HORIZONTAL);
        notifCard.setGravity(Gravity.CENTER_VERTICAL);
        notifCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        notifCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout notifText = new LinearLayout(a);
        notifText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams ntParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        notifText.setLayoutParams(ntParams);

        TextView notifTitle = new TextView(a);
        notifTitle.setText("Notificaciones del sistema");
        notifTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        notifTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        notifTitle.setTextColor(ThemePalette.ink(a));
        notifText.addView(notifTitle);

        TextView notifDesc = new TextView(a);
        notifDesc.setText("Avisos de herramientas, pausas y estado");
        notifDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        notifDesc.setTextColor(ThemePalette.inkDim(a));
        notifText.addView(notifDesc);
        notifCard.addView(notifText);

        Switch swNotif = new Switch(a);
        swNotif.setChecked(a.prefs.getBoolean("notifications_master_enabled", true));
        swNotif.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean("notifications_master_enabled", checked).apply();
        });
        notifCard.addView(swNotif);
        LinearLayout.LayoutParams ncParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ncParams.bottomMargin = ThemePalette.dp(a, 14);
        notifCard.setLayoutParams(ncParams);
        form.addView(notifCard);

        form.addView(UiKit.settingSwitchCard(a,
                "Notificaciones de la PC",
                "Avisa al terminar una respuesta en la computadora, aunque la aplicación esté cerrada.",
                a.prefs.getBoolean(PcEventsService.PREF_ENABLED, false),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(PcEventsService.PREF_ENABLED, checked).apply();
                    if (checked) {
                        if (!NotificationGate.canPostNotifications(a)) NotificationGate.requestNotificationPermission(a);
                        PcEventsService.start(a);
                        Toast.makeText(a, "Avisos de la PC activados", Toast.LENGTH_SHORT).show();
                    } else {
                        PcEventsService.stop(a);
                        Toast.makeText(a, "Avisos de la PC desactivados", Toast.LENGTH_SHORT).show();
                    }
                }));

        // Pruebas de la cadena de avisos: primero el aviso local (permiso y
        // canal), despues el recorrido completo hasta el puente. Sin esto, un
        // fallo solo se descubre cuando el chat termina y no suena nada.
        LinearLayout notifyTests = new LinearLayout(a);
        notifyTests.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams ntLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ntLp.bottomMargin = ThemePalette.dp(a, 10);
        notifyTests.setLayoutParams(ntLp);

        Button btnTestLocal = UiKit.actionCompact(a, "Probar aviso local", false, () -> {
            if (!NotificationGate.canPostNotifications(a)) {
                NotificationGate.requestNotificationPermission(a);
                Toast.makeText(a, "Concede el permiso de notificaciones y reintenta", Toast.LENGTH_LONG).show();
                return;
            }
            NotificationsPc.notifyPcResponse(a, "Prueba local");
            Toast.makeText(a, "Aviso enviado: revisa la barra de notificaciones", Toast.LENGTH_SHORT).show();
        });
        Button btnTestPc = UiKit.actionCompact(a, "Probar desde la PC", false, () -> {
            NotificationGate.sendPcEventTest(a);
        });
        LinearLayout.LayoutParams t1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        t1.setMarginEnd(ThemePalette.dp(a, 6));
        btnTestLocal.setLayoutParams(t1);
        notifyTests.addView(btnTestLocal);
        notifyTests.addView(btnTestPc);
        form.addView(notifyTests);

        // Los avisos "aunque la app este cerrada" dependen del servicio en primer
        // plano. Samsung y otros fabricantes lo matan si la app no esta exenta de
        // la optimizacion de bateria, y entonces el aviso deja de llegar sin que
        // nada lo indique. Aqui se pide la exencion con un toque.
        form.addView(UiKit.settingSwitchCard(a,
                "Permitir en segundo plano",
                "Evita que el telefono mate el servicio de avisos cuando la app esta cerrada.",
                isBatteryExempt(a),
                (view, checked) -> {
                    if (checked && !isBatteryExempt(a)) requestBatteryExemption(a);
                    else if (checked) Toast.makeText(a, "Ya esta exento de la optimizacion de bateria", Toast.LENGTH_SHORT).show();
                }));
    }

    static boolean isBatteryExempt(MainActivity a) {
        try {
            PowerManager pm = (PowerManager) a.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(a.getPackageName());
        } catch (Throwable ignored) {
            return false;
        }
    }

    static void requestBatteryExemption(MainActivity a) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + a.getPackageName()));
            a.startActivity(intent);
            Toast.makeText(a, "Acepta la exencion para que los avisos no se corten", Toast.LENGTH_LONG).show();
        } catch (Throwable error) {
            try {
                a.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Throwable ignored) {
                Toast.makeText(a, "Abre Ajustes del sistema y exime esta app de la bateria", Toast.LENGTH_LONG).show();
            }
        }
    }
}
