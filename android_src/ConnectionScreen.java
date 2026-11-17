/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Capa a pantalla completa que tapa la WebView cuando el frame principal no
 * carga. Sustituye al banner para el caso «sin conexión»: la página de error de
 * Chromium (net::ERR_*) nunca se ve, y el aviso ocupa toda la pantalla con un
 * botón para reintentar y otro para abrir Ajustes.
 *
 * Solo se muestra ante un fallo del frame principal (nunca por un subrecurso) y
 * se retira en cuanto una carga nueva termina bien ({@code onPageFinished} con
 * respuesta válida) o se recupera la conexión. La Activity es única, así que la
 * capa se guarda en referencias estáticas que {@link Cleanup} libera al destruir.
 */
class ConnectionScreen {

    static final String TITLE = "Sin conexión con la computadora";

    private static MainActivity sOwner;
    private static FrameLayout sLayer;
    private static TextView sState;
    private static TextView sDetail;
    private static TextView sUrl;
    private static String sAnnounced = "";

    private ConnectionScreen() {
    }

    /** Construye la capa oculta dentro de MainActivity, encima de la WebView. */
    static void build(MainActivity a) {
        if (a == null || a.root == null) return;
        if (sLayer != null) {
            if (sOwner == a) return;
            release(sOwner);
        }

        FrameLayout layer = new FrameLayout(a);
        layer.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Fondo opaco del tema: tapa por completo la página de error.
        layer.setBackgroundColor(ThemePalette.surface(a));
        // Toda la pantalla es un solo objetivo: el toque no llega a la WebView.
        layer.setClickable(true);
        layer.setFocusable(true);
        layer.setFocusableInTouchMode(true);
        layer.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        layer.setVisibility(View.GONE);

        ScrollView scroll = new ScrollView(a);
        scroll.setFillViewport(true);
        scroll.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout column = new LinearLayout(a);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setPadding(dp(a, 28), dp(a, 56), dp(a, 28), dp(a, 28));
        scroll.addView(column, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView badge = new TextView(a);
        badge.setText("!");
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setTextColor(Color.WHITE);
        badge.setGravity(Gravity.CENTER);
        GradientDrawable oval = new GradientDrawable();
        oval.setShape(GradientDrawable.OVAL);
        oval.setColor(ThemePalette.color(a, Color.parseColor("#B45309"), Color.parseColor("#D97706")));
        badge.setBackground(oval);
        badge.setContentDescription("Aviso: sin conexión con la computadora");
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(dp(a, 64), dp(a, 64));
        badgeParams.gravity = Gravity.CENTER_HORIZONTAL;
        badge.setLayoutParams(badgeParams);
        column.addView(badge);

        sState = new TextView(a);
        sState.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        sState.setTypeface(Typeface.DEFAULT_BOLD);
        sState.setLetterSpacing(0.12f);
        sState.setTextColor(ThemePalette.color(a, Color.parseColor("#FCD34D"), Color.parseColor("#92400E")));
        sState.setGravity(Gravity.CENTER);
        sState.setPadding(0, dp(a, 18), 0, 0);
        column.addView(sState);

        TextView title = new TextView(a);
        title.setText(TITLE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(ThemePalette.ink(a));
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(a, 8), 0, 0);
        column.addView(title);

        sDetail = new TextView(a);
        sDetail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14.5f);
        sDetail.setTextColor(ThemePalette.ink(a));
        sDetail.setGravity(Gravity.CENTER);
        sDetail.setLineSpacing(0f, 1.15f);
        sDetail.setPadding(0, dp(a, 12), 0, 0);
        column.addView(sDetail);

        sUrl = new TextView(a);
        sUrl.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        sUrl.setTextColor(ThemePalette.inkDim(a));
        sUrl.setGravity(Gravity.CENTER);
        // La dirección se puede seleccionar y copiar a mano.
        sUrl.setTextIsSelectable(true);
        sUrl.setPadding(0, dp(a, 10), 0, dp(a, 18));
        column.addView(sUrl);

        Button retry = UiKit.action(a, "Reintentar", 1, () -> retry(a));
        retry.setMinHeight(dp(a, 48));
        retry.setMinimumHeight(dp(a, 48));
        retry.setContentDescription("Reintentar la conexión con la computadora");
        column.addView(retry);

        Button settings = UiKit.action(a, "Ajustes", 0, () -> SettingsScreen.openSettingsDialog(a));
        settings.setMinHeight(dp(a, 48));
        settings.setMinimumHeight(dp(a, 48));
        settings.setContentDescription("Abrir los ajustes de la aplicación");
        column.addView(settings);

        layer.addView(scroll);
        a.root.addView(layer);

        sOwner = a;
        sLayer = layer;
        sAnnounced = "";
    }

    /**
     * true si el error del frame principal es de red (y merece esta capa).
     * ERROR_UNKNOWN (-1) queda fuera a propósito: WebView también lo usa al
     * abortar una carga sustituida por otra, y mostrar la capa ahí parpadearía
     * sobre una página que sí carga.
     */
    static boolean isNetworkFailure(WebResourceError error) {
        if (error == null) return false;
        switch (error.getErrorCode()) {
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_REDIRECT_LOOP:
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE:
            case WebViewClient.ERROR_TOO_MANY_REQUESTS:
                return true;
            default:
                return false;
        }
    }

    /** Muestra la capa tras un fallo de red del frame principal. */
    static void showNetworkFailure(MainActivity a, WebResourceError error, String url) {
        int code = error == null ? -1 : error.getErrorCode();
        int diagnosis = ConnectionController.diagnoseCase(a);
        if (diagnosis == ConnectionController.DIAG_NO_INTERNET) {
            show(a, "SIN INTERNET", ConnectionController.MSG_NO_INTERNET, url);
        } else if (diagnosis == ConnectionController.DIAG_NO_VPN) {
            // Mismo texto que el banner usaba para red privada inactiva.
            show(a, "RED PRIVADA INACTIVA", ConnectionController.diagnoseConnectionFailure(a), url);
        } else if (ConnectionScreen.isUnreachable(code)) {
            show(a, "PC SIN RESPUESTA", "La PC está apagada o el puente no está levantado", url);
        } else {
            show(a, "ERROR DE RED", "No se pudo cargar la página (" + errorName(code) + ")", url);
        }
    }

    /** Muestra la capa cuando el puente responde 5xx sin una página HTML. */
    static void showHttpFailure(MainActivity a, int statusCode, String url) {
        show(a, "ERROR DEL PUENTE",
                "El puente respondió con un error HTTP " + statusCode + ".", url);
    }

    private static void show(MainActivity a, String state, String detail, String url) {
        if (a == null || a.isFinishing()) return;
        build(a);
        if (sLayer == null) return;

        sState.setText(state);
        sDetail.setText(detail);
        String shownUrl = url != null && !url.trim().isEmpty() ? url.trim()
                : (a.activeUrl == null ? "" : a.activeUrl.trim());
        sUrl.setText(shownUrl.isEmpty() ? "Dirección desconocida" : shownUrl);
        sUrl.setContentDescription(shownUrl.isEmpty() ? "Dirección desconocida" : "Dirección: " + shownUrl);

        boolean wasHidden = sLayer.getVisibility() != View.VISIBLE;
        sLayer.setVisibility(View.VISIBLE);
        // El WebView tapado no debe capturar toques ni el foco de TalkBack.
        if (a.webView != null) {
            a.webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            a.webView.setFocusable(false);
        }
        // Solo al aparecer: los reintentos automáticos no roban el foco.
        if (wasHidden) sLayer.requestFocus();

        String spoken = TITLE + ". " + detail;
        if (wasHidden || !spoken.equals(sAnnounced)) {
            sAnnounced = spoken;
            sLayer.announceForAccessibility(spoken);
        }
    }

    /** Retira la capa de inmediato; se llama al cargar bien o al recuperar la red. */
    static void hide(MainActivity a) {
        if (sLayer == null) return;
        if (sLayer.getVisibility() == View.VISIBLE) {
            sLayer.setVisibility(View.GONE);
            sAnnounced = "";
        }
        sLayer.clearFocus();
        if (a != null && a.webView != null) {
            a.webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
            a.webView.setFocusable(true);
        }
    }

    static boolean isShowing() {
        return sLayer != null && sLayer.getVisibility() == View.VISIBLE;
    }

    /** «Reintentar»: recarga el búnker y relanza la comprobación de conexión. */
    static void retry(MainActivity a) {
        if (a == null || a.webView == null || a.isFinishing()) return;
        a.attempts = 0;
        a.reconnecting = false;
        a.ui.removeCallbacks(a.reconnectTick);
        ConnectionController.markRetrying(a);

        String target = a.activeUrl != null && !a.activeUrl.trim().isEmpty()
                ? a.activeUrl.trim()
                : PcRegistryStore.getActiveBunkerUrl(a);
        if (target == null || target.trim().isEmpty()) {
            ConnectionController.boot(a);
            return;
        }
        show(a, "RECONECTANDO", "Comprobando otra vez la conexión con la computadora…", target);
        sAnnounced = "";
        ConnectionController.startLoad(a, target);
    }

    /** Suelta las vistas: Cleanup la llama al destruir la Activity. */
    static void release(MainActivity a) {
        // Si ya hay una capa de otra instancia de la Activity, no se toca.
        if (a != null && sOwner != null && sOwner != a) return;
        if (sLayer != null) {
            try {
                if (sLayer.getParent() instanceof ViewGroup) {
                    ((ViewGroup) sLayer.getParent()).removeView(sLayer);
                }
            } catch (Throwable ignored) {
            }
        }
        sLayer = null;
        sState = null;
        sDetail = null;
        sUrl = null;
        sAnnounced = "";
        sOwner = null;
    }

    /** Solo timeout, host inalcanzable o conexión rechazada: la PC o el puente. */
    private static boolean isUnreachable(int code) {
        switch (code) {
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
                return true;
            default:
                return false;
        }
    }

    /** Código net::ERR_* de Chromium equivalente al error de WebView. */
    private static String errorName(int code) {
        switch (code) {
            case WebViewClient.ERROR_HOST_LOOKUP: return "ERR_NAME_NOT_RESOLVED";
            case WebViewClient.ERROR_CONNECT: return "ERR_CONNECTION_REFUSED";
            case WebViewClient.ERROR_IO: return "ERR_EMPTY_RESPONSE";
            case WebViewClient.ERROR_TIMEOUT: return "ERR_CONNECTION_TIMED_OUT";
            case WebViewClient.ERROR_REDIRECT_LOOP: return "ERR_TOO_MANY_REDIRECTS";
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE: return "ERR_SSL_PROTOCOL_ERROR";
            case WebViewClient.ERROR_TOO_MANY_REQUESTS: return "ERR_TOO_MANY_REQUESTS";
            case WebViewClient.ERROR_UNKNOWN: return "ERR_FAILED";
            default: return "ERR_" + Math.abs(code);
        }
    }

    private static int dp(MainActivity a, float value) {
        return ThemePalette.dp(a, value);
    }
}
