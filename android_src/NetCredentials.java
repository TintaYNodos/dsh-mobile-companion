/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.net.Uri;
import android.widget.Toast;

/**
 * P40: limpieza de cookies y credenciales HTTP de un equipo al eliminarlo.
 *
 * Android no ofrece un borrado de cookies por dominio: se expiran una a una las
 * cookies visibles para las rutas conocidas de ese host. Si aun así queda
 * alguna, se borran TODAS y se avisa. Las credenciales de autenticación HTTP de
 * la WebView solo se pueden borrar de forma global
 * (WebViewDatabase.clearHttpAuthUsernamePassword), así que también se avisa.
 */
class NetCredentials {

    private NetCredentials() {}

    /** Puntos donde el búnker deja cookies (raíz, emparejamiento y offline). */
    private static String[] urlsFor(String scheme, String host, int port) {
        String base = scheme + "://" + host + (port > 0 ? ":" + port : "");
        return new String[]{
                base + "/",
                base + "/pair",
                base + "/offline",
                base + "/chats",
                base + "/status"
        };
    }

    static void clearForPc(MainActivity a, String rawUrl) {
        if (a == null) return;
        String host = null;
        String scheme = "http";
        int port = -1;
        try {
            String normalized = UrlTools.withScheme(rawUrl == null ? "" : rawUrl.trim());
            Uri parsed = Uri.parse(normalized);
            host = parsed.getHost();
            if (parsed.getScheme() != null && !parsed.getScheme().isEmpty()) {
                scheme = parsed.getScheme().toLowerCase(java.util.Locale.ROOT);
            }
            port = parsed.getPort();
        } catch (Throwable ignored) {
        }

        boolean globalCookies = false;
        boolean leftover = false;
        if (host != null && !host.trim().isEmpty()) {
            try {
                android.webkit.CookieManager cookies = android.webkit.CookieManager.getInstance();
                String[] urls = NetCredentials.urlsFor(scheme, host.trim(), port);
                for (String url : urls) {
                    NetCredentials.expireCookiesFor(cookies, url);
                }
                cookies.flush();
                for (String url : urls) {
                    String remaining = cookies.getCookie(url);
                    if (remaining != null && !remaining.trim().isEmpty()) {
                        leftover = true;
                        break;
                    }
                }
                if (leftover) {
                    // Fallback conservador: Android no permite borrar solo las
                    // cookies de un dominio de forma fiable.
                    cookies.removeAllCookies(null);
                    cookies.flush();
                    globalCookies = true;
                }
            } catch (Throwable ignored) {
            }
        }

        boolean authCleared = false;
        try {
            android.webkit.WebViewDatabase.getInstance(a).clearHttpAuthUsernamePassword();
            authCleared = true;
        } catch (Throwable ignored) {
        }

        if (globalCookies) {
            Toast.makeText(a,
                    "Eliminado. Se borraron las cookies de todos los equipos porque Android no permite borrar solo las de uno.",
                    Toast.LENGTH_LONG).show();
        } else if (authCleared) {
            Toast.makeText(a,
                    "Equipo eliminado. También se borraron las credenciales HTTP guardadas (Android no permite borrarlas por equipo).",
                    Toast.LENGTH_LONG).show();
        }
    }

    /** Expira con Max-Age=0 todas las cookies devueltas para esa URL. */
    private static void expireCookiesFor(android.webkit.CookieManager cookies, String url) {
        try {
            String stored = cookies.getCookie(url);
            if (stored == null || stored.trim().isEmpty()) return;
            String[] chunks = stored.split(";");
            for (String chunk : chunks) {
                if (chunk == null) continue;
                String trimmed = chunk.trim();
                if (trimmed.isEmpty()) continue;
                int eq = trimmed.indexOf('=');
                String name = eq > 0 ? trimmed.substring(0, eq).trim() : trimmed;
                if (name.isEmpty()) continue;
                cookies.setCookie(url,
                        name + "=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/");
            }
        } catch (Throwable ignored) {
        }
    }
}
