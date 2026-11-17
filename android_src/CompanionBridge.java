/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
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
 * - Peticiones de autorización o permisos de herramientas (aviso informativo,
 *   sin botones: indica dónde aprobar en la computadora).
 * - Finalización de generación de respuestas.
 * - Finalización de trabajos o tareas en segundo plano.
 * - Latidos periódicos de conexión viva para el monitor de desconexión.
 *
 * P1 (5.1.9): TODOS los métodos llevan el nonce de `BridgeGuard` como primer
 * argumento, incluidos los getters de solo lectura (defensa en profundidad). Un
 * iframe no puede leer el token del frame principal. El APK y el puente se
 * publican juntos, así que no se conserva ninguna firma antigua sin token.
 */
public class CompanionBridge {

    private final Context context;
    private final Handler mainHandler;

    public CompanionBridge(Context context) {
        this.context = context.getApplicationContext();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    /**
     * P1 (5.1.9): TODOS los metodos expuestos a JavaScript pasan por aqui. Solo
     * se autoriza con el nonce de la pagina; si no, se registra el rechazo y se
     * devuelve false, sin excepcion hacia JS y sin ningun efecto.
     */
    private static boolean authorized(String method, String nonce) {
        if (BridgeGuard.authorize(MainActivity.getInstance(), nonce)) return true;
        BridgeGuard.logRejected(method);
        return false;
    }

    /**
     * P1: los métodos informativos del puente también exigen el nonce de la
     * página. Antes iban sin token y un iframe cross-origin podía usarlos para
     * crear avisos, escribir el portapapeles o simular latidos. La ruta nativa
     * (Java -> NotificationsApproval/WebBridge) NO pasa por aquí y no se toca.
     * Sin nonce válido no se hace nada: se registra el rechazo y se devuelve
     * false; nunca se lanza una excepción hacia JavaScript.
     */
    @JavascriptInterface
    public boolean onApprovalRequested(String nonce, String key, String toolName, String headline, String detail) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("onApprovalRequested");
            return false;
        }
        if (key == null || key.trim().isEmpty()) return false;
        mainHandler.post(() -> {
            NotificationsApproval.notifyApproval(context, key, toolName, headline, detail);
        });
        return true;
    }

    /** P1: cancelar el aviso de aprobacion cambia estado; exige el nonce. */
    @JavascriptInterface
    public boolean onApprovalSettled(String nonce, String key) {
        if (!authorized("onApprovalSettled", nonce)) return false;
        if (key == null || key.trim().isEmpty()) return false;
        mainHandler.post(() -> NotificationHelper.cancelApproval(context, key));
        return true;
    }

    /** P1: escribir el portapapeles también exige el nonce de la página. */
    @JavascriptInterface
    public boolean copyToClipboard(String nonce, String text) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("copyToClipboard");
            return false;
        }
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
        return true;
    }

    /** P1: el estado de generacion mueve la UI nativa; exige el nonce. */
    @JavascriptInterface
    public boolean onGenerationStateChanged(String nonce, boolean isGenerating) {
        if (!authorized("onGenerationStateChanged", nonce)) return false;
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.setGenerationState(isGenerating);
            }
        });
        return true;
    }

    /** P1: aviso de respuesta terminada; exige el nonce de la página. */
    @JavascriptInterface
    public boolean onGenerationFinished(String nonce, String title, String preview) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("onGenerationFinished");
            return false;
        }
        mainHandler.post(() -> {
            NotificationHelper.notifyGenerationComplete(context, title, preview);
        });
        return true;
    }

    /** P1: aviso de trabajo terminado; exige el nonce de la página. */
    @JavascriptInterface
    public boolean onJobFinished(String nonce, String jobId, String jobName, String status) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("onJobFinished");
            return false;
        }
        mainHandler.post(() -> {
            NotificationHelper.notifyJobComplete(context, jobId, jobName, status);
        });
        return true;
    }

    /** P1: latido del monitor de conexión; exige el nonce de la página. */
    @JavascriptInterface
    public boolean onHeartbeat(String nonce) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("onHeartbeat");
            return false;
        }
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.recordHeartbeat();
            }
        });
        return true;
    }

    /**
     * P1: arma el puente para la página actual. El cliente JS del búnker debe
     * llamarlo con el valor de `window.__DSH_BRIDGE_TOKEN__`. Devuelve true si
     * el nonce y el origen del frame principal son correctos; reintentar es
     * seguro (la inyección del token puede llegar unos ms después que el JS).
     */
    @JavascriptInterface
    public boolean armBridge(String nonce) {
        MainActivity instance = MainActivity.getInstance();
        if (!BridgeGuard.arm(instance, nonce)) {
            BridgeGuard.logRejected("armBridge");
            return false;
        }
        return true;
    }

    /**
     * P1: instalar una actualización exige el nonce de la página. La firma
     * cambió de `installUpdate()` a `installUpdate(String nonce)`; el cliente
     * inyectado (bloque F) pasa `window.__DSH_BRIDGE_TOKEN__`.
     */
    @JavascriptInterface
    public boolean installUpdate(String nonce) {
        final MainActivity instance = MainActivity.getInstance();
        if (!BridgeGuard.authorize(instance, nonce)) {
            BridgeGuard.logRejected("installUpdate");
            return false;
        }
        mainHandler.post(() -> {
            if (instance != null) instance.downloadAndInstallApk();
        });
        return true;
    }

    /**
     * P1: getter de lectura con nonce. Sin autorizacion responde true ("en
     * linea") a proposito: el interceptor de borradores solo debe guardar cuando
     * el nativo confirma que NO hay conexion, no ante un rechazo del guardian.
     */
    @JavascriptInterface
    public boolean isOnline(String nonce) {
        if (!authorized("isOnline", nonce)) return true;
        MainActivity instance = MainActivity.getInstance();
        return instance != null && instance.isOnline();
    }

    /**
     * P1: guardar el borrador sin conexión exige el nonce de la página. La ruta
     * nativa (IntentRouter -> WebBridge.saveOfflineDraft) escribe el borrador
     * directamente en Java y no pasa por el puente, así que no necesita token;
     * esta variante solo cubre la llamada desde JavaScript.
     */
    @JavascriptInterface
    public boolean saveOfflineDraft(String nonce, String draft) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("saveOfflineDraft");
            return false;
        }
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.saveOfflineDraft(draft);
            }
        });
        return true;
    }

    /**
     * P56: copia cifrada del último chat para el lector nativo sin conexión.
     *
     * Mismo contrato que {@link #saveOfflineDraft}: exige el nonce de la página
     * (fail-closed) y el trabajo se hace en el hilo principal, donde el
     * AndroidKeyStore y el archivo privado de la app se usan como en Ajustes.
     * El texto llega ya recortado a 20 000 caracteres desde el cliente; aun así
     * {@link OfflineChatStore} lo vuelve a acotar antes de cifrar. Si el
     * interruptor está apagado, el nativo descarta la copia (doble candado).
     */
    @JavascriptInterface
    public boolean saveOfflineChat(String nonce, String title, String text, String updatedAt) {
        if (!BridgeGuard.authorize(MainActivity.getInstance(), nonce)) {
            BridgeGuard.logRejected("saveOfflineChat");
            return false;
        }
        final String safeTitle = title;
        final String safeText = text;
        final String safeUpdatedAt = updatedAt;
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.saveOfflineChat(safeTitle, safeText, safeUpdatedAt);
            }
        });
        return true;
    }

    /** P1: getters de lectura; el nonce es defensa en profundidad (fail-closed). */
    @JavascriptInterface
    public boolean isDark(String nonce) {
        if (!authorized("isDark", nonce)) return false;
        MainActivity instance = MainActivity.getInstance();
        return instance != null && instance.isDark();
    }

    @JavascriptInterface
    public String getThemeMode(String nonce) {
        if (!authorized("getThemeMode", nonce)) return "system";
        MainActivity instance = MainActivity.getInstance();
        if (instance == null) return "system";
        int m = instance.themeMode();
        return m == 1 ? "dark" : (m == 2 ? "light" : "system");
    }

    @JavascriptInterface
    public boolean isEnterNewlineEnabled(String nonce) {
        if (!authorized("isEnterNewlineEnabled", nonce)) return true;
        MainActivity instance = MainActivity.getInstance();
        return instance != null ? instance.isEnterNewlineEnabled() : true;
    }

    /** Interruptor de Ajustes: fila de comandos rapidos sobre el compositor. */
    @JavascriptInterface
    public boolean quickActionsEnabled(String nonce) {
        if (!authorized("quickActionsEnabled", nonce)) return true;
        MainActivity instance = MainActivity.getInstance();
        return instance == null || instance.isQuickActionsEnabled();
    }

    /** Interruptor "Enter para enviar" (sentido directo, sin invertir en web). */
    @JavascriptInterface
    public boolean enterSendsMessage(String nonce) {
        if (!authorized("enterSendsMessage", nonce)) return false;
        MainActivity instance = MainActivity.getInstance();
        return instance != null && instance.isEnterSendEnabled();
    }

    /** Interruptor de Ajustes: fila de teclas de codigo sobre el compositor. */
    @JavascriptInterface
    public boolean codeKeysEnabled(String nonce) {
        if (!authorized("codeKeysEnabled", nonce)) return true;
        MainActivity instance = MainActivity.getInstance();
        return instance == null || instance.isCodeKeysEnabled();
    }

    /** P1: recargar la sesion principal tras aprobar cambia la pagina; nonce. */
    @JavascriptInterface
    public boolean onApproved(String nonce) {
        if (!authorized("onApproved", nonce)) return false;
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.reloadMainSession();
            }
        });
        return true;
    }

    /** P1: la vibracion se dispara desde JS; exige el nonce. */
    @JavascriptInterface
    public boolean performHaptic(String nonce, String type) {
        if (!authorized("performHaptic", nonce)) return false;
        mainHandler.post(() -> {
            MainActivity instance = MainActivity.getInstance();
            if (instance != null) {
                instance.vibrateHaptic(type);
            }
        });
        return true;
    }

    /**
     * P1: la firma cambió a `confirmCriticalApproval(String nonce, String key,
     * String toolName)`; el cliente inyectado pasa el token de la página.
     */
    @JavascriptInterface
    public boolean confirmCriticalApproval(String nonce, String key, String toolName) {
        final MainActivity instance = MainActivity.getInstance();
        if (!BridgeGuard.authorize(instance, nonce)) {
            BridgeGuard.logRejected("confirmCriticalApproval");
            return false;
        }
        mainHandler.post(() -> {
            if (instance != null) instance.requestCriticalBiometricApproval(key, toolName);
        });
        return true;
    }

}
