/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;

/**
 * Puente JavaScript expuesto al WebView como `window.AndroidCompanion`.
 * Permite que la aplicacion web notifique eventos nativos al telefono:
 * - Peticiones de autorizacion o permisos de herramientas (con botones Aceptar/Rechazar).
 * - Finalizacion de generacion de respuestas.
 * - Finalizacion de trabajos o tareas en segundo plano.
 * - Latidos periodicos de conexion viva para el monitor de desconexion.
 */
public class CompanionBridge {

    private final Context context;
    private final Handler mainHandler;

    public CompanionBridge(Context context) {
        this.context = context.getApplicationContext();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    @JavascriptInterface
    public void onApprovalRequested(String key, String toolName, String headline, String detail) {
        if (key == null || key.trim().isEmpty()) return;
        mainHandler.post(() -> {
            NotificationHelper.notifyApproval(context, key, toolName, headline, detail);
        });
    }

    @JavascriptInterface
    public void onApprovalSettled(String key) {
        if (key == null || key.trim().isEmpty()) return;
        mainHandler.post(() -> {
            NotificationHelper.cancelApproval(context, key);
        });
    }

    @JavascriptInterface
    public void onGenerationFinished(String title, String preview) {
        mainHandler.post(() -> {
            NotificationHelper.notifyGenerationComplete(context, title, preview);
        });
    }

    @JavascriptInterface
    public void onJobFinished(String jobId, String jobName, String status) {
        mainHandler.post(() -> {
            NotificationHelper.notifyJobComplete(context, jobId, jobName, status);
        });
    }

    @JavascriptInterface
    public void onHeartbeat() {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.recordHeartbeat();
            }
        });
    }

    @JavascriptInterface
    public void installUpdate() {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.downloadAndInstallApk();
            }
        });
    }

    @JavascriptInterface
    public boolean isDark() {
        MainActivity instance = MainActivity.getInstance();
        return instance != null ? instance.isDark() : false;
    }

    @JavascriptInterface
    public String getThemeMode() {
        MainActivity instance = MainActivity.getInstance();
        if (instance == null) return "system";
        int m = instance.themeMode();
        return m == 1 ? "dark" : (m == 2 ? "light" : "system");
    }

    @JavascriptInterface
    public boolean isEnterNewlineEnabled() {
        MainActivity instance = MainActivity.getInstance();
        return instance != null ? instance.isEnterNewlineEnabled() : true;
    }

    @JavascriptInterface
    public void onApproved() {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.reloadMainSession();
            }
        });
    }
}
