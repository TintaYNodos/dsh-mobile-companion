/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * P19: verificación SHA-256 del APK antes de instalar.
 *
 * GitHub publica en cada asset del release un campo `digest` con formato
 * "sha256:<hex>". Antes de lanzar el instalador se compara el SHA-256 real del
 * archivo descargado con ese valor:
 *
 *  - Descarga desde un asset de GitHub: el digest es obligatorio. Si el release
 *    no lo publica se avisa y NO se instala.
 *  - Descarga desde el búnker (/DSH-Companion.apk, que sirve el APK recién
 *    compilado del proyecto): el ancla es el SHA-256 que el puente publica en
 *    /status (apkSha256).
 *  - 5.3.7: la ruta WEB (CompanionBridge.installUpdate y el DownloadListener del
 *    WebView) EXIGE un ancla verificable y rechaza la instalación si no la hay;
 *    solo la ruta nativa del Hub conserva el antiguo "sin ancla se instala".
 *
 * Esta clase es Java puro (sin android.*) para poder probarla en el escritorio.
 */
final class ApkDigest {

    static final String DECISION_OK = "ok";
    static final String DECISION_MISSING = "missing";
    static final String DECISION_MISMATCH = "mismatch";
    static final String DECISION_NO_ANCHOR = "no-anchor";

    /** Origen de una instalación: página web del WebView o UI nativa (Hub). */
    static final String ROUTE_WEB = "web";
    static final String ROUTE_HUB = "hub";

    static boolean isWebRoute(String route) {
        return ApkDigest.ROUTE_WEB.equals(route);
    }

    private ApkDigest() {}

    /** "sha256:ABCD..." / "ABCD..." -> hex en minúsculas; "" si no es válido. */
    static String normalize(String raw) {
        if (raw == null) return "";
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if (value.startsWith("sha256:")) value = value.substring("sha256:".length()).trim();
        if (value.length() != 64) return "";
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
            if (!hex) return "";
        }
        return value;
    }

    /** SHA-256 en hexadecimal minúsculas. */
    static String hex(byte[] digest) {
        if (digest == null) return "";
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    /** SHA-256 de un flujo, leyéndolo por bloques (no carga el APK en memoria). */
    static String sha256Hex(InputStream input) throws java.io.IOException {
        if (input == null) return "";
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (java.security.NoSuchAlgorithmException missing) {
            return "";
        }
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            digest.update(buffer, 0, read);
        }
        return ApkDigest.hex(digest.digest());
    }

    static String sha256Hex(byte[] data) {
        if (data == null) return "";
        try {
            return ApkDigest.hex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (java.security.NoSuchAlgorithmException missing) {
            return "";
        }
    }

    static boolean isGitHubUrl(String url) {
        if (url == null) return false;
        String lower = url.trim().toLowerCase(Locale.ROOT);
        return lower.contains("github.com") || lower.contains("githubusercontent.com")
                || lower.contains("api.github.com");
    }

    /**
     * Digest esperado para una descarga.
     *
     * @return hex de 64 caracteres si hay digest publicado; "" si es un asset
     *         de GitHub sin digest (se debe rechazar); null si no hay ancla de
     *         GitHub (descarga desde el búnker, se permite).
     */
    static String pickExpected(String downloadUrl, String latestUrl, String latestDigest,
                               String previousUrl, String previousDigest) {
        String url = downloadUrl == null ? "" : downloadUrl.trim();
        if (!url.isEmpty()) {
            if (!latestUrl.isEmpty() && url.equals(latestUrl.trim())) {
                return ApkDigest.normalize(latestDigest);
            }
            if (!previousUrl.isEmpty() && url.equals(previousUrl.trim())) {
                return ApkDigest.normalize(previousDigest);
            }
        }
        if (ApkDigest.isGitHubUrl(url)) return "";
        return null;
    }

    /**
     * Resuelve el ancla SHA-256 que debe usarse para una descarga. Es Java puro
     * (sin android.*) a proposito: la NPE de D1 ocurrio por llamar a
     * String.isEmpty() sobre el null que devuelve expectedDigestFor() para las
     * URLs del buner, y esta funcion se prueba en escritorio.
     *
     * @param githubDigest resultado de UpdateRelease.expectedDigestFor(): null si
     *        la URL no es de GitHub (buner), "" si es de GitHub y el release no
     *        publica digest, hex de 64 si lo publica.
     * @param bunkerSha SHA-256 que el buner publica en /status (apkSha256) y que
     *        se guarda como pending_apk_expected_sha.
     * @return null si no hay ningun ancla (buner antiguo sin SHA publicado: lo
     *         permite la ruta nativa del Hub; la web lo rechaza, ver
     *         {@link #resolveExpectedForRoute}); "" si hay ancla declarada pero no
     *         verificable (se rechaza); hex de 64 si el ancla es verificable.
     */
    static String resolveExpected(String githubDigest, String bunkerSha) {
        if (githubDigest != null) {
            // Ruta de GitHub: manda su digest. Un release sin digest queda "" y
            // se rechaza; el SHA del buner no sustituye al ancla de GitHub.
            return ApkDigest.normalize(githubDigest);
        }
        String bunker = bunkerSha == null ? "" : bunkerSha.trim();
        if (bunker.isEmpty()) return null;
        // El buner si publica un SHA: es el ancla de esa ruta. Si llega
        // corrupto, normalize devuelve "" y decision() lo trata como no
        // verificable (fail-closed).
        return ApkDigest.normalize(bunker);
    }

    /**
     * 5.3.7: ancla efectiva según el origen de la instalación.
     *
     * La ruta WEB (el JavaScript de la página, que puede ser contenido ajeno al
     * APK) no puede instalar sin ancla: si {@link #resolveExpected} devuelve
     * null (búnker antiguo sin apkSha256) se degrada a "" para que
     * {@link #decision} devuelva "missing" y el instalador rechace con aviso.
     * La ruta nativa del Hub conserva el null ("no-anchor": se instala como
     * antes) para no romper la actualización desde el Hub en un puente antiguo.
     */
    static String resolveExpectedForRoute(String route, String githubDigest, String anchorSha) {
        String expected = ApkDigest.resolveExpected(githubDigest, anchorSha);
        if (ApkDigest.isWebRoute(route) && expected == null) return "";
        return expected;
    }

    /** "ok" | "missing" | "mismatch" | "no-anchor". */
    static String decision(String expected, String actual) {
        if (expected == null) return DECISION_NO_ANCHOR;
        String normalizedExpected = ApkDigest.normalize(expected);
        if (normalizedExpected.isEmpty()) return DECISION_MISSING;
        String normalizedActual = ApkDigest.normalize(actual);
        if (normalizedActual.isEmpty()) return DECISION_MISMATCH;
        return normalizedExpected.equals(normalizedActual) ? DECISION_OK : DECISION_MISMATCH;
    }
}
