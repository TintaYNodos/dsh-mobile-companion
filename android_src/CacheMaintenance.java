/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.webkit.CookieManager;
import android.widget.Toast;

/**
 * Mantenimiento de la caché web del Hub («Limpiar caché»).
 *
 * H-04: antes `HubSheet.clearCacheAndReload` llamaba a `removeAllCookies`, que
 * borraba también la cookie de emparejamiento `dsh-companion-device`: el teléfono
 * volvía a «Acceso pendiente» y había que volver a aprobarlo desde la PC. Ahora
 * se pide confirmación diciendo qué se borra y qué no, se lee la cookie antes de
 * limpiar y se vuelve a fijar con su Max-Age antes de recargar. `removeAllCookies`
 * es asíncrono, así que la cookie se re-fija en su callback y la recarga va
 * después: si se recargara antes, la página pediría sesión sin emparejamiento.
 */
final class CacheMaintenance {

    /** Cookie de emparejamiento que fija el puente al aprobar el teléfono. */
    private static final String DEVICE_COOKIE = "dsh-companion-device";
    /** 30 días: el mismo Max-Age que publica el puente al emparejar. */
    private static final int DEVICE_COOKIE_MAX_AGE_S = 2_592_000;

    private CacheMaintenance() {
    }

    /** Pide confirmación explicando qué se borra y qué se conserva. */
    static void confirm(MainActivity a) {
        if (a == null) return;
        AlertDialog dialog = new AlertDialog.Builder(a)
                .setTitle("Limpiar caché")
                .setMessage("Se borran: caché de páginas, historial de navegación, "
                        + "almacenamiento web y las demás cookies.\n\n"
                        + "NO se borra el emparejamiento del teléfono (cookie "
                        + DEVICE_COOKIE + "): seguirás dentro sin volver a aprobarlo "
                        + "en la computadora.")
                .setPositiveButton("Limpiar", (d, w) -> CacheMaintenance.clearAndReload(a))
                .setNegativeButton("Cancelar", null)
                .create();
        UiKit.styleDialog(a, dialog);
        dialog.show();
    }

    /** Limpia caché, historial y datos web conservando el emparejamiento. */
    static void clearAndReload(final MainActivity a) {
        if (a == null) return;
        final String base = CacheMaintenance.cookieScope(a);
        final String device = CacheMaintenance.readDeviceCookie(base);
        try {
            android.webkit.WebViewDatabase.getInstance(a).clearHttpAuthUsernamePassword();
            android.webkit.WebStorage.getInstance().deleteAllData();
        } catch (Throwable ignored) {
        }
        try {
            CookieManager.getInstance().removeAllCookies(removed -> a.ui.post(() -> {
                CacheMaintenance.restoreDeviceCookie(base, device);
                if (a.webView != null) {
                    a.webView.clearCache(true);
                    a.webView.clearHistory();
                    a.webView.reload();
                }
                Toast.makeText(a, "Caché limpiada; el emparejamiento se conserva",
                        Toast.LENGTH_SHORT).show();
            }));
        } catch (Throwable ignored) {
        }
    }

    /** URL del búnker activo; define el origen donde vive la cookie. */
    private static String cookieScope(MainActivity a) {
        String url = MainActivity.getActiveBunkerUrl(a);
        if (url == null || url.trim().isEmpty()) {
            url = a.webView == null ? "" : a.webView.getUrl();
        }
        if (url == null || url.trim().isEmpty()) return "";
        return UrlTools.withScheme(url.trim());
    }

    /** Valor de `dsh-companion-device`, o "" si el teléfono no está emparejado. */
    private static String readDeviceCookie(String base) {
        if (base.isEmpty()) return "";
        try {
            String all = CookieManager.getInstance().getCookie(base);
            if (all == null) return "";
            for (String pair : all.split(";")) {
                int equals = pair.indexOf('=');
                if (equals <= 0) continue;
                if (pair.substring(0, equals).trim().equals(DEVICE_COOKIE)) {
                    return pair.substring(equals + 1).trim();
                }
            }
        } catch (Throwable ignored) {
        }
        return "";
    }

    /** Re-fija la cookie de emparejamiento con el Max-Age del puente. */
    private static void restoreDeviceCookie(String base, String value) {
        if (base.isEmpty() || value.isEmpty()) return;
        try {
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setCookie(base, DEVICE_COOKIE + "=" + value
                    + "; Path=/; Max-Age=" + DEVICE_COOKIE_MAX_AGE_S);
            cookieManager.flush();
        } catch (Throwable ignored) {
        }
    }
}
