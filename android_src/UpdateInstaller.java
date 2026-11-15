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
import android.provider.Settings;
import android.webkit.CookieManager;
import java.io.File;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Descarga e instalacion del APK propio y comprobacion de versiones.
 */
class UpdateInstaller {
    static void checkGitHubReleases(MainActivity a) {
        // Se consulta como mucho una vez cada 6 horas: antes cada apertura del hub
        // gastaba datos y agotaba el límite de 60 peticiones por hora de GitHub.
        long lastCheck = a.prefs.getLong("github_checked_at", 0L);
        if (System.currentTimeMillis() - lastCheck < 6L * 60L * 60L * 1000L) return;

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://api.github.com/repos/TintaYNodos/dsh-mobile-companion/releases?per_page=2");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(5000);
                conn.setRequestProperty("User-Agent", "DSH-Companion-Android");
                conn.setRequestProperty("Accept", "application/vnd.github.v3+json");

                if (conn.getResponseCode() == 200) {
                    java.io.InputStream is = conn.getInputStream();
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[1024];
                    int n;
                    while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
                    String json = baos.toString("UTF-8");
                    is.close();
                    a.prefs.edit().putLong("github_checked_at", System.currentTimeMillis()).apply();

                    org.json.JSONArray releases = new org.json.JSONArray(json);
                    if (releases.length() > 0) {
                        org.json.JSONObject latest = releases.getJSONObject(0);
                        String latestTag = latest.optString("tag_name", "").replaceAll("^v", "");
                        String latestUrl = UpdateInstaller.findApkAssetUrl(latest);

                        a.prefs.edit()
                                .putString("github_latest_version", latestTag)
                                .putString("github_latest_url", latestUrl)
                                .apply();

                        if (releases.length() > 1) {
                            org.json.JSONObject prev = releases.getJSONObject(1);
                            String prevTag = prev.optString("tag_name", "").replaceAll("^v", "");
                            String prevUrl = UpdateInstaller.findApkAssetUrl(prev);

                            a.prefs.edit()
                                    .putString("github_previous_version", prevTag)
                                    .putString("github_previous_url", prevUrl)
                                    .apply();
                        }
                    }
                }
            } catch (Throwable ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    static String findApkAssetUrl(org.json.JSONObject release) {
        if (!release.has("assets")) return "";
        try {
            org.json.JSONArray assets = release.getJSONArray("assets");
            for (int i = 0; i < assets.length(); i++) {
                org.json.JSONObject asset = assets.getJSONObject(i);
                String name = asset.optString("name", "");
                if (name.endsWith(".apk")) {
                    return asset.optString("browser_download_url", "");
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    static boolean isVersionNewer(String remote, String local) {
        if (remote == null || remote.trim().isEmpty()) return false;
        try {
            String[] rParts = remote.replaceAll("[^0-9.]", "").split("\\.");
            String[] lParts = local.replaceAll("[^0-9.]", "").split("\\.");
            int max = Math.max(rParts.length, lParts.length);
            for (int i = 0; i < max; i++) {
                int r = i < rParts.length ? Integer.parseInt(rParts[i]) : 0;
                int l = i < lParts.length ? Integer.parseInt(lParts[i]) : 0;
                if (r > l) return true;
                if (r < l) return false;
            }
        } catch (Exception ignored) {}
        return false;
    }

    static void downloadAndInstallApk(MainActivity a) {
        UpdateInstaller.downloadAndInstallApk(a, null, null, null);
    }

    static void downloadAndInstallApk(MainActivity a, String customUrl, String customFilename, String titleText) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            if (!a.getPackageManager().canRequestPackageInstalls()) {
                Toast.makeText(a, "Permite a DSH Companion instalar actualizaciones", Toast.LENGTH_LONG).show();
                try {
                    Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()));
                    a.startActivityForResult(permIntent, REQUEST_INSTALL_PERMISSION);
                } catch (Throwable t) {
                    try {
                        Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        a.startActivityForResult(permIntent, REQUEST_INSTALL_PERMISSION);
                    } catch (Throwable ignored) {}
                }
                return;
            }
        }

        String base = a.activeUrl.isEmpty() ? "http://" + a.prefs.getString(KEY_URL_1, "") : a.activeUrl;
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        final String apkUrl = (customUrl != null && !customUrl.isEmpty())
                ? customUrl
                : base.replaceAll("/+$", "") + "/DSH-Companion.apk";
        final String rawName = (customFilename != null && !customFilename.isEmpty())
                ? customFilename
                : "DSH-Companion.apk";
        // Solo el nombre base: un "filename=../../x.apk" en la cabecera escribía
        // fuera del directorio de caché.
        String safeName = new File(rawName).getName();
        if (safeName.isEmpty() || safeName.contains("..")) safeName = "DSH-Companion.apk";
        final String fileName = safeName;

        final AlertDialog progressDialog = new AlertDialog.Builder(a).create();
        progressDialog.setCancelable(false);
        progressDialog.setCanceledOnTouchOutside(false);

        LinearLayout layout = new LinearLayout(a);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(ThemePalette.dp(a, 20), ThemePalette.dp(a, 18), ThemePalette.dp(a, 20), ThemePalette.dp(a, 18));
        layout.setBackground(ThemePalette.rounded(a, ThemePalette.surface(a), ThemePalette.outline(a), 12f));

        TextView txtTitle = new TextView(a);
        txtTitle.setText(titleText != null ? titleText : "Actualización de binario");
        txtTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
        txtTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        txtTitle.setTextColor(ThemePalette.ink(a));
        layout.addView(txtTitle);

        final TextView txtStatus = new TextView(a);
        txtStatus.setText("Descargando " + fileName + "...");
        txtStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        txtStatus.setTextColor(ThemePalette.inkDim(a));
        txtStatus.setPadding(0, ThemePalette.dp(a, 4), 0, ThemePalette.dp(a, 12));
        layout.addView(txtStatus);

        final ProgressBar pBar = new ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal);
        pBar.setMax(100);
        pBar.setProgress(0);
        pBar.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ThemePalette.dp(a, 6)));
        layout.addView(pBar);

        progressDialog.setView(layout, 0, 0, 0, 0);
        progressDialog.setOnShowListener(d -> {
            Window window = progressDialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            }
        });
        progressDialog.show();

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String downloadUrl = apkUrl;
                URL url = new URL(downloadUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(20000);
                conn.setInstanceFollowRedirects(true);
                if (!downloadUrl.contains("github.com") && !downloadUrl.contains("githubusercontent.com")) {
                    String cookie = android.webkit.CookieManager.getInstance().getCookie(downloadUrl);
                    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
                }

                int respCode = conn.getResponseCode();
                if (respCode == HttpURLConnection.HTTP_MOVED_PERM || respCode == HttpURLConnection.HTTP_MOVED_TEMP || respCode == 307 || respCode == 308) {
                    String redirectUrl = conn.getHeaderField("Location");
                    if (redirectUrl != null && !redirectUrl.isEmpty()) {
                        conn.disconnect();
                        url = new URL(redirectUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(10000);
                        conn.setReadTimeout(20000);
                    }
                }

                int fileLength = conn.getContentLength();

                File cacheDir = a.getExternalCacheDir();
                if (cacheDir == null) cacheDir = a.getCacheDir();
                File targetFile = new File(cacheDir, fileName);

                // Cierre garantizado: si read() falla a mitad, los descriptores se
                // escapaban y tras varios intentos aparecía "Too many open files".
                try (java.io.InputStream input = conn.getInputStream();
                     java.io.OutputStream output = new java.io.FileOutputStream(targetFile)) {
                    byte[] data = new byte[4096];
                    long total = 0;
                    int count;
                    while ((count = input.read(data)) != -1) {
                        total += count;
                        if (fileLength > 0) {
                            final int percent = (int) (total * 100 / fileLength);
                            final long kb = total / 1024;
                            a.ui.post(() -> {
                                pBar.setProgress(percent);
                                txtStatus.setText("Descargando: " + percent + "% (" + kb + " KB)");
                            });
                        }
                        output.write(data, 0, count);
                    }
                    output.flush();
                }

                a.ui.post(() -> {
                    progressDialog.dismiss();
                    UpdateInstaller.installDownloadedApk(a, targetFile);
                });
            } catch (Exception e) {
                a.ui.post(() -> {
                    progressDialog.dismiss();
                    Toast.makeText(a, "Error al descargar: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    static void installDownloadedApk(MainActivity a, File apkFile) {
        if (apkFile == null || !apkFile.exists()) return;
        try {
            Uri contentUri = ApkFileProvider.getUriForApk(apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            a.startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(a, "No se pudo abrir el instalador: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    static String getInstalledVersionName(MainActivity a) {
        try {
            return a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "3.9.2";
        }
    }

    static int getInstalledVersionCode(MainActivity a) {
        try {
            return a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return 13;
        }
    }
}
