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
 * Modo satelite: tarjeta de clave API y entrega de eventos al WebView.
 */
class SatelliteUi {

    static LinearLayout buildSatelliteCard(MainActivity a) {
        LinearLayout satCard = new LinearLayout(a);
        satCard.setOrientation(LinearLayout.VERTICAL);
        satCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 12), ThemePalette.dp(a, 14), ThemePalette.dp(a, 12));
        satCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        TextView satTitle = new TextView(a);
        satTitle.setText("Clave API de DeepSeek");
        satTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        satTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        satTitle.setTextColor(ThemePalette.ink(a));
        satCard.addView(satTitle);

        TextView satDesc = new TextView(a);
        satDesc.setText("Almacenada con cifrado por hardware (AndroidKeyStore AES-256-GCM) para modo satélite de contingencia.");
        satDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        satDesc.setTextColor(ThemePalette.inkDim(a));
        satDesc.setPadding(0, ThemePalette.dp(a, 2), 0, ThemePalette.dp(a, 8));
        satCard.addView(satDesc);

        String currentKey = KeyStoreVault.getDeepSeekApiKey(a);
        final EditText keyInput = UiKit.field(a, "sk-...", currentKey != null ? currentKey : "");
        keyInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        satCard.addView(keyInput);

        LinearLayout satBtnRow = new LinearLayout(a);
        satBtnRow.setOrientation(LinearLayout.HORIZONTAL);
        satBtnRow.setPadding(0, ThemePalette.dp(a, 8), 0, 0);

        Button btnSaveKey = UiKit.actionCompact(a, "Guardar Clave", true, () -> {
            String val = keyInput.getText().toString().trim();
            try {
                if (val.isEmpty()) {
                    KeyStoreVault.clearDeepSeekApiKey(a);
                    Toast.makeText(a, "Clave API eliminada del almacén seguro", Toast.LENGTH_SHORT).show();
                } else {
                    KeyStoreVault.saveDeepSeekApiKey(a, val);
                    Toast.makeText(a, "Clave cifrada y guardada en KeyStore", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Toast.makeText(a, "Error guardando en KeyStore: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
        satBtnRow.addView(btnSaveKey);

        if (currentKey != null && !currentKey.isEmpty()) {
            Button btnClearKey = UiKit.actionCompact(a, "Eliminar", false, () -> {
                KeyStoreVault.clearDeepSeekApiKey(a);
                keyInput.setText("");
                Toast.makeText(a, "Clave eliminada", Toast.LENGTH_SHORT).show();
            });
            LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            clp.leftMargin = ThemePalette.dp(a, 8);
            btnClearKey.setLayoutParams(clp);
            satBtnRow.addView(btnClearKey);
        }

        satCard.addView(satBtnRow);
        LinearLayout.LayoutParams scParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        scParams.bottomMargin = ThemePalette.dp(a, 14);
        satCard.setLayoutParams(scParams);

        return satCard;
    }

    static void dispatchSatelliteChunk(MainActivity a, String chunk) {
        if (a.webView == null) return;
        a.ui.post(() -> {
            try {
                String safe = org.json.JSONObject.quote(chunk);
                String js = "if (window.__DSH_SATELLITE_CHUNK__) { window.__DSH_SATELLITE_CHUNK__(" + safe + "); }" +
                        " else if (window.__DSH_SATELLITE_EVENT__) { window.__DSH_SATELLITE_EVENT__('chunk', " + safe + "); }";
                a.webView.evaluateJavascript(js, null);
            } catch (Throwable ignored) {}
        });
    }

    static void dispatchSatelliteComplete(MainActivity a, String fullText) {
        if (a.webView == null) return;
        a.ui.post(() -> {
            try {
                String safe = org.json.JSONObject.quote(fullText);
                String js = "if (window.__DSH_SATELLITE_COMPLETE__) { window.__DSH_SATELLITE_COMPLETE__(" + safe + "); }" +
                        " else if (window.__DSH_SATELLITE_EVENT__) { window.__DSH_SATELLITE_EVENT__('complete', " + safe + "); }";
                a.webView.evaluateJavascript(js, null);
            } catch (Throwable ignored) {}
        });
    }

    static void dispatchSatelliteError(MainActivity a, String error) {
        if (a.webView == null) return;
        a.ui.post(() -> {
            try {
                String safe = org.json.JSONObject.quote(error);
                String js = "if (window.__DSH_SATELLITE_ERROR__) { window.__DSH_SATELLITE_ERROR__(" + safe + "); }" +
                        " else if (window.__DSH_SATELLITE_EVENT__) { window.__DSH_SATELLITE_EVENT__('error', " + safe + "); }";
                a.webView.evaluateJavascript(js, null);
            } catch (Throwable ignored) {}
        });
    }
}
