/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Intent;
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
 * Dialogo de Ajustes (tema, avisos, biometria, compositor y panic).
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
                "Mostrar comandos rápidos",
                "Muestra los comandos del perfil activo sobre el compositor mientras escribes.",
                WebBridge.isQuickActionsEnabled(a),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_SHOW_QUICK_ACTIONS, checked).apply();
                    WebBridge.applyDockPreferencesToWeb(a);
                }));

        form.addView(UiKit.settingSwitchCard(a,
                "Mostrar teclas de código",
                "Muestra las teclas del perfil activo sobre el compositor mientras escribes.",
                WebBridge.isCodeKeysEnabled(a),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_SHOW_CODE_KEYS, checked).apply();
                    WebBridge.applyDockPreferencesToWeb(a);
                }));

        form.addView(UiKit.settingSwitchCard(a,
                "Píldora de conexión en horizontal",
                "Muestra la píldora flotante de estado también en apaisado. Se puede arrastrar a cualquier borde de la pantalla.",
                a.prefs.getBoolean(KEY_PILL_LANDSCAPE, false),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_PILL_LANDSCAPE, checked).apply();
                    PillUi.refreshVisibility(a);
                }));

        addQuickCommandsSection(a, form);

        // P54 (bloque F): la copia del chat para el lector sin conexión se
        // puede desactivar; por defecto sigue activa.
        // P56: al apagarla se borra también la copia nativa cifrada, y el botón
        // de debajo abre el lector nativo que funciona con la PC apagada.
        form.addView(UiKit.settingSwitchCard(a,
                "Copia del chat para uso sin conexión",
                "Guarda una copia cifrada del último chat en el teléfono para poder leerlo aunque se pierda la conexión.",
                WebBridge.isOfflineCopyEnabled(a),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(KEY_OFFLINE_COPY, checked).apply();
                    if (!checked) OfflineChatStore.clear(a);
                    WebBridge.applyOfflineCopyToWeb(a);
                    Toast.makeText(a,
                            checked ? "Copia sin conexión activada" : "Copia sin conexión desactivada",
                            Toast.LENGTH_SHORT).show();
                }));

        // «Guardar ahora» fuerza la captura del chat abierto (no espera al
        // pagehide) y explica el motivo si no hay copia; «Leer el último chat»
        // abre el lector nativo cifrado.
        Button btnSaveOfflineChat = UiKit.actionCompact(a, "Guardar ahora", true,
                () -> WebBridge.captureOfflineChatNow(a));
        Button btnReadOfflineChat = UiKit.actionCompact(a, "Leer el último chat", false, () -> {
            if (a.settingsDialog != null) a.settingsDialog.dismiss();
            a.startActivity(new Intent(a, OfflineChatActivity.class));
        });
        LinearLayout offlineRow = new LinearLayout(a);
        offlineRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams saveParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        saveParams.setMarginEnd(ThemePalette.dp(a, 4));
        btnSaveOfflineChat.setLayoutParams(saveParams);
        LinearLayout.LayoutParams readParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        readParams.setMarginStart(ThemePalette.dp(a, 2));
        btnReadOfflineChat.setLayoutParams(readParams);
        offlineRow.addView(btnSaveOfflineChat);
        offlineRow.addView(btnReadOfflineChat);
        LinearLayout.LayoutParams offlineRowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        offlineRowParams.bottomMargin = ThemePalette.dp(a, 6);
        offlineRow.setLayoutParams(offlineRowParams);
        form.addView(offlineRow);

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

    /**
     * Seccion «Comandos rapidos»: perfil (Auto/Escritura/Codigo) y un
     * interruptor con descripcion por comando, agrupado. «Notas» aparece
     * deshabilitado con la nota de que siempre esta.
     */
    private static void addQuickCommandsSection(MainActivity a, LinearLayout form) {
        form.addView(UiKit.sectionHeader(a, "COMANDOS RÁPIDOS"));
        final String raw = a.prefs.getString(KEY_QUICK_COMMANDS, null);
        final String perfil = PrefKeys.quickProfileOf(raw);
        String[] activos = PrefKeys.quickActiveOf(raw);

        TextView hint = new TextView(a);
        hint.setText("Se muestran 4 comandos en el dock y el resto detrás de «+». «Notas» está siempre visible; Auto usa el perfil con el que más trabajas.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        hint.setTextColor(ThemePalette.inkDim(a));
        hint.setPadding(ThemePalette.dp(a, 4), 0, ThemePalette.dp(a, 4), ThemePalette.dp(a, 8));
        form.addView(hint);

        LinearLayout profileRow = new LinearLayout(a);
        profileRow.setOrientation(LinearLayout.HORIZONTAL);
        final String[] values = {PROFILE_AUTO, PROFILE_ESCRITURA, PROFILE_CODIGO};
        final String[] names = {"Auto", "Escritura", "Código"};
        for (int index = 0; index < values.length; index++) {
            final String value = values[index];
            final String name = names[index];
            Button button = UiKit.actionCompact(a, name, value.equals(perfil), () -> {
                a.prefs.edit().putString(KEY_QUICK_COMMANDS, PrefKeys.quickSetProfile(raw, value)).apply();
                WebBridge.applyDockPreferencesToWeb(a);
                if (a.settingsDialog != null) a.settingsDialog.dismiss();
                SettingsScreen.openSettingsDialog(a);
                Toast.makeText(a, "Perfil de comandos: " + name, Toast.LENGTH_SHORT).show();
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.setMarginEnd(ThemePalette.dp(a, index < values.length - 1 ? 4 : 0));
            button.setLayoutParams(lp);
            profileRow.addView(button);
        }
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rowParams.bottomMargin = ThemePalette.dp(a, 8);
        profileRow.setLayoutParams(rowParams);
        form.addView(profileRow);

        for (int group = 0; group < QUICK_GROUPS.length; group++) {
            TextView label = new TextView(a);
            label.setText(QUICK_GROUP_LABELS[group]);
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
            label.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            label.setTextColor(ThemePalette.ink(a));
            label.setPadding(ThemePalette.dp(a, 4), ThemePalette.dp(a, 6), 0, ThemePalette.dp(a, 2));
            form.addView(label);
            for (String[] command : QUICK_COMMANDS) {
                if (!QUICK_GROUPS[group].equals(command[3])) continue;
                final String id = command[0];
                boolean siempre = PrefKeys.quickAlwaysOn(id);
                LinearLayout card = UiKit.settingSwitchCard(a, command[1], command[2],
                        siempre || containsId(activos, id),
                        (view, checked) -> {
                            String next = PrefKeys.quickToggle(
                                    a.prefs.getString(KEY_QUICK_COMMANDS, null), id, checked);
                            a.prefs.edit().putString(KEY_QUICK_COMMANDS, next).apply();
                            WebBridge.applyDockPreferencesToWeb(a);
                        });
                if (siempre) {
                    Switch toggle = SettingsNotifications.firstSwitch(card);
                    if (toggle != null) toggle.setEnabled(false);
                }
                form.addView(card);
            }
        }
    }

    private static boolean containsId(String[] values, String id) {
        for (String value : values) {
            if (value.equals(id)) return true;
        }
        return false;
    }
}
