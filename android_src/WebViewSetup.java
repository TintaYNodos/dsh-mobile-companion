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

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebSettings;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Configuracion endurecida del WebView y su listener de descargas.
 */
class WebViewSetup {

    @SuppressLint("SetJavaScriptEnabled")
    static void configureWebView(MainActivity a) {
        WebSettings settings = a.webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setSavePassword(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setDefaultTextEncodingName("UTF-8");

        try {
            settings.setSafeBrowsingEnabled(true);
        } catch (Throwable ignored) {
        }

        WebView.setWebContentsDebuggingEnabled(false);

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(a.webView, false);

        a.webView.addJavascriptInterface(new CompanionBridge(a), "AndroidCompanion");

        a.webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null) return;
            if (url.toLowerCase().contains(".apk") && url.toLowerCase().contains("dsh-companion")) {
                UpdateInstaller.downloadAndInstallApk(a);
                return;
            }

            try {
                String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                if (contentDisposition != null && contentDisposition.contains("filename=")) {
                    filename = contentDisposition.replaceFirst("(?i).*filename=[\"']?([^\"';]+).*", "$1");
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                if (mimetype != null && !mimetype.isEmpty()) request.setMimeType(mimetype);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.addRequestHeader("User-Agent", userAgent);
                request.setDescription("Descargando " + filename);
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

                DownloadManager dm = (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(request);
                    Toast.makeText(a, "Descargando: " + filename, Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    a.startActivity(i);
                } catch (Exception ignored) {
                    Toast.makeText(a, "Error al descargar: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }
        });

        a.webView.setWebChromeClient(new CompanionChromeClient(a));
        a.webView.setWebViewClient(new CompanionWebViewClient(a));
    }
}
