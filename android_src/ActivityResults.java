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

import android.app.Activity;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Resultados de selector de archivos, QR, instalacion y permisos.
 */
class ActivityResults {

    static void onActivityResult(MainActivity a, int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_QR_SCAN) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                String scanned = data.getStringExtra("SCAN_RESULT");
                if (scanned == null || scanned.isEmpty()) {
                    scanned = data.getDataString();
                }
                if (scanned != null && !scanned.trim().isEmpty()) {
                    String url = scanned.trim();
                    if (!url.startsWith("http://") && !url.startsWith("https://")) {
                        url = "http://" + url;
                    }
                    if (a.activeAddPcUrlField != null) {
                        a.activeAddPcUrlField.setText(url);
                        a.vibrateHaptic("confirm");
                        Toast.makeText(a, "Dirección autocompletada desde QR", Toast.LENGTH_SHORT).show();
                    }
                }
            }
            return;
        }
        if (requestCode == REQUEST_INSTALL_PERMISSION) {
            // P19: reanuda la descarga con la misma procedencia (GitHub o
            // búnker) que se solicitó antes de pedir el permiso de instalación.
            String pendingUrl = a.prefs.getString("pending_apk_url", "");
            String pendingName = a.prefs.getString("pending_apk_name", "");
            String pendingTitle = a.prefs.getString("pending_apk_title", "");
            a.prefs.edit()
                    .remove("pending_apk_url")
                    .remove("pending_apk_name")
                    .remove("pending_apk_title")
                    .apply();
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                if (a.getPackageManager().canRequestPackageInstalls()) {
                    UpdateInstaller.downloadAndInstallApk(a,
                            pendingUrl == null || pendingUrl.isEmpty() ? null : pendingUrl,
                            pendingName == null || pendingName.isEmpty() ? null : pendingName,
                            pendingTitle == null || pendingTitle.isEmpty() ? null : pendingTitle);
                }
            }
            return;
        }
        if (requestCode != REQUEST_FILE || a.fileCallback == null) return;

        Uri[] result = null;
        if (resultCode == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];
                for (int index = 0; index < count; index++) {
                    result[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }

        a.fileCallback.onReceiveValue(result);
        a.fileCallback = null;
    }

    static void onRequestPermissionsResult(MainActivity a, int requestCode, String[] permissions, int[] results) {

        if (requestCode == REQUEST_NOTIFICATIONS) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                // Sin permiso las notificaciones se descartan en silencio: es la
                // causa tipica de "solo cuando quiere me las manda".
                new AlertDialog.Builder(a)
                        .setTitle("Notificaciones bloqueadas")
                        .setMessage("Android tiene bloqueados los avisos de DSH Companion. Sin este permiso no llegarán "
                                + "las peticiones de herramientas ni los avisos de la computadora.\n\n"
                                + "Actívalos en Ajustes del sistema → Aplicaciones → DSH Companion → Notificaciones.")
                        .setPositiveButton("Abrir ajustes", (d, w) -> {
                            try {
                                Intent intent = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                                intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, a.getPackageName());
                                a.startActivity(intent);
                            } catch (Throwable ignored) {}
                        })
                        .setNegativeButton("Ahora no", null)
                        .show();
            }
            return;
        }

        if (requestCode != REQUEST_AUDIO || a.audioRequest == null) return;

        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            a.audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            a.audioRequest.deny();
        }
        a.audioRequest = null;
    }
}
