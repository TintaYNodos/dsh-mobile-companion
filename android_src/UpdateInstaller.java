/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Descarga e instalacion del APK propio y comprobacion de versiones.
 */
class UpdateInstaller {
    /** Consulta de releases y digests de GitHub (implementado en UpdateRelease). */
    static void checkGitHubReleases(MainActivity a) {
        UpdateRelease.checkGitHubReleases(a);
    }

    static void checkGitHubReleases(MainActivity a, boolean force) {
        UpdateRelease.checkGitHubReleases(a, force);
    }

    /**
     * P19/5.3.7: decide si el APK descargado puede instalarse. Si GitHub publica
     * un digest, debe coincidir; si el release no lo trae, se avisa y NO se
     * instala. La ruta web exige ancla y la rechaza si falta; solo la ruta
     * nativa del Hub conserva la instalación sin ancla de un búnker antiguo.
     */
    static void handleDigestDecision(MainActivity a, File targetFile, String decision,
                                     String expected, String actual) {
        if (a == null || targetFile == null) return;
        if (ApkDigest.DECISION_OK.equals(decision)) {
            Toast.makeText(a, "SHA-256 del APK verificado", Toast.LENGTH_SHORT).show();
            UpdateInstaller.installDownloadedApk(a, targetFile);
            return;
        }
        if (ApkDigest.DECISION_NO_ANCHOR.equals(decision)) {
            // Solo puede llegar por la ruta nativa del Hub: búnker antiguo que
            // aún no publica apkSha256. La ruta web nunca llega aquí (rechaza).
            android.util.Log.i("DshUpdate", "instalando APK del búnker sin ancla desde el Hub");
            UpdateInstaller.installDownloadedApk(a, targetFile);
            return;
        }
        // missing / mismatch: no se instala.
        try {
            if (targetFile.exists()) targetFile.delete();
        } catch (Throwable ignored) {}
        if (a.isFinishing()) {
            android.util.Log.w("DshUpdate", "APK no verificado y actividad cerrada: " + decision);
            return;
        }
        String title;
        String message;
        if (ApkDigest.DECISION_MISSING.equals(decision)) {
            title = "Sin verificación de integridad";
            message = "No hay un SHA-256 publicado con el que verificar el APK "
                    + "(ni el release de GitHub ni /dsh-companion/status lo publican). "
                    + "Por seguridad no se instalará. Actualiza la copia del puente o "
                    + "instálala manualmente desde el release que incluya el digest.";
        } else {
            title = "APK no verificado";
            message = "El SHA-256 del APK descargado no coincide con el ancla publicada "
                    + "(digest del release de GitHub o sha256 de /status). "
                    + "La descarga pudo alterarse o corromperse; no se instalará.\n\n"
                    + "Esperado: " + (expected == null ? "?" : expected) + "\n"
                    + "Obtenido: " + (actual == null || actual.isEmpty() ? "?" : actual);
        }
        AlertDialog dialog = new AlertDialog.Builder(a)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("Entendido", null)
                .create();
        UiKit.styleDialog(a, dialog);
        try {
            dialog.show();
        } catch (Throwable ignored) {
            android.util.Log.w("DshUpdate", "no se pudo mostrar el aviso de digest: " + decision);
        }
    }

    static boolean isVersionNewer(String remote, String local) {
        int[] remoteParts = versionParts(remote);
        int[] localParts = versionParts(local);
        // H-11: si cualquiera de las dos no es una versión numérica, no se
        // anuncia actualización (fail-closed). Antes se arrancaban los dígitos
        // con replaceAll y la basura podía parecer más nueva.
        if (remoteParts == null || localParts == null) return false;
        int max = Math.max(remoteParts.length, localParts.length);
        for (int i = 0; i < max; i++) {
            int r = i < remoteParts.length ? remoteParts[i] : 0;
            int l = i < localParts.length ? localParts[i] : 0;
            if (r != l) return r > l;
        }
        return false;
    }

    /**
     * Partes numéricas de una versión tipo `v5.2.10`, `5.2.10-rc1` o
     * `5.2.10+build7`.
     *
     * H-11: el sufijo de pre-release (`-rc1`, `-beta`, `-pre`, `-alpha`) y el de
     * build (`+build…`) se descartan ANTES de comparar; si no, `5.2.9-rc1` se
     * limpiaba a `5.2.91` y parecía más nueva que `5.2.9`. Devuelve null cuando
     * no queda una versión numérica válida (fail-closed: no se ofrece instalar).
     */
    static int[] versionParts(String raw) {
        if (raw == null) return null;
        String text = raw.trim().toLowerCase(Locale.ROOT);
        if (text.startsWith("v")) text = text.substring(1).trim();
        int cut = text.length();
        int plus = text.indexOf('+');
        if (plus >= 0) cut = plus;
        int dash = text.indexOf('-');
        if (dash >= 0 && dash < cut) cut = dash;
        text = text.substring(0, cut).trim();
        if (text.isEmpty()) return null;
        String[] pieces = text.split("\\.");
        int[] parts = new int[pieces.length];
        for (int i = 0; i < pieces.length; i++) {
            String piece = pieces[i].trim();
            if (piece.isEmpty() || !piece.matches("\\d+")) return null;
            try {
                parts[i] = Integer.parseInt(piece);
            } catch (NumberFormatException overflow) {
                return null;
            }
        }
        return parts;
    }

    /**
     * 5.3.7: ruta WEB (CompanionBridge.installUpdate y el DownloadListener del
     * WebView). Exige un ancla verificable: digest del release o SHA-256 que el
     * puente publica en /status; si no hay ninguna, se rechaza con aviso.
     */
    static void downloadAndInstallApk(MainActivity a) {
        UpdateInstaller.downloadAndInstallApk(a, null, null, null, "", ApkDigest.ROUTE_WEB);
    }

    /**
     * 5.3.7: ruta nativa (Hub y aviso propio de actualización). Es la única que
     * puede usar el SHA recordado de /status y la que conserva la instalación
     * sin ancla de un búnker antiguo, para no romper la actualización desde el Hub.
     */
    static void downloadAndInstallApkFromHub(MainActivity a) {
        UpdateInstaller.downloadAndInstallApk(a, null, null, null, "", ApkDigest.ROUTE_HUB);
    }

    /**
     * Variante con SHA-256 esperado (ruta nativa del Hub).
     */
    static void downloadAndInstallApk(MainActivity a, String customUrl, String customFilename, String titleText, String expectedSha) {
        downloadAndInstallApk(a, customUrl, customFilename, titleText, expectedSha, ApkDigest.ROUTE_HUB);
    }

    static void downloadAndInstallApk(MainActivity a, String customUrl, String customFilename, String titleText,
                                      String expectedSha, String route) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            if (!a.getPackageManager().canRequestPackageInstalls()) {
                // P19: recuerda la procedencia para que, al volver del permiso,
                // no se degrade una instalación de GitHub a la descarga del
                // búnker (que no tiene digest SHA-256 con el que verificar).
                a.prefs.edit()
                        .putString("pending_apk_url", customUrl == null ? "" : customUrl)
                        .putString("pending_apk_name", customFilename == null ? "" : customFilename)
                        .putString("pending_apk_title", titleText == null ? "" : titleText)
                        .putString("pending_apk_expected_sha", expectedSha == null ? "" : expectedSha.trim().toLowerCase(java.util.Locale.ROOT))
                        // 5.3.7: al reanudar tras conceder el permiso hay que
                        // conservar el origen para no degradar una descarga web
                        // a la ruta nativa (o al revés).
                        .putString("pending_apk_route", route)
                        .apply();
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

        // D1: el SHA-256 del buner llega como parametro (recien leido de /status)
        // o quedo en pending_apk_expected_sha para reanudar tras conceder el
        // permiso de instalacion. Se consume una sola vez: un SHA pendiente viejo
        // no debe bloquear reinstalaciones posteriores con un ancla ya caducada.
        String pendingSha = a.prefs.getString("pending_apk_expected_sha", "");
        if (pendingSha == null) pendingSha = "";
        if (!pendingSha.trim().isEmpty()) {
            a.prefs.edit().remove("pending_apk_expected_sha").apply();
        }
        final String bunkerSha = (expectedSha != null && !expectedSha.trim().isEmpty())
                ? expectedSha
                : pendingSha;

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
                // P19: el SHA-256 se calcula mientras se escribe, sin recargar
                // el APK completo en memoria.
                java.security.MessageDigest sha256 = java.security.MessageDigest.getInstance("SHA-256");
                try (java.io.InputStream input = conn.getInputStream();
                     java.io.OutputStream output = new java.io.FileOutputStream(targetFile)) {
                    byte[] data = new byte[4096];
                    long total = 0;
                    int count;
                    while ((count = input.read(data)) != -1) {
                        total += count;
                        sha256.update(data, 0, count);
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

                final String actualDigest = ApkDigest.hex(sha256.digest());
                // D1/5.3.7: expectedDigestFor() devuelve null para las URLs del
                // búnker (no hay ancla de GitHub); resolveExpected (antes se
                // llamaba a .isEmpty() sobre ese null y lanzaba NPE) usa el SHA
                // que publica el servidor.
                //
                // La ruta WEB exige ancla verificable: digest del release o SHA
                // de /status recordado por PcStatusPoller. Sin ninguna de las dos
                // resolveExpectedForRoute devuelve "" y la decisión es "missing"
                // (no se instala). El SHA pendiente de otra instalación no vale
                // como ancla web. La ruta nativa del Hub conserva el SHA
                // recordado y, sin ancla, el antiguo "no-anchor" (se instala).
                final String anchorSha = ApkDigest.isWebRoute(route)
                        ? a.prefs.getString("server_apk_sha256", "")
                        : bunkerSha;
                final String expectedDigest = ApkDigest.resolveExpectedForRoute(route,
                        UpdateRelease.expectedDigestFor(a, apkUrl), anchorSha);
                final String digestDecision = ApkDigest.decision(expectedDigest, actualDigest);

                a.ui.post(() -> {
                    progressDialog.dismiss();
                    UpdateInstaller.handleDigestDecision(a, targetFile, digestDecision,
                            expectedDigest, actualDigest);
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
