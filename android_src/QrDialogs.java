/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import static com.tintaynodos.dshcompanion.PrefKeys.REQUEST_QR_SCAN;

/**
 * Escaneo de QR con respaldo cuando no hay app de escáner.
 *
 * H-12: con targetSdk 35, Android 11+ solo deja ver paquetes ajenos declarados
 * en `<queries>`; el manifiesto ya declara `com.google.zxing.client.android.SCAN`
 * y el paquete del lector, así que `resolveActivity` funciona cuando el usuario
 * tiene un lector instalado. Si aun así no hay ninguno, el camino normal sigue
 * siendo el diálogo de respaldo: explica el motivo y muestra la última dirección
 * conocida como texto SELECCIONABLE (se puede copiar a mano o usar el botón).
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
        } catch (Throwable notVisibleOrBroken) {
            QrDialogs.showQrFallbackDialog(a, targetField);
        }
    }

    static void showQrFallbackDialog(MainActivity a, EditText targetField) {
        // La cámara del teléfono NO puede leer un QR por sí sola: Android no
        // expone un decodificador al sistema y esta app no lleva uno dentro.
        // El QR solo contiene la dirección (http://IP:57420), asi que este
        // dialogo ofrece los caminos equivalentes y deja de parecer un error.
        String suggested = PcRegistryStore.lastKnownBunkerUrl(a);
        final String finalSuggested = suggested == null ? "" : suggested.trim();

        LinearLayout body = new LinearLayout(a);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(ThemePalette.dp(a, 18), ThemePalette.dp(a, 4), ThemePalette.dp(a, 18), 0);

        TextView message = new TextView(a);
        message.setText("Este teléfono no tiene una app que lea códigos QR, así que la cámara "
                + "no puede leerlo. No hace falta para conectar: el QR solo lleva la dirección "
                + "de la computadora, y puedes llegar a ella igual de rápido.");
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        message.setTextColor(ThemePalette.ink(a));
        body.addView(message);

        TextView hint = new TextView(a);
        hint.setText("1) «Explorar red» busca tu PC en la red privada.\n"
                + "2) O escribe/pega la dirección a mano.");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        hint.setTextColor(ThemePalette.inkDim(a));
        hint.setPadding(0, ThemePalette.dp(a, 10), 0, 0);
        body.addView(hint);

        if (!finalSuggested.isEmpty()) {
            TextView label = new TextView(a);
            label.setText("Última dirección usada (seleccionable):");
            label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
            label.setTextColor(ThemePalette.inkDim(a));
            label.setPadding(0, ThemePalette.dp(a, 10), 0, ThemePalette.dp(a, 2));
            body.addView(label);

            TextView url = new TextView(a);
            url.setText(finalSuggested);
            url.setTextIsSelectable(true);
            url.setTypeface(Typeface.MONOSPACE);
            url.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
            url.setTextColor(ThemePalette.accentInk(a));
            url.setPadding(0, ThemePalette.dp(a, 2), 0, ThemePalette.dp(a, 6));
            body.addView(url);
        }

        TextView optional = new TextView(a);
        optional.setText("Opcional: si instalas un lector de QR, la app lo usará automáticamente "
                + "la próxima vez.");
        optional.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        optional.setTextColor(ThemePalette.inkDim(a));
        optional.setPadding(0, ThemePalette.dp(a, 12), 0, 0);
        body.addView(optional);

        AlertDialog.Builder builder = new AlertDialog.Builder(a)
                .setTitle("Conectar con la computadora")
                .setView(body)
                .setNegativeButton("Escribir a mano", (d, w) -> {
                    if (targetField != null) {
                        targetField.requestFocus();
                        targetField.setSelection(targetField.getText().length());
                    }
                })
                .setPositiveButton("Explorar red", (d, w) -> Discovery.discover(a, false));

        if (!finalSuggested.isEmpty()) {
            builder.setNeutralButton("Usar esta dirección", (d, w) -> {
                if (targetField != null) targetField.setText(finalSuggested);
            });
        }

        AlertDialog dialog = builder.create();
        UiKit.styleDialog(a, dialog);
        dialog.show();
    }
}
