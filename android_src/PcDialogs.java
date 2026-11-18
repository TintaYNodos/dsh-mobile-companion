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

import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Alta, edicion y selector de equipos (dialogos nativos).
 */
class PcDialogs {
    static void onConfigRoutesClicked(MainActivity a) {
        HubSheet.dismissHub(a);
        List<PcEntry> list = PcRegistryStore.getPcList(a);
        if (list.isEmpty()) {
            PcDialogs.openAddPcDialog(a);
        } else if (list.size() == 1) {
            PcDialogs.openEditPcDialog(a, list.get(0));
        } else {
            String[] names = new String[list.size()];
            for (int i = 0; i < list.size(); i++) {
                PcEntry pc = list.get(i);
                names[i] = pc.name + " (" + pc.url.replaceFirst("^https?://", "").replaceAll("/+$", "") + ")";
            }

            AlertDialog dialog = new AlertDialog.Builder(a)
                    .setTitle("Seleccionar PC para editar")
                    .setItems(names, (d, which) -> {
                        PcDialogs.openEditPcDialog(a, list.get(which));
                    })
                    .setNegativeButton("Cancelar", null)
                    .create();
            UiKit.styleDialog(a, dialog);
            dialog.show();
        }
    }

    static void openAddressEditor(MainActivity a) {
        PcDialogs.onConfigRoutesClicked(a);
    }

    static void openAddPcDialog(MainActivity a) {
        LinearLayout form = new LinearLayout(a);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(ThemePalette.dp(a, 20), ThemePalette.dp(a, 18), ThemePalette.dp(a, 20), ThemePalette.dp(a, 8));
        form.setBackgroundColor(ThemePalette.surface(a));

        int nextNum = PcRegistryStore.getPcList(a).size() + 1;
        final EditText nameInput = UiKit.field(a, "Nombre de la PC (ej. Laptop)", "PC " + nextNum);
        final EditText urlInput = UiKit.field(a, "Dirección IP (ej. http://10.x.x.x:57420)", "");
        urlInput.setTypeface(Typeface.MONOSPACE);
        final Button btnScanQr = UiKit.actionCompact(a, "Escanear QR de PC", false, () -> {
            a.activeAddPcUrlField = urlInput;
            QrDialogs.startQrScanner(a, urlInput);
        });
        LinearLayout.LayoutParams qrParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        qrParams.topMargin = ThemePalette.dp(a, 2);
        qrParams.bottomMargin = ThemePalette.dp(a, 6);
        btnScanQr.setLayoutParams(qrParams);

        final EditText macInput = UiKit.field(a, "Dirección MAC física (WOL)", "");
        final EditText accessInput = UiKit.field(a, "Clave de acceso (opcional)", "");
        accessInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);

        form.addView(UiKit.sectionLabel(a, "NUEVA COMPUTADORA"));
        form.addView(nameInput);
        form.addView(urlInput);
        form.addView(btnScanQr);
        form.addView(macInput);
        form.addView(UiKit.sectionLabel(a, "SEGURIDAD"));
        form.addView(accessInput);

        ScrollView scroll = new ScrollView(a);
        scroll.addView(form);

        AlertDialog dialog = new AlertDialog.Builder(a)
                .setTitle("Agregar nueva PC")
                .setView(scroll)
                .setPositiveButton("Guardar", null)
                .setNegativeButton("Cancelar", null)
                .create();

        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) window.setBackgroundDrawable(new ColorDrawable(ThemePalette.surface(a)));
            try {
                int titleId = a.getResources().getIdentifier("alertTitle", "id", "android");
                if (titleId > 0) {
                    TextView tv = dialog.findViewById(titleId);
                    if (tv != null) {
                        tv.setTextColor(ThemePalette.ink(a));
                        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15.5f);
                        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                }
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(ThemePalette.accentInk(a));
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(ThemePalette.inkDim(a));
            } catch (Throwable ignored) {}

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String targetUrl = urlInput.getText().toString().trim();
                String targetName = nameInput.getText().toString().trim();
                String targetMac = macInput.getText().toString().trim();
                String targetKey = accessInput.getText().toString().trim();

                if (targetUrl.isEmpty()) {
                    Toast.makeText(a, "Ingresa la dirección IP o URL", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                    targetUrl = "http://" + targetUrl;
                }
                if (targetName.isEmpty()) targetName = "PC " + nextNum;

                List<PcEntry> list = PcRegistryStore.getPcList(a);
                String newId = "pc_" + System.currentTimeMillis();
                PcEntry newEntry = new PcEntry(newId, targetName, targetUrl, targetKey, targetMac);
                list.add(newEntry);
                PcRegistryStore.savePcList(a, list);

                PcRegistryStore.setActivePcId(a, newId);
                dialog.dismiss();
                ConnectionController.connectTo(a, targetUrl);
                PillUi.refreshPillLabel(a);
                Toast.makeText(a, "PC agregada: " + targetName, Toast.LENGTH_SHORT).show();
            });
        });

        dialog.show();
    }

    static void openEditPcDialog(MainActivity a, PcEntry pc) {
        if (pc == null) return;
        LinearLayout form = new LinearLayout(a);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(ThemePalette.dp(a, 20), ThemePalette.dp(a, 18), ThemePalette.dp(a, 20), ThemePalette.dp(a, 8));
        form.setBackgroundColor(ThemePalette.surface(a));

        final EditText nameInput = UiKit.field(a, "Nombre de la PC", pc.name);
        final EditText urlInput = UiKit.field(a, "Dirección IP (ej. http://10.x.x.x:57420)", pc.url);
        urlInput.setTypeface(Typeface.MONOSPACE);
        final EditText macInput = UiKit.field(a, "Dirección MAC física (WOL)", pc.macAddress != null ? pc.macAddress : "");
        final EditText accessInput = UiKit.field(a, "Clave de acceso (opcional)", pc.accessKey != null ? pc.accessKey : "");
        accessInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);

        form.addView(UiKit.sectionLabel(a, "CONFIGURACIÓN DE " + pc.name.toUpperCase()));
        form.addView(nameInput);
        form.addView(urlInput);
        form.addView(macInput);
        form.addView(UiKit.sectionLabel(a, "SEGURIDAD"));
        form.addView(accessInput);

        ScrollView scroll = new ScrollView(a);
        scroll.addView(form);

        AlertDialog.Builder builder = new AlertDialog.Builder(a)
                .setTitle("Editar " + pc.name)
                .setView(scroll)
                .setPositiveButton("Guardar", null)
                .setNegativeButton("Cancelar", null);

        List<PcEntry> list = PcRegistryStore.getPcList(a);
        if (list.size() > 1) {
            builder.setNeutralButton("Eliminar PC", (d, w) -> {
                boolean wasActive = PcRegistryStore.getActivePcId(a, list).equals(pc.id);
                list.removeIf(item -> item.id.equals(pc.id));
                PcRegistryStore.savePcList(a, list);
                // P40: al dar de baja el equipo se borran sus cookies y las
                // credenciales HTTP que quedaron guardadas en la WebView.
                NetCredentials.clearForPc(a, pc.url);
                if (wasActive && !list.isEmpty()) {
                    PcRegistryStore.setActivePcId(a, list.get(0).id);
                    ConnectionController.connectTo(a, list.get(0).url);
                }
                PillUi.refreshPillLabel(a);
                Toast.makeText(a, "PC eliminada", Toast.LENGTH_SHORT).show();
            });
        }

        AlertDialog dialog = builder.create();
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) window.setBackgroundDrawable(new ColorDrawable(ThemePalette.surface(a)));
            try {
                int titleId = a.getResources().getIdentifier("alertTitle", "id", "android");
                if (titleId > 0) {
                    TextView tv = dialog.findViewById(titleId);
                    if (tv != null) {
                        tv.setTextColor(ThemePalette.ink(a));
                        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15.5f);
                        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                }
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(ThemePalette.accentInk(a));
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(ThemePalette.inkDim(a));
                if (dialog.getButton(AlertDialog.BUTTON_NEUTRAL) != null) {
                    dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setTextColor(ThemePalette.danger(a));
                }
            } catch (Throwable ignored) {}

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String targetUrl = urlInput.getText().toString().trim();
                String targetName = nameInput.getText().toString().trim();
                String targetKey = accessInput.getText().toString().trim();

                String targetMac = macInput.getText().toString().trim();

                if (targetUrl.isEmpty()) {
                    Toast.makeText(a, "Ingresa la dirección IP o URL", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                    targetUrl = "http://" + targetUrl;
                }
                if (targetName.isEmpty()) targetName = pc.name;

                pc.name = targetName;
                pc.url = targetUrl;
                pc.macAddress = targetMac;
                pc.accessKey = targetKey;

                for (int i = 0; i < list.size(); i++) {
                    if (list.get(i).id.equals(pc.id)) {
                        list.set(i, pc);
                        break;
                    }
                }
                PcRegistryStore.savePcList(a, list);

                if (PcRegistryStore.getActivePcId(a, list).equals(pc.id)) {
                    ConnectionController.connectTo(a, targetUrl);
                }
                PillUi.refreshPillLabel(a);
                dialog.dismiss();
                Toast.makeText(a, "Configuración guardada", Toast.LENGTH_SHORT).show();
            });
        });

        dialog.show();
    }
}
