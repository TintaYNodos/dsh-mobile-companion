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
        killTitle.setTextColor(ThemePalette.danger(a));
        killCard.addView(killTitle);

        TextView killDesc = new TextView(a);
        killDesc.setText("Revoca los dispositivos de ESTA computadora (las demás PCs no se tocan) y, solo si esta computadora confirma la revocación, cierra la sesión local y borra la copia sin conexión del chat.");
        killDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        killDesc.setTextColor(ThemePalette.inkDim(a));
        killDesc.setPadding(0, ThemePalette.dp(a, 2), 0, ThemePalette.dp(a, 10));
        killCard.addView(killDesc);

        Button btnKill = UiKit.actionCompact(a, "Activar Kill Switch", false, () -> {
            if (settingsDialogRef[0] != null) settingsDialogRef[0].dismiss();
            KillSwitchUi.confirmKillSwitch(a);
        });
        btnKill.setTextColor(ThemePalette.danger(a));
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
                .setMessage("¿Revocar los dispositivos autorizados de ESTA computadora? Las demás PCs no se tocan. Si esta computadora confirma la revocación, se cerrará la sesión local y se borrará la copia sin conexión del chat.")
                .setPositiveButton("Revocar esta PC", (d, w) -> KillSwitchUi.executeKillSwitch(a))
                .setNegativeButton("Cancelar", null)
                .create();
        UiKit.styleDialog(a, dialog);
        dialog.show();
        try {
            Button pos = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            if (pos != null) {
                pos.setTextColor(ThemePalette.danger(a));
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
        NotificationHelper.notifyCritical(a, "Kill switch autorizado", "Procediendo: revocando los accesos de esta PC y cerrando su sesión en la computadora…");

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
                if (confirmed) {
                    // 5.4.0: la copia sin conexión (cifrada, privada) se borra
                    // SOLO con el 2xx confirmado, igual que la sesión local: si
                    // el POST falló no se toca nada en el teléfono. Antes se
                    // borraba antes de la petición y el texto prometía lo
                    // contrario ("solo si la computadora confirma").
                    OfflineChatStore.clear(a);
                    // D3: el cierre de sesión local solo ocurre con la revocación
                    // confirmada. Si el POST falló no se borran cookies ni se
                    // recarga la sesión: el usuario se quedaría fuera de su
                    // propia sesión sin haber revocado nada en la computadora.
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                    if (a.webView != null) a.webView.loadUrl("about:blank");
                    ConnectionController.boot(a);
                    NotificationHelper.notifyCritical(a, "Kill switch ejecutado",
                            "Accesos de esta PC revocados; sesión local cerrada y copia sin conexión borrada.");
                    Toast.makeText(a, "Kill Switch ejecutado: accesos de esta PC revocados", Toast.LENGTH_LONG).show();
                } else {
                    // Sin confirmación no se toca la sesión local ni la copia
                    // offline: se conserva el acceso que el usuario ya tenía y
                    // se avisa del fallo.
                    NotificationHelper.notifyCritical(a, "Kill switch sin confirmar",
                            "La computadora no confirmó la revocación" + (failure.isEmpty() ? "" : " (" + failure + ")")
                                    + ". No se cerró la sesión local ni se borró la copia sin conexión; revisa la conexión y reintenta en Ajustes.");
                    Toast.makeText(a,
                            "No se pudo confirmar la revocación en la computadora. No se cerró la sesión local ni se borró la copia sin conexión; revisa la conexión y reintenta en Ajustes",
                            Toast.LENGTH_LONG).show();
                }
            });
        }).start();
    }
}
