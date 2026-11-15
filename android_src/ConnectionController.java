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
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Maquina de estado de conexion, reintentos, sondeos y ciclo de vida.
 * Se extrajo de MainActivity sin cambiar la logica.
 */
class ConnectionController {
    static void recordHeartbeat(MainActivity a) {
        a.lastConnectedTime = System.currentTimeMillis();
        if (a.disconnectionAlerted) {
            a.disconnectionAlerted = false;
            NotificationHelper.cancelDisconnection(a);
        }
    }

    static boolean isNetworkMetered(MainActivity a) {
        try {
            ConnectivityManager cm = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                return cm.isActiveNetworkMetered();
            }
        } catch (Throwable ignored) {
        }
        return false;
    }

    static void disconnectionWatchdogTick(MainActivity a) {
        long now = System.currentTimeMillis();
        long elapsed = now - a.lastConnectedTime;
        if (a.state != STATE_ONLINE && elapsed >= DISCONNECTION_THRESHOLD_MS && !a.disconnectionAlerted) {
            a.disconnectionAlerted = true;
            long minutes = elapsed / (60 * 1000L);
            NotificationHelper.notifyDisconnection(a, minutes, PcRegistryStore.activeLabel(a));
        }
        a.ui.postDelayed(a.disconnectionWatchdog, 30_000L);
    }

    static void deviceCheckPollTick(MainActivity a) {
        if (a.state == STATE_ONLINE && !a.activeUrl.isEmpty()) {
            final String target = a.activeUrl;
            // Un solo hilo de sondeo, reutilizado: antes cada tick abria un
            // Thread nuevo y la app en segundo plano seguia sondeando.
            a.pollExecutor.execute(() -> PcStatusPoller.checkPendingDevices(a, target));
        }
        long interval = isNetworkMetered(a) ? 30_000L : 15_000L;
        a.ui.postDelayed(a.deviceCheckPoll, interval);
    }

    static void onResume(MainActivity a) {
        if (a.lastPausedAt > 0 && System.currentTimeMillis() - a.lastPausedAt > 120_000L) {
            // Mas de dos minutos fuera: se vuelve a pedir la verificacion.
            a.biometricUnlocked = false;
        }
        a.lastPausedAt = 0;
        BiometricGate.checkBiometricAuth(a);
        MainActivity.sIsAppVisible = true;
        if (a.webView != null) a.webView.onResume();
        a.ui.removeCallbacks(a.deviceCheckPoll);
        a.ui.postDelayed(a.deviceCheckPoll, 5_000L);
        if (a.state != STATE_ONLINE && !a.activeUrl.isEmpty() && !a.pageLoading) {
            a.attempts = 0;
            scheduleReconnect(a, 600);
        }
    }

    static void onPause(MainActivity a) {
        MainActivity.sIsAppVisible = false;
        a.lastPausedAt = System.currentTimeMillis();
        // En segundo plano no se reintenta ni se sondea: gastaria bateria y
        // radio sin usuario delante.
        a.ui.removeCallbacks(a.reconnectTick);
        a.ui.removeCallbacks(a.deviceCheckPoll);
        a.reconnecting = false;
        boolean keepSocket = a.prefs != null && a.prefs.getBoolean("keep_socket_active", false);
        if (!a.isGeneratingResponse && !keepSocket) {
            if (a.webView != null) a.webView.onPause();
        }
    }


    static void markOnline(MainActivity a) {
        a.state = STATE_ONLINE;
        a.attempts = 0;
        a.reconnecting = false;
        a.ui.removeCallbacks(a.reconnectTick);
        ConnectionController.recordHeartbeat(a);
        PillUi.paintDot(a, Color.parseColor("#10B981"));
        BannerUi.hideBanner(a);
        PillUi.updatePillDescription(a);
        PillUi.collapseSoon(a);
        if (a.prefs != null) {
            a.prefs.edit().putInt("connection_state", 0).apply();
        }
        CompanionWidget.updateAllWidgets(a);
        WebBridge.checkAndInjectOfflineOutbox(a);
    }

    static void markRetrying(MainActivity a) {
        a.state = STATE_RETRYING;
        WebBridge.captureDraftIfOffline(a);
        PillUi.paintDot(a, Color.parseColor("#F59E0B"));
        PillUi.updatePillDescription(a);
        if (a.prefs != null) {
            a.prefs.edit().putInt("connection_state", 1).apply();
        }
        CompanionWidget.updateAllWidgets(a);
    }

    static void markFailed(MainActivity a) {
        ConnectionController.markRetrying(a);
        String diagnosticMsg = ConnectionController.diagnoseConnectionFailure(a);
        BannerUi.showBanner(a, diagnosticMsg);
        ConnectionController.scheduleReconnect(a, 0);
    }

    static String diagnoseConnectionFailure(MainActivity a) {
        ConnectivityManager cm = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            Network net = cm.getActiveNetwork();
            if (net == null) return "Sin conexión a internet en el celular.";
            NetworkCapabilities cap = cm.getNetworkCapabilities(net);
            if (cap == null || !cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                return "Sin conexión a internet en el celular.";
            }
        }

        boolean hasVpnInterface = false;
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;
                String name = iface.getName().toLowerCase();
                if (name.contains("tun") || name.contains("zt") || name.contains("tailscale") || name.contains("vpn")) {
                    hasVpnInterface = true;
                    break;
                }
            }
        } catch (Throwable ignored) {}

        if (!hasVpnInterface) {
            return "Red privada inactiva en el teléfono. Abre ZeroTier o Tailscale.";
        }

        return "Computadora no responde. Revisa que la PC esté encendida y conectada a la VPN.";
    }

    static void scheduleReconnect(MainActivity a, long delayMs) {
        if (a.reconnecting || a.isFinishing() || a.webView == null) return;

        a.reconnecting = true;
        a.attempts += 1;
        long backoff = Math.max(delayMs, Math.min(BASE_BACKOFF_MS * a.attempts, MAX_BACKOFF_MS));
        long jitter = (long) (Math.random() * 400);
        a.ui.removeCallbacks(a.reconnectTick);
        a.ui.postDelayed(a.reconnectTick, backoff + jitter);
    }

    static void runReconnect(MainActivity a) {
        a.reconnecting = false;
        if (a.state == STATE_ONLINE || a.isFinishing() || a.webView == null) return;
        if (a.pageLoading) return;

        int slot = a.prefs.getInt(KEY_ACTIVE, 1);
        String saved = PcRegistryStore.urlForSlot(a, slot);
        if (saved != null && !saved.trim().isEmpty()) {
            a.activeUrl = saved.trim();
        }

        if (a.activeUrl.isEmpty()) {
            Discovery.discover(a, true);
            return;
        }

        ConnectionController.startLoad(a, a.activeUrl);
    }

    static void startLoad(MainActivity a, String url) {
        if (a.webView == null) return;
        a.pageLoading = true;
        a.mainFrameFailed = false;
        a.webView.loadUrl(url);
    }

    static void watchNetwork(MainActivity a) {
        try {
            ConnectivityManager manager = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return;

            a.networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    a.ui.post(() -> ConnectionController.resetAndReconnect(a));
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                    if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                        a.ui.post(() -> ConnectionController.resetAndReconnect(a));
                    }
                }
            };
            manager.registerDefaultNetworkCallback(a.networkCallback);
        } catch (Throwable ignored) {
        }
    }

    static void resetAndReconnect(MainActivity a) {
        if (a.state == STATE_ONLINE || a.pageLoading || a.isFinishing() || a.webView == null) return;
        a.attempts = 0;
        ConnectionController.scheduleReconnect(a, 300);
    }

    static void boot(MainActivity a) {
        PcEntry pc = PcRegistryStore.getActivePc(a);
        String url = pc != null ? pc.url : "";
        if (url == null || url.trim().isEmpty()) {
            url = a.prefs.getString(KEY_URL_1, "");
        }
        if (url == null || url.trim().isEmpty()) {
            BannerUi.showBanner(a, "Configura la dirección de la computadora");
            PcDialogs.openAddPcDialog(a);
            return;
        }
        ConnectionController.connectTo(a, url);
    }

    static void connectTo(MainActivity a, String url) {
        String normalized = UrlTools.normalizeUrl(url);
        if (normalized.isEmpty()) return;
        a.activeUrl = normalized;
        PillUi.refreshPillLabel(a);
        ConnectionController.markRetrying(a);
        ConnectionController.startLoad(a, normalized);
    }

    /**
     * El puente exige clave de acceso. Si el equipo respondió 401 y no hay clave
     * guardada, se abre el editor en lugar de dejar la pantalla en blanco.
     */
    static void promptAccessKey(MainActivity a) {
        if (a.isFinishing() || a.webView == null) return;
        BannerUi.showBanner(a, "Este equipo pide clave de acceso. Escríbela en la configuración.");
        a.ui.postDelayed(() -> PcDialogs.openAddressEditor(a), 350);
    }
}
