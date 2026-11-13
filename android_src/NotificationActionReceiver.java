/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
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
            prefs.edit()
                    .putString("pending_action_decision", decision)
                    .putString("pending_action_id", requestId)
                    .apply();

            MainActivity instance = MainActivity.getInstance();
            boolean isVisible = MainActivity.isAppVisible();

            if (instance != null) {
                instance.dispatchAction(decision, requestId);
            }

            if (instance == null || !isVisible) {
                final String targetBunkerUrl = (bunkerUrl != null && !bunkerUrl.trim().isEmpty())
                        ? bunkerUrl
                        : MainActivity.getActiveBunkerUrl(context);
                new Thread(() -> {
                    sendToolAction(context, targetBunkerUrl, decision, requestId);
                }).start();
            } else {
                Toast.makeText(context, isApprove ? "PeticiÃ³n aprobada" : "PeticiÃ³n rechazada", Toast.LENGTH_SHORT).show();
            }
        } else if (NotificationHelper.TYPE_DEVICE_PAIRING.equals(actionType)) {
            final String apiAction = isApprove ? "approve_device" : "reject_device";
            final String targetBunkerUrl = (bunkerUrl != null && !bunkerUrl.trim().isEmpty())
                    ? bunkerUrl
                    : MainActivity.getActiveBunkerUrl(context);
            new Thread(() -> {
                sendDeviceAction(context, targetBunkerUrl, apiAction, requestId);
            }).start();
        }
    }

    private void sendToolAction(Context context, String bunkerUrl, String action, String requestId) {
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            bunkerUrl = MainActivity.getActiveBunkerUrl(context);
        }
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            postToast(context, "BÃºnker no configurado");
            return;
        }

        String base = bunkerUrl.replaceAll("/+$", "");
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "http://" + base;
        }

        String primaryEndpoint = base + "/dsh-companion/action";
        boolean success = executePost(context, primaryEndpoint, "{\"action\":\"" + action + "\",\"id\":\"" + requestId + "\",\"requestId\":\"" + requestId + "\"}");

        if (!success) {
            String fallbackEndpoint = base + "/dsh-companion/notification-action";
            success = executePost(context, fallbackEndpoint, "{\"action\":\"" + action + "\",\"id\":\"" + requestId + "\",\"requestId\":\"" + requestId + "\"}");
        }

        if (success) {
            postToast(context, "allow".equals(action) ? "PeticiÃ³n aprobada" : "PeticiÃ³n rechazada");
        } else {
            postToast(context, "No se pudo conectar con el puente");
        }
    }

    private void sendDeviceAction(Context context, String bunkerUrl, String action, String deviceId) {
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            bunkerUrl = MainActivity.getActiveBunkerUrl(context);
        }
        if (bunkerUrl == null || bunkerUrl.trim().isEmpty()) {
            postToast(context, "BÃºnker no configurado");
            return;
        }

        String base = bunkerUrl.replaceAll("/+$", "");
        if (!base.startsWith("http://") && !base.startsWith("https://")) {
            base = "http://" + base;
        }

        String endpoint = base + "/dsh-companion/notification-action";
        boolean success = executePost(context, endpoint, "{\"action\":\"" + action + "\",\"id\":\"" + deviceId + "\"}");

        if (success) {
            postToast(context, "approve_device".equals(action) ? "Dispositivo autorizado" : "Dispositivo rechazado");
        } else {
            postToast(context, "No se pudo conectar con el puente");
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