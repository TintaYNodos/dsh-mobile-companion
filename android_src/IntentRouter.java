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

import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Acciones de entrada: texto compartido, atajos dinamicos y short cuts.
 */
class IntentRouter {
    static void handleIncomingIntent(MainActivity a, Intent intent) {
        if (intent == null) return;

        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (shared != null && shared.length() > 0) {
                if (a.state != STATE_ONLINE) {
                    WebBridge.saveOfflineDraft(a, shared.toString());
                } else {
                    a.pendingSharedText = shared.toString();
                    WebBridge.injectSharedTextIfReady(a);
                }
            }
            return;
        }

        if (intent.hasExtra("shortcut_action")) {
            // P18: MainActivity es exportada; un intent de otra app con
            // shortcut_action no debe abrir diálogos internos. Los atajos y el
            // widget firman el extra con el token privado de la instalación.
            if (!IntentGuard.isTrusted(a, intent)) {
                android.util.Log.w("DshIntent", "shortcut_action ignorado: intent sin firma de la app");
                return;
            }
            String scAction = intent.getStringExtra("shortcut_action");
            if ("new_chat".equals(scAction)) {
                a.ui.postDelayed(() -> {
                    if (a.webView != null) {
                        a.webView.evaluateJavascript("var btn = document.querySelector('button[aria-label*=\"New\" i], button[aria-label*=\"Nuevo\" i], [class*=\"newChat\" i]'); if (btn) btn.click();", null);
                    }
                }, 800);
            } else if ("telemetry".equals(scAction)) {
                a.ui.postDelayed(() -> HubSheet.openHub(a), 300);
            } else if ("network".equals(scAction)) {
                a.ui.postDelayed(() -> PcDialogs.openAddressEditor(a), 300);
            }
        }
    }

    static void setupDynamicShortcuts(MainActivity a) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return;
        try {
            ShortcutManager sm = a.getSystemService(ShortcutManager.class);
            if (sm == null) return;

            Intent newChatIntent = new Intent(a, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("shortcut_action", "new_chat");
            IntentGuard.sign(a, newChatIntent);

            Intent telemetryIntent = new Intent(a, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("shortcut_action", "telemetry");
            IntentGuard.sign(a, telemetryIntent);

            Intent networkIntent = new Intent(a, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("shortcut_action", "network");
            IntentGuard.sign(a, networkIntent);

            ShortcutInfo sc1 = new ShortcutInfo.Builder(a, "sc_new_chat")
                    .setShortLabel("Nuevo chat")
                    .setLongLabel("Nuevo chat en Harness")
                    .setIcon(Icon.createWithResource(a, R.mipmap.ic_launcher))
                    .setIntent(newChatIntent)
                    .build();

            ShortcutInfo sc2 = new ShortcutInfo.Builder(a, "sc_telemetry")
                    .setShortLabel("Telemetría PC")
                    .setLongLabel("Monitoreo de hardware")
                    .setIcon(Icon.createWithResource(a, R.mipmap.ic_launcher))
                    .setIntent(telemetryIntent)
                    .build();

            ShortcutInfo sc3 = new ShortcutInfo.Builder(a, "sc_network")
                    .setShortLabel("Estado de red")
                    .setLongLabel("Diagnóstico y rutas")
                    .setIcon(Icon.createWithResource(a, R.mipmap.ic_launcher))
                    .setIntent(networkIntent)
                    .build();

            List<ShortcutInfo> list = new ArrayList<>();
            list.add(sc1);
            list.add(sc2);
            list.add(sc3);
            sm.setDynamicShortcuts(list);
        } catch (Throwable ignored) {}
    }
}
