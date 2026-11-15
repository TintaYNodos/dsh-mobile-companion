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
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import android.webkit.CookieManager;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Kill switch de emergencia: tarjeta, confirmacion y ejecucion.
 */
class KillSwitchUi {

    static LinearLayout buildCard(MainActivity a, AlertDialog[] settingsDialogRef) {
        LinearLayout killCard = new LinearLayout(a);
        killCard.setOrientation(LinearLayout.VERTICAL);
        killCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 12), ThemePalette.dp(a, 14), ThemePalette.dp(a, 12));
        killCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        TextView killTitle = new TextView(a);
        killTitle.setText("Kill Switch (Revocar accesos)");
        killTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        killTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        killTitle.setTextColor(Color.parseColor("#EF4444"));
        killCard.addView(killTitle);

        TextView killDesc = new TextView(a);
        killDesc.setText("Revoca de inmediato todos los dispositivos emparejados en la PC y cierra la sesión local.");
        killDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        killDesc.setTextColor(ThemePalette.inkDim(a));
        killDesc.setPadding(0, ThemePalette.dp(a, 2), 0, ThemePalette.dp(a, 10));
        killCard.addView(killDesc);

        Button btnKill = UiKit.actionCompact(a, "Activar Kill Switch", false, () -> {
            if (settingsDialogRef[0] != null) settingsDialogRef[0].dismiss();
            KillSwitchUi.confirmKillSwitch(a);
        });
        btnKill.setTextColor(Color.parseColor("#EF4444"));
        killCard.addView(btnKill);

        LinearLayout.LayoutParams kcParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        kcParams.bottomMargin = ThemePalette.dp(a, 14);
        killCard.setLayoutParams(kcParams);

        return killCard;
    }

    static void confirmKillSwitch(MainActivity a) {
        AlertDialog dialog = new AlertDialog.Builder(a)
                .setTitle("Kill Switch de Emergencia")
                .setMessage("¿Deseas revocar de inmediato todos los dispositivos autorizados en la computadora y cerrar la sesión?")
                .setPositiveButton("Revocar todo ahora", (d, w) -> KillSwitchUi.executeKillSwitch(a))
                .setNegativeButton("Cancelar", null)
                .create();
        UiKit.styleDialog(a, dialog);
        dialog.show();
        try {
            Button pos = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            if (pos != null) {
                pos.setTextColor(Color.parseColor("#EF4444"));
                pos.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            }
        } catch (Throwable ignored) {}
    }

    static void executeKillSwitch(MainActivity a) {
        a.vibrateHaptic("alert");
        String base = a.activeUrl != null ? a.activeUrl : PcRegistryStore.urlForSlot(a, 1);
        String target = base.replaceAll("/+$", "") + "/dsh-companion/kill-switch";

        // Aviso critico: aunque la app este abierta, el usuario debe ver que la
        // orden se autorizo y que esta en curso (y luego el resultado real).
        NotificationHelper.notifyCritical(a, "Kill switch autorizado", "Procediendo: revocando accesos y cerrando la sesión en la computadora…");

        new Thread(() -> {
            boolean revoked = false;
            String detail = "";
            try {
                URL u = new URL(target);
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                String cookie = CookieManager.getInstance().getCookie(target);
                if (cookie != null) conn.setRequestProperty("Cookie", cookie);
                PcEntry pc = PcRegistryStore.getActivePc(a);
                String key = (pc != null && pc.accessKey != null && !pc.accessKey.trim().isEmpty())
                        ? pc.accessKey.trim()
                        : MainActivity.getAccessKey(a);
                if (key != null && !key.trim().isEmpty()) {
                    String auth = "dsh:" + key;
                    String b64 = Base64.encodeToString(auth.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
                    conn.setRequestProperty("Authorization", "Basic " + b64);
                }
                int code = conn.getResponseCode();
                revoked = code >= 200 && code < 300;
                if (!revoked) detail = "HTTP " + code;
                conn.disconnect();
            } catch (Throwable error) {
                detail = error.getClass().getSimpleName();
            }

            final boolean confirmed = revoked;
            final String failure = detail;
            a.ui.post(() -> {
                // Solo se borran las cookies locales si el puente confirmó la
                // revocación: si el POST falló, borrarlas dejaría al usuario
                // fuera de su propia sesión sin haber revocado nada.
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();

                if (confirmed) {
                    NotificationHelper.notifyCritical(a, "Kill switch ejecutado",
                            "Accesos revocados y sesión cerrada en la computadora.");
                    Toast.makeText(a, "Kill Switch ejecutado: accesos revocados", Toast.LENGTH_LONG).show();
                } else {
                    NotificationHelper.notifyCritical(a, "Kill switch sin confirmar",
                            "La computadora no confirmó la revocación" + (failure.isEmpty() ? "" : " (" + failure + ")")
                                    + ". Revisa la conexión y reintenta en Ajustes.");
                    Toast.makeText(a,
                            "No se pudo confirmar la revocación en la computadora. Revisa la conexión y reintenta en Ajustes",
                            Toast.LENGTH_LONG).show();
                }
                if (a.webView != null) a.webView.loadUrl("about:blank");
                ConnectionController.boot(a);
            });
        }).start();
    }
}
