/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.CookieManager;
import android.widget.Toast;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NotificationActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        boolean isApprove = NotificationHelper.ACTION_APPROVE.equals(action);
        boolean isReject = NotificationHelper.ACTION_REJECT.equals(action);
        if (!isApprove && !isReject) return;

        // Autorizar sin desbloquear dejaba aprobar herramientas con el telefono
        // bloqueado. Se exige que el equipo este desbloqueado.
        try {
            android.app.KeyguardManager km =
                    (android.app.KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                NotificationHelper.notifyCritical(context,
                        "Desbloquea para autorizar",
                        isApprove
                                ? "El teléfono está bloqueado. Abre DSH Companion para aprobar esta petición."
                                : "El teléfono está bloqueado. Abre DSH Companion para rechazar esta petición.");
                return;
            }
        } catch (Throwable ignored) {}

        String requestId = intent.getStringExtra(NotificationHelper.EXTRA_REQUEST_ID);
        String actionType = intent.getStringExtra(NotificationHelper.EXTRA_ACTION_TYPE);
        int notifId = intent.getIntExtra(NotificationHelper.EXTRA_NOTIFICATION_ID, 0);
        String bunkerUrl = intent.getStringExtra(NotificationHelper.EXTRA_BUNKER_URL);

        if (notifId != 0) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifId);
        }

        if (requestId == null || requestId.isEmpty()) return;

        String decision = isApprove ? "allow" : "reject";

        if (NotificationHelper.TYPE_TOOL_APPROVAL.equals(actionType)) {
            SharedPreferences prefs = context.getSharedPreferences("DshCompanionPrefs", Context.MODE_PRIVATE);

            MainActivity instance = MainActivity.getInstance();
            boolean isVisible = MainActivity.isAppVisible();

            // Solo se guarda la acción pendiente cuando no hay proceso que pueda
            // aplicarla ya. Antes se guardaba siempre y además se despachaba aquí:
            // la misma aprobación se aplicaba dos veces (y pedía huella dos veces).
            if (instance == null) {
                prefs.edit()
                        .putString("pending_action_decision", decision)
                        .putString("pending_action_id", requestId)
                        .apply();
            }

            if (instance != null) {
                instance.dispatchAction(decision, requestId);
            }

            if (instance == null || !isVisible) {
                final String targetBunkerUrl = (bunkerUrl != null && !bunkerUrl.trim().isEmpty())
                        ? bunkerUrl
                        : MainActivity.getActiveBunkerUrl(context);
                final PendingResult pendingResult = goAsync();
                new Thread(() -> {
                    try {
                        sendToolAction(context, targetBunkerUrl, decision, requestId, isApprove);
                    } finally {
                        pendingResult.finish();
                    }
                }).start();
            } else {
                Toast.makeText(context, isApprove ? "Petición aprobada" : "Petición rechazada", Toast.LENGTH_SHORT).show();
            }
        } else if (NotificationHelper.TYPE_DEVICE_PAIRING.equals(actionType)) {
            final String apiAction = isApprove ? "approve_device" : "reject_device";
            final String targetBunkerUrl = (bunkerUrl != null && !bunkerUrl.trim().isEmpty())
                    ? bunkerUrl
                    : MainActivity.getActiveBunkerUrl(context);
            final PendingResult pendingResult = goAsync();
            new Thread(() -> {
                try {
                    sendDeviceAction(context, targetBunkerUrl, apiAction, requestId, isApprove);
                } finally {
                    pendingResult.finish();
                }
            }).start();
        }
    }

    private void sendToolAction(Context context, String bunkerUrl, String action, String requestId, boolean isApprove) {
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            bunkerUrl = MainActivity.getActiveBunkerUrl(context);
        }
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            postToast(context, "Búnker no configurado");
            NotificationHelper.notifyActionFeedback(context, isApprove, requestId, false);
            return;
        }

        String base = bunkerUrl.replaceAll("/+$", "");
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "http://" + base;
        }

        boolean success = false;
        try {
            String payload = buildToolPayload(action, requestId);
            String primaryEndpoint = base + "/dsh-companion/action";
            success = executePost(context, primaryEndpoint, payload);

            if (!success) {
                String fallbackEndpoint = base + "/dsh-companion/notification-action";
                success = executePost(context, fallbackEndpoint, payload);
            }

            if (success) {
                // El puente ya aplicó la decisión: no hay nada que reintentar al
                // abrir la app, así que se descarta la acción pendiente.
                context.getSharedPreferences("DshCompanionPrefs", Context.MODE_PRIVATE)
                        .edit()
                        .remove("pending_action_decision")
                        .remove("pending_action_id")
                        .apply();
                postToast(context, "allow".equals(action) ? "Petición aprobada" : "Petición rechazada");
            } else {
                postToast(context, "La aprobación desde la notificación no está disponible; apruébala en la computadora");
            }
        } catch (Exception e) {
            success = false;
            postToast(context, "No se pudo conectar con el puente");
        } finally {
            NotificationHelper.notifyActionFeedback(context, isApprove, requestId, success);
        }
    }

    private void sendDeviceAction(Context context, String bunkerUrl, String action, String deviceId, boolean isApprove) {
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            bunkerUrl = MainActivity.getActiveBunkerUrl(context);
        }
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            postToast(context, "Búnker no configurado");
            NotificationHelper.notifyActionFeedback(context, isApprove, deviceId, false);
            return;
        }

        String base = bunkerUrl.replaceAll("/+$", "");
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "http://" + base;
        }

        boolean success = false;
        try {
            String endpoint = base + "/dsh-companion/notification-action";
            String payload;
            try {
                org.json.JSONObject body = new org.json.JSONObject();
                body.put("action", action);
                body.put("id", deviceId);
                payload = body.toString();
            } catch (Exception error) {
                payload = "{}";
            }
            success = executePost(context, endpoint, payload);

            if (success) {
                postToast(context, "approve_device".equals(action) ? "Dispositivo autorizado" : "Dispositivo rechazado");
            } else {
                postToast(context, "No se pudo conectar con el puente");
            }
        } catch (Exception e) {
            success = false;
            postToast(context, "No se pudo conectar con el puente");
        } finally {
            NotificationHelper.notifyActionFeedback(context, isApprove, deviceId, success);
        }
    }

    /**
     * Cuerpo JSON del POST. Se construye con JSONObject para escapar el id: antes
     * se concatenaba a mano y un id con comillas rompía el cuerpo entero.
     */
    private String buildToolPayload(String action, String requestId) {
        try {
            org.json.JSONObject body = new org.json.JSONObject();
            body.put("action", action);
            body.put("id", requestId);
            body.put("requestId", requestId);
            return body.toString();
        } catch (Exception error) {
            return "{}";
        }
    }

    private boolean executePost(Context context, String endpoint, String jsonPayload) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            String cookie = null;
            try {
                cookie = CookieManager.getInstance().getCookie(endpoint);
            } catch (Throwable ignored) {
            }
            if (cookie != null && !cookie.isEmpty()) {
                conn.setRequestProperty("Cookie", cookie);
            }

            String accessKey = MainActivity.getAccessKey(context);
            if (accessKey != null && !accessKey.trim().isEmpty()) {
                String credentials = "dsh:" + accessKey.trim();
                String encoded = Base64.encodeToString(credentials.getBytes("UTF-8"), Base64.NO_WRAP);
                conn.setRequestProperty("Authorization", "Basic " + encoded);
            }

            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonPayload.getBytes("UTF-8"));
            }

            int code = conn.getResponseCode();

            String setCookie = conn.getHeaderField("Set-Cookie");
            if (setCookie != null && !setCookie.isEmpty()) {
                try {
                    CookieManager.getInstance().setCookie(endpoint, setCookie);
                    CookieManager.getInstance().flush();
                } catch (Throwable ignored) {
                }
            }

            return code >= 200 && code < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private void postToast(Context context, String message) {
        new Handler(Looper.getMainLooper()).post(() -> {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
        });
    }
}