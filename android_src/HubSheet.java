/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.List;

import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import android.view.WindowManager;

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
        // Atras cancela el dialogo; el listener de abajo deja la referencia de
        // la Activity limpia pase lo que pase.
        dialog.setCancelable(true);
        a.sheetDialog = dialog;

        LinearLayout sheet = HubSheet.buildSheet(a);
        ScrollView scroll = new ScrollView(a);
        // fillViewport: la hoja estira su fondo hasta el borde inferior y el
        // ScrollView conserva la altura acotada del dialogo, que es lo que le
        // permite desplazar cuando el contenido no cabe.
        scroll.setFillViewport(true);
        scroll.addView(sheet);

        // Contenedor transparente con un respiro arriba. Antes el dialogo se
        // pedia WRAP_CONTENT: crecia con el contenido, Android lo recortaba
        // contra la pantalla y el ScrollView no tenia overflow que desplazar,
        // asi que «MANTENIMIENTO» y su cierre quedaban inalcanzables.
        final LinearLayout container = new LinearLayout(a);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(0, ThemePalette.dp(a, 24), 0, 0);
        // El panel del AlertDialog se mide con AT_MOST: sin un minimo, el
        // LinearLayout con peso se quedaria a la altura del contenido y la
        // hoja flotaria arriba. El AT_MOST del dialogo recorta este minimo al
        // espacio real disponible, asi que nunca se sale de la pantalla.
        android.util.DisplayMetrics screen = new android.util.DisplayMetrics();
        a.getWindowManager().getDefaultDisplay().getRealMetrics(screen);
        container.setMinimumHeight(screen.heightPixels);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        container.addView(scroll, scrollParams);

        // Hoja inferior: arrastrar tirador o cabecera la cierra; el cuerpo no
        // inicia el gesto (conserva el scroll). Umbral: 120 dp o 25 % del alto.
        final int dismissAfter = Math.min(ThemePalette.dp(a, 120), Math.round(screen.heightPixels * 0.25f));
        final float[] dragStart = {0f};
        final View.OnTouchListener dragSheet = (v, event) -> {
            int action = event.getActionMasked();
            if (action == MotionEvent.ACTION_DOWN) { dragStart[0] = event.getRawY(); v.getParent().requestDisallowInterceptTouchEvent(true); }
            else if (action == MotionEvent.ACTION_MOVE) {
                float moved = event.getRawY() - dragStart[0];
                if (moved > ThemePalette.dp(a, 6)) {
                    container.setTranslationY(moved);
                    container.setAlpha(1f - Math.min(0.4f, moved / Math.max(1f, screen.heightPixels * 2f)));
                }
            } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) {
                float travelled = container.getTranslationY();
                if (travelled >= dismissAfter) {
                    container.animate().translationY(screen.heightPixels).alpha(0f).setDuration(180).withEndAction(() -> dialog.dismiss()).start();
                } else if (travelled > 0f) {
                    container.animate().translationY(0f).alpha(1f).setDuration(160).start();
                }
            }
            return true;
        };
        sheet.getChildAt(0).setOnTouchListener(dragSheet);
        sheet.getChildAt(1).setOnTouchListener(dragSheet);
        dialog.setView(container, 0, 0, 0, 0);
        HubSheet.applySafeArea(a, container, sheet);
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window == null) return;
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            int widthDp = a.getResources().getConfiguration().screenWidthDp;
            // Alto MATCH_PARENT en ambas formas: nunca depende del contenido,
            // asi que el ScrollView siempre recibe una altura util y scrollea.
            if (widthDp >= 600) {
                window.setLayout(ThemePalette.dp(a, 540), ViewGroup.LayoutParams.MATCH_PARENT);
                window.setGravity(Gravity.CENTER);
            } else {
                window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                window.setGravity(Gravity.BOTTOM);
            }
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.dimAmount = 0.55f;
            window.setAttributes(attributes);
            container.requestApplyInsets();
        });
        // Cerrar con Atras o con «Cerrar» deja a.sheetDialog en null para que
        // KeyRouter y Cleanup no vean una hoja ya cerrada.
        dialog.setOnDismissListener(d -> {
            if (a.sheetDialog == dialog) a.sheetDialog = null;
        });
        dialog.show();
    }

    /**
     * Rellena el contenido con los insets de las barras del sistema: el tirador
     * queda debajo del estado y el ultimo boton por encima de la navegacion.
     * Con Android 15 en borde a borde (targetSdk 35) el dialogo puede dibujarse
     * bajo las barras; sin este relleno el final de la hoja quedaba tapado.
     */
    static void applySafeArea(MainActivity a, LinearLayout container, LinearLayout sheet) {
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            int topInset = insets.getSystemWindowInsetTop();
            int bottomInset = insets.getSystemWindowInsetBottom();
            view.setPadding(0, ThemePalette.dp(a, 24) + topInset, 0, 0);
            sheet.setPadding(ThemePalette.dp(a, 18), ThemePalette.dp(a, 12),
                    ThemePalette.dp(a, 18), ThemePalette.dp(a, 24) + bottomInset);
            return insets;
        });
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

        // El tirador visible mide 4 dp, pero se envuelve en una franja de 28 dp
        // para que el arrastre de hoja inferior tenga un objetivo tactil real.
        LinearLayout handleArea = new LinearLayout(a);
        handleArea.setGravity(Gravity.CENTER_HORIZONTAL);
        handleArea.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ThemePalette.dp(a, 28)));
        View handle = new View(a);
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(ThemePalette.dp(a, 36), ThemePalette.dp(a, 4));
        handleParams.bottomMargin = ThemePalette.dp(a, 6);
        handle.setLayoutParams(handleParams);
        handle.setBackground(ThemePalette.rounded(a, ThemePalette.color(a, Color.parseColor("#30363D"), Color.parseColor("#D0D7DE")), Color.TRANSPARENT, 2f));
        handleArea.addView(handle);
        sheet.addView(handleArea);

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

        // P56: lector nativo de la copia cifrada del último chat, sin PC ni red.
        Button btnOfflineChat = UiKit.actionCompact(a, "Último chat guardado", false, () -> {
            HubSheet.dismissHub(a);
            a.startActivity(new Intent(a, OfflineChatActivity.class));
        });
        sheet.addView(btnOfflineChat);

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
                            UpdateInstaller.downloadAndInstallApkFromHub(a);
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
            HubSheet.confirmClearCacheAndReload(a);
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

        // Ultima accion de la hoja: siempre alcanzable al final del scroll,
        // 48 dp de alto y ancho completo. Tambien cierra con Atras.
        Button btnClose = UiKit.action(a, "Cerrar", 1, () -> HubSheet.dismissHub(a));
        btnClose.setContentDescription("Cerrar el panel");
        btnClose.setMinHeight(ThemePalette.dp(a, 48));
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ThemePalette.dp(a, 48));
        closeParams.topMargin = ThemePalette.dp(a, 16);
        btnClose.setLayoutParams(closeParams);
        sheet.addView(btnClose);

        return sheet;
    }

    static void dismissHub(MainActivity a) {
        if (a.sheetDialog != null) {
            a.sheetDialog.dismiss();
            a.sheetDialog = null;
        }
    }

    /**
     * H-04: «Limpiar caché» ya no borra la cookie de emparejamiento. Se pide
     * confirmación y la limpieza real (con la cookie preservada) vive en
     * {@link CacheMaintenance}.
     */
    static void confirmClearCacheAndReload(MainActivity a) {
        CacheMaintenance.confirm(a);
    }
}
