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



import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Escaneo de QR con respaldo cuando no hay app de escaner.
 */
class QrDialogs {

    static void startQrScanner(MainActivity a, EditText targetField) {
        a.activeAddPcUrlField = targetField;
        Intent intent = new Intent("com.google.zxing.client.android.SCAN");
        intent.putExtra("SCAN_MODE", "QR_CODE_MODE");
        try {
            if (intent.resolveActivity(a.getPackageManager()) != null) {
                a.startActivityForResult(intent, REQUEST_QR_SCAN);
            } else {
                QrDialogs.showQrFallbackDialog(a, targetField);
            }
        } catch (Throwable e) {
            QrDialogs.showQrFallbackDialog(a, targetField);
        }
    }

    static void showQrFallbackDialog(MainActivity a, EditText targetField) {
        // Sugerir siempre la puerta de enlace de la red (x.y.z.1) no servía de
        // nada: esa IP es el router, no la computadora. Se ofrece la ultima
        // computadora conocida y, si no hay, se invita a explorar la red.
        String suggested = PcRegistryStore.lastKnownBunkerUrl(a);
        final String finalSuggested = suggested == null ? "" : suggested;

        AlertDialog.Builder builder = new AlertDialog.Builder(a)
                .setTitle("Escáner no disponible")
                .setMessage("No hay una aplicación de escaneo QR instalada.\n\n"
                        + (finalSuggested.isEmpty()
                            ? "Escribe la dirección de la computadora a mano, o pulsa «Explorar red» para buscarla automáticamente."
                            : "Puedes usar la última computadora conocida:\n" + finalSuggested
                              + "\n\nO escribir la dirección a mano y usar «Explorar red»."))
                .setNegativeButton("Cerrar", null);

        if (!finalSuggested.isEmpty()) {
            builder.setPositiveButton("Usar esta dirección", (d, w) -> {
                if (targetField != null) targetField.setText(finalSuggested);
            });
        }

        builder.setNeutralButton("Explorar red", (d, w) -> {
            if (a.addressDialog != null && a.addressDialog.isShowing()) a.addressDialog.dismiss();
            Discovery.discover(a, false);
        });

        AlertDialog dialog = builder.create();
        UiKit.styleDialog(a, dialog);
        dialog.show();
    }
}
