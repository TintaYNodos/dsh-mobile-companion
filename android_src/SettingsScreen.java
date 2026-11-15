/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
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
import android.graphics.Typeface;


import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Dialogo de Ajustes (tema, avisos, biometria, compositor, satelite y panic).
 */
class SettingsScreen {

    static void openSettingsDialog(MainActivity a) {
        LinearLayout form = new LinearLayout(a);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(ThemePalette.dp(a, 20), ThemePalette.dp(a, 18), ThemePalette.dp(a, 20), ThemePalette.dp(a, 16));
        form.setBackgroundColor(ThemePalette.surface(a));

        form.addView(UiKit.sectionHeader(a, "TEMA VISUAL"));

        LinearLayout themeRow = new LinearLayout(a);
        themeRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams trParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        trParams.bottomMargin = ThemePalette.dp(a, 14);
        themeRow.setLayoutParams(trParams);

        int curTheme = a.prefs.getInt("theme_mode", 0);

        Button btnSys = UiKit.actionCompact(a, "Sistema", curTheme == 0, () -> {});
        Button btnDark = UiKit.actionCompact(a, "Oscuro", curTheme == 1, () -> {});
        Button btnLight = UiKit.actionCompact(a, "Claro", curTheme == 2, () -> {});

        LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p1.setMarginEnd(ThemePalette.dp(a, 4));
        btnSys.setLayoutParams(p1);

        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p2.setMarginStart(ThemePalette.dp(a, 2));
        p2.setMarginEnd(ThemePalette.dp(a, 2));
        btnDark.setLayoutParams(p2);

        LinearLayout.LayoutParams p3 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p3.setMarginStart(ThemePalette.dp(a, 4));
        btnLight.setLayoutParams(p3);

        themeRow.addView(btnSys);
        themeRow.addView(btnDark);
        themeRow.addView(btnLight);
        form.addView(themeRow);

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

        form.addView(UiKit.sectionHeader(a, "SEGURIDAD BIOMÉTRICA"));
        LinearLayout bioCard = new LinearLayout(a);
        bioCard.setOrientation(LinearLayout.HORIZONTAL);
        bioCard.setGravity(Gravity.CENTER_VERTICAL);
        bioCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        bioCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout bioText = new LinearLayout(a);
        bioText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams btParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bioText.setLayoutParams(btParams);

        TextView bioTitle = new TextView(a);
        bioTitle.setText("Bloquear con huella digital");
        bioTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        bioTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bioTitle.setTextColor(ThemePalette.ink(a));
        bioText.addView(bioTitle);

        TextView bioDesc = new TextView(a);
        bioDesc.setText("Pide confirmación biométrica al abrir la app");
        bioDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        bioDesc.setTextColor(ThemePalette.inkDim(a));
        bioText.addView(bioDesc);
        bioCard.addView(bioText);

        Switch swBio = new Switch(a);
        swBio.setChecked(a.prefs.getBoolean("biometric_lock_enabled", false));
        swBio.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean("biometric_lock_enabled", checked).apply();
            if (checked) {
                Toast.makeText(a, "Bloqueo por huella activado", Toast.LENGTH_SHORT).show();
            }
        });
        bioCard.addView(swBio);
        LinearLayout.LayoutParams bcParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bcParams.bottomMargin = ThemePalette.dp(a, 8);
        bioCard.setLayoutParams(bcParams);
        form.addView(bioCard);

        LinearLayout bioCritCard = new LinearLayout(a);
        bioCritCard.setOrientation(LinearLayout.HORIZONTAL);
        bioCritCard.setGravity(Gravity.CENTER_VERTICAL);
        bioCritCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        bioCritCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout bioCritText = new LinearLayout(a);
        bioCritText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams bctParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bioCritText.setLayoutParams(bctParams);

        TextView bioCritTitle = new TextView(a);
        bioCritTitle.setText("Doble biometría en acciones críticas");
        bioCritTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        bioCritTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bioCritTitle.setTextColor(ThemePalette.ink(a));
        bioCritText.addView(bioCritTitle);

        TextView bioCritDesc = new TextView(a);
        bioCritDesc.setText("Pide huella para autorizar herramientas de riesgo en la PC");
        bioCritDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        bioCritDesc.setTextColor(ThemePalette.inkDim(a));
        bioCritText.addView(bioCritDesc);
        bioCritCard.addView(bioCritText);

        Switch swBioCrit = new Switch(a);
        swBioCrit.setChecked(a.prefs.getBoolean("biometric_critical_actions_enabled", true));
        swBioCrit.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean("biometric_critical_actions_enabled", checked).apply();
            Toast.makeText(a, checked ? "Doble biometría activada" : "Doble biometría desactivada", Toast.LENGTH_SHORT).show();
        });
        bioCritCard.addView(swBioCrit);
        LinearLayout.LayoutParams bccParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bccParams.bottomMargin = ThemePalette.dp(a, 14);
        bioCritCard.setLayoutParams(bccParams);
        form.addView(bioCritCard);

        form.addView(UiKit.sectionHeader(a, "COMPOSITOR Y TECLADO"));
        LinearLayout enterCard = new LinearLayout(a);
        enterCard.setOrientation(LinearLayout.HORIZONTAL);
        enterCard.setGravity(Gravity.CENTER_VERTICAL);
        enterCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        enterCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout enterText = new LinearLayout(a);
        enterText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams etParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        enterText.setLayoutParams(etParams);

        TextView enterTitle = new TextView(a);
        enterTitle.setText("Enter para enviar (↵)");
        enterTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        enterTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        enterTitle.setTextColor(ThemePalette.ink(a));
        enterText.addView(enterTitle);

        TextView enterDesc = new TextView(a);
        enterDesc.setText("Al presionar Enter se envía el mensaje. Si está desactivado, inserta un salto de línea.");
        enterDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        enterDesc.setTextColor(ThemePalette.inkDim(a));
        enterText.addView(enterDesc);
        enterCard.addView(enterText);

        Switch swEnter = new Switch(a);
        swEnter.setChecked(WebBridge.isEnterSendEnabled(a));
        swEnter.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean(KEY_ENTER_SEND, checked).putBoolean(KEY_ENTER_NEWLINE, !checked).apply();
            WebBridge.applyEnterBehaviorToWeb(a);
            Toast.makeText(a, checked ? "Enter envía el mensaje" : "Enter inserta salto de línea (↵)", Toast.LENGTH_SHORT).show();
        });
        enterCard.addView(swEnter);
        LinearLayout.LayoutParams ecParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ecParams.bottomMargin = ThemePalette.dp(a, 14);
        enterCard.setLayoutParams(ecParams);
        form.addView(enterCard);

        form.addView(UiKit.settingSwitchCard(a, 
                "Comandos rápidos",
                "Muestra la fila Auditar, Explicar, Pruebas y Continuar sobre el compositor mientras escribes.",
                WebBridge.isQuickActionsEnabled(a),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_SHOW_QUICK_ACTIONS, checked).apply();
                    WebBridge.applyDockPreferencesToWeb(a);
                }));

        form.addView(UiKit.settingSwitchCard(a, 
                "Teclas de código",
                "Muestra Tab, Esc, /, { }, [ ], ( ), |, ~ y ` sobre el compositor mientras escribes.",
                WebBridge.isCodeKeysEnabled(a),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_SHOW_CODE_KEYS, checked).apply();
                    WebBridge.applyDockPreferencesToWeb(a);
                }));

        form.addView(UiKit.sectionHeader(a, "MODO SATÉLITE"));
        form.addView(SatelliteUi.buildSatelliteCard(a));
        form.addView(UiKit.sectionHeader(a, "MODO PÁNICO / EMERGENCIA"));
        final AlertDialog[] settingsDialogRef = new AlertDialog[1];
        form.addView(KillSwitchUi.buildCard(a, settingsDialogRef));

        ScrollView scroll = new ScrollView(a);
        scroll.addView(form);

        LinearLayout dialogCustomLayout = new LinearLayout(a);
        dialogCustomLayout.setOrientation(LinearLayout.VERTICAL);
        dialogCustomLayout.setBackgroundColor(ThemePalette.surface(a));

        LinearLayout header = new LinearLayout(a);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setBackgroundColor(ThemePalette.surface(a));

        TextView headerTitle = new TextView(a);
        headerTitle.setText("Ajustes");
        headerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f);
        headerTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        headerTitle.setTextColor(ThemePalette.ink(a));
        headerTitle.setPadding(ThemePalette.dp(a, 20), ThemePalette.dp(a, 18), ThemePalette.dp(a, 20), ThemePalette.dp(a, 12));
        header.addView(headerTitle);

        View headerDivider = new View(a);
        headerDivider.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ThemePalette.dp(a, 1)));
        headerDivider.setBackgroundColor(ThemePalette.outline(a));
        header.addView(headerDivider);

        dialogCustomLayout.addView(header);

        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        scroll.setLayoutParams(scrollLp);
        dialogCustomLayout.addView(scroll);

        AlertDialog dialog = new AlertDialog.Builder(a)
                .setView(dialogCustomLayout)
                .setPositiveButton("Listo", null)
                .create();
        a.settingsDialog = dialog;
        settingsDialogRef[0] = dialog;

        btnSys.setOnClickListener(v -> {
            a.prefs.edit().putInt("theme_mode", 0).apply();
            dialog.dismiss();
            a.recreate();
        });
        btnDark.setOnClickListener(v -> {
            a.prefs.edit().putInt("theme_mode", 1).apply();
            dialog.dismiss();
            a.recreate();
        });
        btnLight.setOnClickListener(v -> {
            a.prefs.edit().putInt("theme_mode", 2).apply();
            dialog.dismiss();
            a.recreate();
        });

        UiKit.styleDialog(a, dialog);
        dialog.show();
    }
}
