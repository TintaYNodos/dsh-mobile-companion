/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

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
    }
}
