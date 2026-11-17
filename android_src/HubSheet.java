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

import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import android.view.WindowManager;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Panel inferior: estado, equipos, sistema y mantenimiento.
 */
class HubSheet {

    static void openHub(MainActivity a) {
        // Si el puente no responde (sin tunel), la unica via es GitHub: se
        // consulta sin esperar las 6 horas de cache.
        long lastPcOk = a.prefs.getLong("last_pc_ok", 0L);
        boolean bridgeOffline = System.currentTimeMillis() - lastPcOk > 3L * 60L * 1000L;
        UpdateInstaller.checkGitHubReleases(a, bridgeOffline);
        final AlertDialog dialog = new AlertDialog.Builder(a).create();
        dialog.setCanceledOnTouchOutside(true);
        a.sheetDialog = dialog;

        LinearLayout sheet = HubSheet.buildSheet(a);
        ScrollView scroll = new ScrollView(a);
        scroll.setFillViewport(false);
        scroll.addView(sheet);

        dialog.setView(scroll, 0, 0, 0, 0);
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window == null) return;
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            int widthDp = a.getResources().getConfiguration().screenWidthDp;
            if (widthDp >= 600) {
                window.setLayout(ThemePalette.dp(a, 540), ViewGroup.LayoutParams.WRAP_CONTENT);
                window.setGravity(Gravity.CENTER);
            } else {
                window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                window.setGravity(Gravity.BOTTOM);
            }
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.dimAmount = 0.55f;
            window.setAttributes(attributes);
        });
        dialog.show();
    }

    static LinearLayout buildSheet(MainActivity a) {
        LinearLayout sheet = new LinearLayout(a);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(ThemePalette.dp(a, 18), ThemePalette.dp(a, 12), ThemePalette.dp(a, 18), ThemePalette.dp(a, 24));

        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.RECTANGLE);
        background.setColor(ThemePalette.surface(a));
        background.setStroke(ThemePalette.dp(a, 1), ThemePalette.outline(a));
        background.setCornerRadii(new float[]{
                ThemePalette.dp(a, 20), ThemePalette.dp(a, 20), ThemePalette.dp(a, 20), ThemePalette.dp(a, 20), 0, 0, 0, 0
        });
        sheet.setBackground(background);

        View handle = new View(a);
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(ThemePalette.dp(a, 36), ThemePalette.dp(a, 4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.bottomMargin = ThemePalette.dp(a, 14);
        handle.setLayoutParams(handleParams);
        handle.setBackground(ThemePalette.rounded(a, ThemePalette.color(a, Color.parseColor("#30363D"), Color.parseColor("#D0D7DE")), Color.TRANSPARENT, 2f));
        sheet.addView(handle);

        LinearLayout headerRow = new LinearLayout(a);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        headerRow.setPadding(0, 0, 0, ThemePalette.dp(a, 10));

        LinearLayout headerText = new LinearLayout(a);
        headerText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams htParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        headerText.setLayoutParams(htParams);

        TextView title = new TextView(a);
        title.setText("DSH Companion");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setTextColor(ThemePalette.ink(a));
        headerText.addView(title);

        TextView subtitle = new TextView(a);
        subtitle.setText("Control de transporte • Red privada ZeroTier / Tailscale");
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        subtitle.setTextColor(ThemePalette.inkDim(a));
        subtitle.setPadding(0, ThemePalette.dp(a, 2), 0, 0);
        headerText.addView(subtitle);

        headerRow.addView(headerText);

        Button btnSettings = UiKit.actionCompact(a, "Ajustes", false, () -> {
            HubSheet.dismissHub(a);
            SettingsScreen.openSettingsDialog(a);
        });
        btnSettings.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        headerRow.addView(btnSettings);

        sheet.addView(headerRow);

        sheet.addView(UiKit.sectionHeader(a, "CONEXIONES"));
        List<PcEntry> pcList = PcRegistryStore.getPcList(a);
        String activeId = PcRegistryStore.getActivePcId(a, pcList);

        for (PcEntry pc : pcList) {
            sheet.addView(PcCards.buildPcCard(a, pc, pc.id.equals(activeId)));
        }

        Button addPcBtn = UiKit.actionCompact(a, "+  Agregar PC", false, () -> {
            HubSheet.dismissHub(a);
            PcDialogs.openAddPcDialog(a);
        });
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ap.topMargin = ThemePalette.dp(a, 2);
        ap.bottomMargin = ThemePalette.dp(a, 4);
        addPcBtn.setLayoutParams(ap);
        sheet.addView(addPcBtn);

        LinearLayout connActions = new LinearLayout(a);
        connActions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams connParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        connParams.topMargin = ThemePalette.dp(a, 2);
        connParams.bottomMargin = ThemePalette.dp(a, 4);
        connActions.setLayoutParams(connParams);

        Button btnDiscover = UiKit.actionCompact(a, "Explorar red", true, () -> {
            HubSheet.dismissHub(a);
            Discovery.discover(a, false);
        });
        Button btnConfig = UiKit.actionCompact(a, "Configurar rutas", false, () -> PcDialogs.onConfigRoutesClicked(a));

        LinearLayout.LayoutParams b1Params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        b1Params.setMarginEnd(ThemePalette.dp(a, 6));
        btnDiscover.setLayoutParams(b1Params);

        LinearLayout.LayoutParams b2Params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        b2Params.setMarginStart(ThemePalette.dp(a, 6));
        btnConfig.setLayoutParams(b2Params);

        connActions.addView(btnDiscover);
        connActions.addView(btnConfig);
        sheet.addView(connActions);

        sheet.addView(UiKit.sectionHeader(a, "LOCAL"));

        TextView notesHint = new TextView(a);
        notesHint.setText("Notas guardadas en el teléfono. Funcionan sin la PC y sin conexión; puedes enviarlas a la computadora cuando vuelva.");
        notesHint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        notesHint.setTextColor(ThemePalette.inkDim(a));
        notesHint.setPadding(0, 0, 0, ThemePalette.dp(a, 8));
        sheet.addView(notesHint);

        Button btnNotes = UiKit.actionCompact(a, "Notas", false, () -> {
            HubSheet.dismissHub(a);
            a.startActivity(new Intent(a, NotesActivity.class));
        });
        sheet.addView(btnNotes);

        sheet.addView(UiKit.sectionHeader(a, "SISTEMA"));
        View telem = SystemCards.buildTelemetryCard(a);
        if (telem != null) sheet.addView(telem);
        sheet.addView(SystemCards.buildKeepAwakeCard(a));

        int localCode = UpdateInstaller.getInstalledVersionCode(a);
        String localVer = UpdateInstaller.getInstalledVersionName(a);
        int serverCode = a.prefs.getInt("server_apk_code", 0);
        String serverVer = a.prefs.getString("server_apk_version", "");

        String ghLatestVer = a.prefs.getString("github_latest_version", "");
        String ghLatestUrl = a.prefs.getString("github_latest_url", "");

        boolean isUpdateAvailable = false;
        String updateTargetVer = "";
        String updateTargetUrl = "";
        String updateTargetSha = "";

        // Prioridad al bunker: sirve siempre el APK que acaba de compilar el
        // proyecto. Antes se preferia el enlace de GitHub, y si ese asset no
        // existia la descarga fallaba con "no se pudo actualizar".
        if (serverCode > localCode && !serverVer.isEmpty()) {
            isUpdateAvailable = true;
            updateTargetVer = serverVer;
            updateTargetUrl = "";
            updateTargetSha = a.prefs.getString("server_apk_sha256", "");
        } else if (UpdateInstaller.isVersionNewer(ghLatestVer, localVer) && !ghLatestUrl.isEmpty()) {
            isUpdateAvailable = true;
            updateTargetVer = ghLatestVer;
            updateTargetUrl = ghLatestUrl;
        }

        if (isUpdateAvailable) {
            final String finalVer = updateTargetVer;
            final String finalUrl = updateTargetUrl;
            final String finalSha = updateTargetSha;
            sheet.addView(UiKit.action(a, "Instalar actualización (v" + finalVer + ")", 3, () -> {
                HubSheet.dismissHub(a);
                UpdateInstaller.downloadAndInstallApk(a, finalUrl.isEmpty() ? null : finalUrl, "DSH-Companion.apk", "Actualizando a v" + finalVer + "...", finalSha);
            }));
        } else {
            Button btnUpToDate = UiKit.action(a, "Sistema al día (v" + localVer + ")", 4, () -> {
                Toast.makeText(a, "La aplicación está en la versión más reciente (v" + localVer + ")", Toast.LENGTH_SHORT).show();
            });
            btnUpToDate.setOnLongClickListener(v -> {
                AlertDialog dialog = new AlertDialog.Builder(a)
                        .setTitle("Reinstalar v" + localVer)
                        .setMessage("¿Deseas descargar y reinstalar el archivo APK actual?")
                        .setPositiveButton("Reinstalar", (d, w) -> {
                            HubSheet.dismissHub(a);
                            UpdateInstaller.downloadAndInstallApk(a);
                        })
                        .setNegativeButton("Cancelar", null)
                        .create();
                UiKit.styleDialog(a, dialog);
                dialog.show();
                return true;
            });
            sheet.addView(btnUpToDate);
        }

        // El "revertir a la versión anterior" se retiró: Android rechaza instalar
        // una versión con versionCode menor sobre la actual (el instalador
        // responde "el paquete no es válido"), así que el botón solo llevaba a un
        // callejón sin salida. Para volver atrás hay que desinstalar primero.

        sheet.addView(UiKit.sectionHeader(a, "MANTENIMIENTO"));

        LinearLayout maintenanceActions = new LinearLayout(a);
        maintenanceActions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams mParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mParams.topMargin = ThemePalette.dp(a, 2);
        maintenanceActions.setLayoutParams(mParams);

        Button btnReload = UiKit.actionCompact(a, "Recargar", false, () -> {
            HubSheet.dismissHub(a);
            a.webView.reload();
        });
        Button btnClear = UiKit.actionCompact(a, "Limpiar caché", false, () -> {
            HubSheet.dismissHub(a);
            HubSheet.clearCacheAndReload(a);
        });

        LinearLayout.LayoutParams r1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        r1.setMarginEnd(ThemePalette.dp(a, 6));
        btnReload.setLayoutParams(r1);

        LinearLayout.LayoutParams r2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        r2.setMarginStart(ThemePalette.dp(a, 6));
        btnClear.setLayoutParams(r2);

        maintenanceActions.addView(btnReload);
        maintenanceActions.addView(btnClear);
        sheet.addView(maintenanceActions);

        return sheet;
    }

    static void dismissHub(MainActivity a) {
        if (a.sheetDialog != null) {
            a.sheetDialog.dismiss();
            a.sheetDialog = null;
        }
    }

    static void clearCacheAndReload(MainActivity a) {
        try {
            android.webkit.WebViewDatabase.getInstance(a).clearHttpAuthUsernamePassword();
            android.webkit.CookieManager.getInstance().removeAllCookies(null);
            android.webkit.WebStorage.getInstance().deleteAllData();
        } catch (Throwable ignored) {
        }
        a.webView.clearCache(true);
        a.webView.clearHistory();
        a.webView.reload();
        Toast.makeText(a, "Caché limpiada", Toast.LENGTH_SHORT).show();
    }
}
