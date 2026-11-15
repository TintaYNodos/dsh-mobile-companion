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

import android.webkit.WebResourceError;
import android.webkit.WebViewClient;
import android.content.ActivityNotFoundException;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Utilidades puras de URL, origen y errores de red.
 */
class UrlTools {
    static String withScheme(String url) {
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        return "http://" + url;
    }

    /**
     * Solo los fallos de red justifican reintentar. Un aborto por navegación o
     * un esquema no soportado son decisiones, no averías.
     */
    static boolean isTransientNetworkError(WebResourceError error) {
        if (error == null) return false;
        switch (error.getErrorCode()) {
            case -3:
                return false;
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_REDIRECT_LOOP:
                return true;
            default:
                return false;
        }
    }

/**
     * Frontera de origen: esquema, host y puerto efectivos. Comparar solo el
     * host abriria cualquier otro servicio ofrecido por la misma maquina.
     */
    static boolean isSameBunker(MainActivity a, Uri uri) {
        if (a.activeUrl.isEmpty() || uri == null) return false;
        return sameOrigin(uri, Uri.parse(a.activeUrl));
    }

    static boolean sameOrigin(Uri left, Uri right) {
        if (left == null || right == null) return false;
        String leftScheme = left.getScheme();
        String rightScheme = right.getScheme();
        if (leftScheme == null || rightScheme == null || !leftScheme.equalsIgnoreCase(rightScheme)) return false;
        String leftHost = left.getHost();
        String rightHost = right.getHost();
        if (leftHost == null || rightHost == null || !leftHost.equalsIgnoreCase(rightHost)) return false;
        return UrlTools.effectivePort(left) == UrlTools.effectivePort(right);
    }

    static int effectivePort(Uri uri) {
        int port = uri.getPort();
        if (port != -1) return port;
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    /** Completa el esquema y el puerto del búnker cuando el usuario los omite. */
    static String normalizeUrl(String raw) {
        String url = raw == null ? "" : raw.trim();
        if (url.isEmpty()) return url;
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;

        Uri parsed = Uri.parse(url);
        if (parsed.getHost() == null) return url;
        if (parsed.getPort() == -1 && "http".equalsIgnoreCase(parsed.getScheme())) {
            String tail = parsed.getEncodedPath() == null ? "/" : parsed.getEncodedPath();
            return "http://" + parsed.getHost() + ":" + PORT + tail;
        }
        return url;
    }

    static void openExternally(MainActivity a, Uri uri) {
        if (uri == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            a.startActivity(Intent.createChooser(intent, "Abrir enlace"));
        } catch (ActivityNotFoundException missing) {
            Toast.makeText(a, "No hay ninguna aplicación para abrir este enlace", Toast.LENGTH_SHORT).show();
        }
    }

    static String describe(String prefix, String url) {
        String host = Uri.parse(url).getHost();
        if (host == null) return prefix;
        int lastDot = host.lastIndexOf('.');
        return lastDot == -1 ? prefix + " " + host : prefix + " " + host.substring(lastDot + 1);
    }
}
