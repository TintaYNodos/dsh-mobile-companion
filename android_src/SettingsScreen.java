/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Dialogo de Ajustes (tema, avisos, biometria, compositor, satelite y panic).
 * Las secciones de notificaciones y seguridad viven en clases propias; aqui
 * solo se componen y se construye el marco del dialogo.
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

        SettingsNotifications.addSection(a, form);
        SettingsSecurity.addSection(a, form);

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

        // P54 (bloque F): la copia del chat para el lector sin conexión se
        // puede desactivar; por defecto sigue activa.
        form.addView(UiKit.settingSwitchCard(a,
                "Copia del chat para uso sin conexión",
                "Guarda una copia del último chat en el teléfono para poder leerlo aunque se pierda la conexión.",
                WebBridge.isOfflineCopyEnabled(a),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_OFFLINE_COPY, checked).apply();
                    WebBridge.applyOfflineCopyToWeb(a);
                    Toast.makeText(a,
                            checked ? "Copia sin conexión activada" : "Copia sin conexión desactivada",
                            Toast.LENGTH_SHORT).show();
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
