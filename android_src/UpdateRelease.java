/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Consulta de releases de GitHub y digests SHA-256 publicados para el APK.
 */
class UpdateRelease {

    static void checkGitHubReleases(MainActivity a) {
        // Se consulta como mucho una vez cada 6 horas: antes cada apertura del hub
        // gastaba datos y agotaba el límite de 60 peticiones por hora de GitHub.
        long lastCheck = a.prefs.getLong("github_checked_at", 0L);
        if (System.currentTimeMillis() - lastCheck < 6L * 60L * 60L * 1000L) return;

        new Thread(() -> {
            HttpURLConnection conn = null;
            boolean cacheCheck = true;
            try {
                URL url = new URL("https://api.github.com/repos/TintaYNodos/dsh-mobile-companion/releases?per_page=2");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(5000);
                conn.setRequestProperty("User-Agent", "DSH-Companion-Android");
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                // El campo "digest" de los assets se publica con la version de
                // API 2022-11-28; se pide explicitamente para P19.
                conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");

                if (conn.getResponseCode() == 200) {
                    java.io.InputStream is = conn.getInputStream();
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[1024];
                    int n;
                    while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
                    String json = baos.toString("UTF-8");
                    is.close();
                    // P19: si el release sirve un APK pero aun no publica su
                    // digest, no se estrangula la consulta: en el siguiente
                    // arranque se vuelve a pedir para poder verificar.

                    org.json.JSONArray releases = new org.json.JSONArray(json);
                    if (releases.length() > 0) {
                        org.json.JSONObject latest = releases.getJSONObject(0);
                        String latestTag = latest.optString("tag_name", "").replaceAll("^v", "");
                        String latestUrl = UpdateRelease.findApkAssetUrl(latest);
                        // P19: GitHub publica el SHA-256 del asset en "digest".
                        String latestDigest = UpdateRelease.findApkAssetDigest(latest);
                        if (!latestUrl.isEmpty() && latestDigest.isEmpty()) cacheCheck = false;

                        a.prefs.edit()
                                .putString("github_latest_version", latestTag)
                                .putString("github_latest_url", latestUrl)
                                .putString("github_latest_digest", latestDigest)
                                .apply();

                        if (releases.length() > 1) {
                            org.json.JSONObject prev = releases.getJSONObject(1);
                            String prevTag = prev.optString("tag_name", "").replaceAll("^v", "");
                            String prevUrl = UpdateRelease.findApkAssetUrl(prev);
                            String prevDigest = UpdateRelease.findApkAssetDigest(prev);

                            a.prefs.edit()
                                    .putString("github_previous_version", prevTag)
                                    .putString("github_previous_url", prevUrl)
                                    .putString("github_previous_digest", prevDigest)
                                    .apply();
                        }
                    }
                    if (cacheCheck) {
                        a.prefs.edit()
                                .putLong("github_checked_at", System.currentTimeMillis())
                                .apply();
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

    /**
     * P19: digest SHA-256 que GitHub publica para el mismo asset elegido por
     * findApkAssetUrl. Devuelve "" si el release no lo publica.
     */
    static String findApkAssetDigest(org.json.JSONObject release) {
        if (release == null || !release.has("assets")) return "";
        try {
            org.json.JSONArray assets = release.getJSONArray("assets");
            for (int i = 0; i < assets.length(); i++) {
                org.json.JSONObject asset = assets.getJSONObject(i);
                String name = asset.optString("name", "");
                if (name.endsWith(".apk")) {
                    return ApkDigest.normalize(asset.optString("digest", ""));
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    /** Digest esperado según el origen de la descarga (null = sin ancla). */
    static String expectedDigestFor(MainActivity a, String downloadUrl) {
        if (a == null || a.prefs == null) return null;
        return ApkDigest.pickExpected(
                downloadUrl,
                a.prefs.getString("github_latest_url", ""),
                a.prefs.getString("github_latest_digest", ""),
                a.prefs.getString("github_previous_url", ""),
                a.prefs.getString("github_previous_digest", ""));
    }
}
