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


import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Sondeo periodico del puente: versiones, telemetria y equipos pendientes.
 */
class PcStatusPoller {

    static void checkPendingDevices(MainActivity a, String baseUrl) {
        HttpURLConnection conn = null;
        try {
            String statusUrl = baseUrl.replaceAll("/+$", "") + "/dsh-companion/status";
            URL url = new URL(statusUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            conn.setRequestMethod("GET");
            conn.setUseCaches(false);
            String cookie = android.webkit.CookieManager.getInstance().getCookie(statusUrl);
            if (cookie != null) conn.setRequestProperty("Cookie", cookie);

            int respCode = conn.getResponseCode();
            String setCookie = conn.getHeaderField("Set-Cookie");
            if (setCookie != null && !setCookie.isEmpty()) {
                android.webkit.CookieManager.getInstance().setCookie(statusUrl, setCookie);
                android.webkit.CookieManager.getInstance().flush();
            }

            if (respCode == 200) {
                java.io.InputStream is = conn.getInputStream();
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[1024];
                int n;
                while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
                String json = baos.toString("UTF-8");
                is.close();

                org.json.JSONObject obj = new org.json.JSONObject(json);

                String serverVer = obj.optString("apkVersion", obj.optString("version", ""));
                int serverCode = obj.optInt("apkVersionCode", 0);
                String prevVer = obj.optString("previousApkVersion", "");
                int prevCode = obj.optInt("previousApkVersionCode", 0);
                String serverSha = obj.optString("apkSha256", "");
                a.prefs.edit().putLong("last_pc_ok", System.currentTimeMillis()).apply();
                if (serverCode > 0) {
                    a.prefs.edit()
                            .putString("server_apk_version", serverVer)
                            .putInt("server_apk_code", serverCode)
                            .putString("server_apk_sha256", serverSha)
                            .putString("server_prev_apk_version", prevVer)
                            .putInt("server_prev_apk_code", prevCode)
                            .apply();

                    int installedCode = UpdateInstaller.getInstalledVersionCode(a);
                    if (serverCode > installedCode) {
                        long lastNotif = a.prefs.getLong("last_update_notif_time", 0);
                        long now = System.currentTimeMillis();
                        if (now - lastNotif > 4 * 3600 * 1000) {
                            a.prefs.edit().putLong("last_update_notif_time", now).apply();
                            final String finalVer = serverVer;
                            a.ui.post(() -> NotificationHelper.notifyAppUpdateAvailable(a, finalVer));
                        }
                    }
                }

                if (obj.has("systemStats") && !obj.isNull("systemStats")) {
                    org.json.JSONObject stats = obj.optJSONObject("systemStats");
                    if (stats != null) {
                        org.json.JSONObject cpu = stats.optJSONObject("cpu");
                        org.json.JSONObject ram = stats.optJSONObject("ram");
                        org.json.JSONObject disk = stats.optJSONObject("disk");

                        int cpuPercent = cpu != null ? cpu.optInt("usagePercent", 0) : 0;
                        int tempC = cpu != null ? cpu.optInt("tempC", 0) : 0;
                        String cpuModel = cpu != null ? cpu.optString("model", "AMD Ryzen / x86_64") : "CPU";
                        int cpuCores = cpu != null ? cpu.optInt("cores", 16) : 0;
                        double ramUsed = ram != null ? ram.optDouble("usedGb", 0) : 0;
                        double ramTotal = ram != null ? ram.optDouble("totalGb", 0) : 0;
                        int ramPercent = ram != null ? ram.optInt("percent", 0) : 0;
                        double diskFree = disk != null ? disk.optDouble("freeGb", 0) : 0;
                        double diskUsed = disk != null ? disk.optDouble("usedGb", 0) : 0;
                        double diskTotal = disk != null ? disk.optDouble("totalGb", 0) : 0;
                        int diskPercent = disk != null ? disk.optInt("percent", 0) : 0;
                        String uptime = stats.optString("uptime", "");

                        // Integración de estado de batería si viene en el JSON
                        org.json.JSONObject bat = stats.optJSONObject("battery");
                        if (bat == null && obj.has("battery")) {
                            bat = obj.optJSONObject("battery");
                        }
                        int batLevel = -1;
                        boolean batAc = false;
                        String batStatus = "";
                        if (bat != null) {
                            batLevel = bat.optInt("percent", bat.optInt("level", -1));
                            batAc = bat.optBoolean("charging", bat.optBoolean("ac", bat.optBoolean("isCharging", false)));
                            batStatus = bat.optString("status", batAc ? "Enchufado (AC)" : "En batería");
                        } else if (stats.has("batteryPercent")) {
                            batLevel = stats.optInt("batteryPercent", -1);
                            batAc = stats.optBoolean("batteryAc", false);
                            batStatus = batAc ? "Enchufado (AC)" : "En batería";
                        }

                        a.prefs.edit()
                                .putInt("stat_cpu_percent", cpuPercent)
                                .putInt("stat_cpu_temp", tempC)
                                .putString("stat_cpu_model", cpuModel)
                                .putInt("stat_cpu_cores", cpuCores)
                                .putFloat("stat_ram_used", (float) ramUsed)
                                .putFloat("stat_ram_total", (float) ramTotal)
                                .putInt("stat_ram_percent", ramPercent)
                                .putFloat("stat_disk_free", (float) diskFree)
                                .putFloat("stat_disk_used", (float) diskUsed)
                                .putFloat("stat_disk_total", (float) diskTotal)
                                .putInt("stat_disk_percent", diskPercent)
                                .putString("stat_uptime", uptime)
                                .putInt("stat_battery_level", batLevel)
                                .putBoolean("stat_battery_ac", batAc)
                                .putString("stat_battery_status", batStatus)
                                .apply();

                        TelemetryStore.recordTelemetryPoint(cpuPercent, tempC, ramPercent);
                        CompanionWidget.updateAllWidgets(a);
                    }
                }

                if (obj.has("pendingList")) {
                    org.json.JSONArray list = obj.getJSONArray("pendingList");
                    for (int i = 0; i < list.length(); i++) {
                        org.json.JSONObject dev = list.getJSONObject(i);
                        String devId = dev.optString("id");
                        String devCode = dev.optString("code");
                        String devAgent = dev.optString("agent");
                        String devAddress = dev.optString("address");
                        a.ui.post(() -> {
                            NotificationHelper.notifyDevicePairing(a, devId, devCode, devAgent, devAddress, baseUrl);
                        });
                    }
                }
            }
        } catch (Throwable ignored) {
            // Puente inalcanzable (sin tunel): se marca para forzar la consulta a GitHub.
            a.prefs.edit().putLong("last_pc_ok", 0L).apply();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
