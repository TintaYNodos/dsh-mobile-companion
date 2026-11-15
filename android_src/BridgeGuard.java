/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.net.Uri;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/**
 * P1: guardián del puente JavaScript por nonce de página.
 *
 * El objeto `AndroidCompanion` inyectado con addJavascriptInterface queda
 * visible en TODOS los frames del WebView (incluidos los iframes de terceros),
 * así que una página incrustada podía llamar a installUpdate,
 * confirmCriticalApproval o startSatelliteQuery. Este guardián ata el puente a
 * un nonce que solo vive en el frame principal:
 *
 *  - WebBridge genera un nonce por navegación principal y lo inyecta como
 *    `window.__DSH_BRIDGE_TOKEN__` (solo en el frame raíz).
 *  - El cliente JS del búnker llama a armBridge(nonce) para marcar la página.
 *  - Los métodos sensibles exigen el nonce en cada llamada: un iframe
 *    cross-origin no puede leer las propiedades del padre, así que no puede
 *    aportarlo aunque el frame principal ya haya armado el puente.
 *  - Además se comprueba que la URL del frame principal (la que entrega
 *    onPageStarted/onPageFinished, equivalente a webView.getUrl() en ese
 *    instante) siga siendo el mismo origen que el búnker activo.
 */
class BridgeGuard {

    private static final String LOG_TAG = "DshBridge";
    private static final SecureRandom RNG = new SecureRandom();
    private static final Object LOCK = new Object();

    /** Nonce de la navegación principal en curso. null = puente revocado. */
    private static volatile String pageNonce = null;
    /** URL del frame principal, capturada en los callbacks del WebViewClient. */
    private static volatile String pageUrl = null;
    /** true solo si el cliente del búnker presentó el nonce correcto. */
    private static volatile boolean armed = false;

    private BridgeGuard() {}

    /** Genera un nonce nuevo para una navegación principal ya validada. */
    static String rotateForPage(String url) {
        String nonce = BridgeGuard.randomHex(16);
        synchronized (LOCK) {
            pageNonce = nonce;
            pageUrl = url;
            armed = false;
        }
        return nonce;
    }

    /** Actualiza la URL del frame principal sin rotar el nonce. */
    static void confirmPageUrl(String url) {
        if (url != null && pageNonce != null) pageUrl = url;
    }

    /** Corta el puente (navegación externa, página en blanco, render muerto). */
    static void revoke() {
        synchronized (LOCK) {
            pageNonce = null;
            pageUrl = null;
            armed = false;
        }
    }

    static String currentNonce() {
        return pageNonce;
    }

    static boolean isArmed() {
        return armed;
    }

    /**
     * Arma el puente para la página actual. Es idempotente y un intento
     * fallido no desarma una página que ya estaba armada.
     */
    static boolean arm(MainActivity a, String candidate) {
        if (a == null || candidate == null || candidate.trim().isEmpty()) return false;
        String nonce = pageNonce;
        if (nonce == null) return false;
        if (!BridgeGuard.constantTimeEquals(nonce, candidate)) return false;
        if (!BridgeGuard.isBunkerUrl(a, pageUrl)) return false;
        armed = true;
        return true;
    }

    /**
     * Autorización de un método sensible: puente armado + nonce de la llamada +
     * origen del frame principal igual al del búnker activo.
     */
    static boolean authorize(MainActivity a, String candidate) {
        if (!armed) return false;
        if (a == null || candidate == null || candidate.trim().isEmpty()) return false;
        String nonce = pageNonce;
        if (nonce == null || !BridgeGuard.constantTimeEquals(nonce, candidate)) return false;
        return BridgeGuard.isBunkerUrl(a, pageUrl);
    }

    static void logRejected(String method) {
        android.util.Log.w(LOG_TAG, "llamada rechazada por el guardián: " + method);
    }

    /** Comprueba que una URL sea el mismo origen (esquema+host+puerto) del búnker. */
    static boolean isBunkerUrl(MainActivity a, String url) {
        if (a == null || url == null || url.trim().isEmpty()) return false;
        String active = a.activeUrl;
        if (active == null || active.trim().isEmpty()) return false;
        try {
            return UrlTools.sameOrigin(Uri.parse(url), Uri.parse(active));
        } catch (Throwable ignored) {
            return false;
        }
    }

    static boolean constantTimeEquals(String left, String right) {
        if (left == null || right == null) return false;
        return MessageDigest.isEqual(
                left.getBytes(StandardCharsets.UTF_8),
                right.getBytes(StandardCharsets.UTF_8));
    }

    static String randomHex(int bytes) {
        if (bytes <= 0) bytes = 16;
        byte[] buffer = new byte[bytes];
        RNG.nextBytes(buffer);
        StringBuilder sb = new StringBuilder(buffer.length * 2);
        for (byte b : buffer) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }
}
