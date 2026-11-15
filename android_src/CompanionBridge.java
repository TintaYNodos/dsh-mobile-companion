/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * Puente JavaScript expuesto al WebView como `window.AndroidCompanion`.
 * Permite que la aplicación web notifique eventos nativos al teléfono:
 * - Peticiones de autorización o permisos de herramientas (con botones Aceptar/Rechazar).
 * - Finalización de generación de respuestas.
 * - Finalización de trabajos o tareas en segundo plano.
 * - Latidos periódicos de conexión viva para el monitor de desconexión.
 * - Consultas satelitales directas a DeepSeek vía streaming SSE cifrado con KeyStore.
 */
public class CompanionBridge {

    private final Context context;
    private final Handler mainHandler;
    private CloudSatelliteClient activeSatelliteClient;

    public CompanionBridge(Context context) {
        this.context = context.getApplicationContext();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    @JavascriptInterface
    public void onApprovalRequested(String key, String toolName, String headline, String detail) {
        if (key == null || key.trim().isEmpty()) return;
        mainHandler.post(() -> {
            NotificationsApproval.notifyApproval(context, key, toolName, headline, detail);
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
    public void copyToClipboard(String text) {
        mainHandler.post(() -> {
            try {
                ClipboardManager cm = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) {
                    ClipData clip = ClipData.newPlainText("DSH Link", text != null ? text : "");
                    cm.setPrimaryClip(clip);
                    Toast.makeText(context, "Enlace copiado al portapapeles", Toast.LENGTH_SHORT).show();
                }
            } catch (Throwable ignored) {
            }
        });
    }

    @JavascriptInterface
    public void onGenerationStateChanged(boolean isGenerating) {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.setGenerationState(isGenerating);
            }
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
    public boolean isOnline() {
        MainActivity instance = MainActivity.getInstance();
        return instance != null && instance.isOnline();
    }

    @JavascriptInterface
    public void saveOfflineDraft(String draft) {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.saveOfflineDraft(draft);
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

    /** Interruptor de Ajustes: fila de comandos rapidos sobre el compositor. */
    @JavascriptInterface
    public boolean quickActionsEnabled() {
        MainActivity instance = MainActivity.getInstance();
        return instance == null || instance.isQuickActionsEnabled();
    }

    /**
     * Interruptor "Enter para enviar". Se expone el sentido directo (enviar si /
     * enviar no) en lugar de "es salto de linea" para que el lado web no tenga
     * que invertirlo y no pueda quedar desincronizado con Ajustes.
     */
    @JavascriptInterface
    public boolean enterSendsMessage() {
        MainActivity instance = MainActivity.getInstance();
        return instance != null && instance.isEnterSendEnabled();
    }

    /** Interruptor de Ajustes: fila de teclas de codigo sobre el compositor. */
    @JavascriptInterface
    public boolean codeKeysEnabled() {
        MainActivity instance = MainActivity.getInstance();
        return instance == null || instance.isCodeKeysEnabled();
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

    @JavascriptInterface
    public void performHaptic(String type) {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.vibrateHaptic(type);
            }
        });
    }

    @JavascriptInterface
    public void confirmCriticalApproval(String key, String toolName) {
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.requestCriticalBiometricApproval(key, toolName);
            }
        });
    }

    @JavascriptInterface
    public void startSatelliteQuery(String payload) {
        cancelSatelliteQuery();

        String apiKey = KeyStoreVault.getDeepSeekApiKey(context);
        if (apiKey == null || apiKey.trim().isEmpty()) {
            mainHandler.post(() -> {
                MainActivity instance = MainActivity.getInstance();
                if (instance != null) {
                    instance.dispatchSatelliteError("Clave API de DeepSeek no configurada en el almacén seguro (Ajustes -> Modo Satélite)");
                }
            });
            return;
        }

        activeSatelliteClient = new CloudSatelliteClient();
        activeSatelliteClient.executeQuery(apiKey, payload, new CloudSatelliteClient.SatelliteListener() {
            @Override
            public void onChunk(String text) {
                mainHandler.post(() -> {
                    MainActivity instance = MainActivity.getInstance();
                    if (instance != null) {
                        instance.dispatchSatelliteChunk(text);
                    }
                });
            }

            @Override
            public void onComplete(String fullText) {
                mainHandler.post(() -> {
                    MainActivity instance = MainActivity.getInstance();
                    if (instance != null) {
                        instance.dispatchSatelliteComplete(fullText);
                    }
                });
            }

            @Override
            public void onError(String error) {
                mainHandler.post(() -> {
                    MainActivity instance = MainActivity.getInstance();
                    if (instance != null) {
                        instance.dispatchSatelliteError(error);
                    }
                });
            }
        });
    }

    @JavascriptInterface
    public void cancelSatelliteQuery() {
        if (activeSatelliteClient != null) {
            activeSatelliteClient.cancel();
            activeSatelliteClient = null;
        }
    }

    @JavascriptInterface
    public boolean hasSatelliteKey() {
        return KeyStoreVault.hasDeepSeekApiKey(context);
    }
}
