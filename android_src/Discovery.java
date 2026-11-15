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
 * Descubrimiento de bunkers en la red privada (sondeo paralelo).
 */
class Discovery {
    static void discover(MainActivity a, boolean silent) {
        ConnectionController.markRetrying(a);
        if (!silent) BannerUi.showBanner(a, "Buscando computadoras en la red privada...");

        a.scanCancelled.set(true);
        if (a.scanFuture != null) a.scanFuture.cancel(true);
        a.scanCancelled.set(false);

        a.scanFuture = a.scanExecutor.submit(() -> {
            List<String> found = Discovery.probeCandidates(Discovery.candidates(a), a.scanCancelled);
            a.ui.post(() -> Discovery.onDiscoveryFinished(a, found));
        });
    }

    static void onDiscoveryFinished(MainActivity a, List<String> found) {
        if (a.isFinishing() || a.isDestroyed() || a.webView == null || found == null) return;

        if (found.isEmpty()) {
            BannerUi.showBanner(a, "No se encontró ninguna computadora activa.");
            HubSheet.openHub(a);
            return;
        }

        SharedPreferences.Editor editor = a.prefs.edit();
        if (PcRegistryStore.urlForSlot(a, 1).trim().isEmpty()) {
            editor.putString(KEY_URL_1, found.get(0));
            editor.putString(KEY_NAME_1, UrlTools.describe("Bunker 1", found.get(0)));
        }
        if (found.size() > 1 && PcRegistryStore.urlForSlot(a, 2).trim().isEmpty()) {
            editor.putString(KEY_URL_2, found.get(1));
            editor.putString(KEY_NAME_2, UrlTools.describe("Bunker 2", found.get(1)));
        }
        if (PcRegistryStore.urlForSlot(a, a.prefs.getInt(KEY_ACTIVE, 1)).trim().isEmpty()) editor.putInt(KEY_ACTIVE, 1);
        editor.apply();

        BannerUi.hideBanner(a);
        ConnectionController.connectTo(a, found.get(0));
        Toast.makeText(a, "Conectado a " + found.get(0), Toast.LENGTH_SHORT).show();
    }

    static Set<String> candidates(MainActivity a) {
        Set<String> hosts = new LinkedHashSet<>();

        Discovery.addHost(hosts, PcRegistryStore.urlForSlot(a, 1));
        Discovery.addHost(hosts, PcRegistryStore.urlForSlot(a, 2));

        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    String host = addresses.nextElement().getHostAddress();
                    if (host == null || host.indexOf(':') >= 0) continue;
                    String[] parts = host.split("\\.");
                    if (parts.length != 4) continue;
                    if (host.startsWith("127.") || host.startsWith("169.254.")) continue;

                    String prefix = parts[0] + "." + parts[1] + "." + parts[2] + ".";
                    for (int last = 1; last <= 254; last++) {
                        hosts.add(prefix + last);
                    }
                }
            }
        } catch (Exception ignored) {
        }

        hosts.add("127.0.0.1");
        return hosts;
    }

    static List<String> probeCandidates(Set<String> hosts, AtomicBoolean cancelled) {
        List<String> found = new ArrayList<>();
        ExecutorService pool = Executors.newFixedThreadPool(32);
        ExecutorCompletionService<String> completion = new ExecutorCompletionService<>(pool);

        for (final String host : hosts) {
            completion.submit(() ->
                    Discovery.probe("http://" + host + ":" + PORT + "/dsh-companion/status") ? host : null);
        }

        for (int index = 0; index < hosts.size(); index++) {
            if (cancelled != null && cancelled.get()) break;
            try {
                Future<String> result = completion.poll(700, TimeUnit.MILLISECONDS);
                if (result == null) continue;
                String host = result.get();
                if (host != null && !found.contains("http://" + host + ":" + PORT)) {
                    found.add("http://" + host + ":" + PORT);
                    if (found.size() >= 2) break;
                }
            } catch (Exception ignored) {
            }
        }

        pool.shutdownNow();
        return cancelled != null && cancelled.get() ? java.util.Collections.emptyList() : found;
    }

    static void addHost(Set<String> hosts, String url) {
        if (url == null || url.trim().isEmpty()) return;
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && !host.isEmpty()) hosts.add(host);
        } catch (Exception ignored) {
        }
    }

    private static final String COMPANION_SERVICE = "dsh-companion";

    static boolean probe(String statusUrl) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(statusUrl).openConnection();
            connection.setConnectTimeout(450);
            connection.setReadTimeout(450);
            connection.setRequestMethod("GET");
            connection.setUseCaches(false);

            // El sondeo recorre la red privada completa: no lleva credenciales.
            // Mandar aquí la clave de acceso la difundía a cada host probado
            // (red compartida, hotel, cafetería) sin ninguna necesidad.

            int code = connection.getResponseCode();

            // P5: cualquier host que devolviera 200 se auto-conectaba. Se exige
            // que el JSON se identifique como el puente antes de aceptarlo.
            boolean looksLikeCompanion = false;
            if (code == 200) {
                try (java.io.InputStream is = connection.getInputStream()) {
                    java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
                    byte[] chunk = new byte[1024];
                    int read;
                    int total = 0;
                    while ((read = is.read(chunk)) != -1 && total < 8192) {
                        buffer.write(chunk, 0, read);
                        total += read;
                    }
                    String body = buffer.toString("UTF-8");
                    looksLikeCompanion = body.contains("\"" + COMPANION_SERVICE + "\"");
                } catch (Exception ignored) {
                }
            }

            // El puente empareja la primera vez: guarda la credencial en el mismo
            // almacen de cookies que usa el WebView para no volver a pedir nada.
            String setCookie = connection.getHeaderField("Set-Cookie");
            if (setCookie != null && !setCookie.isEmpty()) {
                try {
                    android.webkit.CookieManager.getInstance().setCookie(statusUrl, setCookie);
                } catch (Throwable ignored) {
                }
            }

            return looksLikeCompanion;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
