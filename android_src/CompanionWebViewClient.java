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

import android.webkit.HttpAuthHandler;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebViewClient;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * WebViewClient: navegacion, errores, autenticacion y muerte del render.
 */
class CompanionWebViewClient extends WebViewClient {

    private final MainActivity a;
    /** Evita abrir el navegador en bucle si el búnker redirige a un externo. */
    private String lastExternalUrl = null;
    private long lastExternalOpenAt = 0L;

    CompanionWebViewClient(MainActivity a) {
        this.a = a;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (request == null || !request.isForMainFrame()) return false;
        Uri uri = request.getUrl();
        String scheme = uri.getScheme();
        if (scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            if (UrlTools.isSameBunker(a, uri)) return false;
            UrlTools.openExternally(a, uri);
            return true;
        }
        if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
            UrlTools.openExternally(a, uri);
        }
        return true;
    }

    @Override
    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        // P17: shouldOverrideUrlLoading no cubre los redirects de servidor; sin
        // esta comprobación una redirección podía cargar un origen externo
        // dentro del WebView (con el puente JS y sus credenciales al alcance).
        boolean originKnown = a.activeUrl != null && !a.activeUrl.trim().isEmpty();
        if (view != null && !CompanionWebViewClient.isBunkerPage(a, url)) {
            BridgeGuard.revoke();
            // Si aún no hay búnker activo (restauración de estado) no se puede
            // decidir el origen: se deja cargar sin puente en lugar de abrir el
            // navegador por error.
            if (originKnown && CompanionWebViewClient.isWebUrl(url)) {
                a.pageLoading = false;
                a.mainFrameFailed = false;
                try {
                    view.stopLoading();
                } catch (Throwable ignored) {
                }
                Uri external = Uri.parse(url);
                long now = System.currentTimeMillis();
                boolean repeat = url.equals(lastExternalUrl) && now - lastExternalOpenAt < 15000L;
                if (!repeat) {
                    lastExternalUrl = url;
                    lastExternalOpenAt = now;
                    UrlTools.openExternally(a, external);
                }
                // Se deja la vista en blanco para que el contenido externo no
                // llegue a renderizarse y se reintenta el búnker.
                try {
                    view.loadUrl("about:blank");
                } catch (Throwable ignored) {
                }
                a.attempts = 0;
                ConnectionController.markRetrying(a);
                ConnectionController.scheduleReconnect(a, 800);
            }
            return;
        }
        a.pageLoading = true;
        a.mainFrameFailed = false;
        WebBridge.beginBridgePage(a, url);
        WebBridge.applyThemeToWeb(a);
        WebBridge.applyEnterBehaviorToWeb(a);
        WebBridge.applyOfflineCopyToWeb(a);
        WebBridge.applyOutboxInterceptorToWeb(a);
    }

    /**
     * P1: refuerza la inyección del nonce cuando el documento ya es visible;
     * onPageStarted puede ejecutarse antes de que el contexto JS de la página
     * nueva esté listo.
     */
    @Override
    public void onPageCommitVisible(WebView view, String url) {
        if (CompanionWebViewClient.isBunkerPage(a, url)) {
            WebBridge.ensureBridgeTokenForPage(a, url);
        }
    }

    /** true si la URL es un documento del mismo origen que el búnker activo. */
    private static boolean isBunkerPage(MainActivity a, String url) {
        if (url == null) return false;
        try {
            return UrlTools.isSameBunker(a, Uri.parse(url));
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static boolean isWebUrl(String url) {
        if (url == null) return false;
        String lower = url.toLowerCase(java.util.Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        a.pageLoading = false;
        // onPageFinished se invoca también sobre la página de error y
        // después de onReceivedError: sin esta guarda se anularía el
        // reintento recién programado y el punto se pondría en verde.
        if (a.mainFrameFailed) return;
        if (url == null) return;
        Uri parsed = Uri.parse(url);
        if (!UrlTools.isSameBunker(a, parsed)) return;

        // P1: repite la inyección del nonce (por si onPageStarted llegó antes
        // que el documento) y conserva el mismo valor para no desarmar al
        // cliente que ya llamó a armBridge.
        WebBridge.ensureBridgeTokenForPage(a, url);

        // La pantalla de espera es del mismo origen que la app: si se
        // marcara "en linea" el indicador mentiria mientras se aprueba.
        CharSequence title = view.getTitle();
        if (title != null && (title.toString().toLowerCase().contains("esperando")
                || title.toString().toLowerCase().contains("pendiente"))) {
            ConnectionController.markRetrying(a);
            BannerUi.showBanner(a, "Esperando aprobación en la computadora.");
            ConnectionController.scheduleReconnect(a, 1500);
            return;
        }

        ConnectionController.markOnline(a);
        ActionDispatcher.checkAndDispatchPendingAction(a);
        WebBridge.applyThemeToWeb(a);
        WebBridge.applyEnterBehaviorToWeb(a);
        WebBridge.applyOfflineCopyToWeb(a);
        WebBridge.applyOutboxInterceptorToWeb(a);
        WebBridge.injectSharedTextIfReady(a);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request == null || !request.isForMainFrame()) return;
        if (!UrlTools.isTransientNetworkError(error)) return;
        a.pageLoading = false;
        a.mainFrameFailed = true;
        ConnectionController.markFailed(a);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                    android.webkit.WebResourceResponse response) {
        if (request == null || !request.isForMainFrame()) return;
        if (response == null || response.getStatusCode() < 500) return;
        a.pageLoading = false;
        a.mainFrameFailed = true;
        ConnectionController.markFailed(a);
    }

    /**
     * El proceso de render de la WebView puede morir (memoria, GPU). Sin
     * manejarlo, Android cierra la app entera; aqui se descarta la vista
     * muerta y se reconstruye la sesion.
     */
    @Override
    public boolean onRenderProcessGone(WebView view,
                                       android.webkit.RenderProcessGoneDetail detail) {
        boolean crashed = detail != null && detail.didCrash();
        android.util.Log.w("DshWebView", "render process " + (crashed ? "crashed" : "killed by system"));
        // P1: el contexto JS murió; el nonce de esa página ya no sirve.
        BridgeGuard.revoke();
        try {
            if (a.root != null && view != null) a.root.removeView(view);
            if (view != null) view.destroy();
        } catch (Throwable ignored) {}
        a.webView = null;
        if (crashed) {
            Toast.makeText(a, "La vista se reinició tras un fallo interno", Toast.LENGTH_LONG).show();
        }
        // Devuelve true para indicar que ya gestionamos la caida.
        a.ui.postDelayed(() -> a.recreate(), 150);
        return true;
    }

    @Override
    public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler,
                                          String host, String realm) {
        // La clave del puente solo se entrega al host del búnker activo:
        // un subrecurso de un tercero que responda 401 no debe recibirla.
        String bunkerHost = Uri.parse(a.activeUrl).getHost();
        if (bunkerHost == null || host == null || !host.equalsIgnoreCase(bunkerHost)) {
            handler.cancel();
            return;
        }
        PcEntry pc = PcRegistryStore.getActivePc(a);
        String key = (pc != null && pc.accessKey != null && !pc.accessKey.trim().isEmpty())
                ? pc.accessKey.trim()
                : a.prefs.getString(KEY_ACCESS_KEY, "");
        if (key == null || key.trim().isEmpty()) {
            handler.cancel();
            ConnectionController.promptAccessKey(a);
            return;
        }
        handler.proceed("dsh", key.trim());
    }

    /**
     * Bloquea los subrecursos en claro que no vayan al búnker ni a la red
     * privada. La WebView no tiene una política por rango de IP, así que se
     * corta aquí antes de descargar nada.
     */
    @Override
    public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view,
                                                                    WebResourceRequest request) {
        try {
            String url = request != null && request.getUrl() != null ? request.getUrl().toString() : null;
            String bunkerHost = Uri.parse(a.activeUrl).getHost();
            if (url != null && !CleartextPolicy.allows(url, bunkerHost)) {
                android.util.Log.w("DshWebView", "bloqueado tráfico en claro: " + url);
                java.util.Map<String, String> headers = new java.util.HashMap<>();
                headers.put("Content-Type", "text/plain; charset=utf-8");
                headers.put("Cache-Control", "no-store");
                return new android.webkit.WebResourceResponse(
                        "text/plain", "utf-8", 403, "Bloqueado",
                        headers, new java.io.ByteArrayInputStream(
                        "Bloqueado: tráfico en claro hacia un host no privado.".getBytes("UTF-8")));
            }
        } catch (Throwable error) {
            // P36: si la política no se puede evaluar, el tráfico en claro se
            // bloquea (fail-closed). Dejarlo pasar convertía un error de parseo
            // en una fuga silenciosa; https y los esquemas locales no se tocan.
            try {
                String raw = request != null && request.getUrl() != null ? request.getUrl().toString() : "";
                if (raw.toLowerCase(java.util.Locale.ROOT).startsWith("http://")) {
                    android.util.Log.w("DshWebView", "política no evaluable, http bloqueado: " + raw);
                    return new android.webkit.WebResourceResponse("text/plain", "utf-8", 403, "Bloqueado",
                            new java.util.HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0]));
                }
            } catch (Throwable ignored) {
            }
        }
        return null;
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
        handler.cancel();
    }
}
