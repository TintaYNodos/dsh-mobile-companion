/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.util.Base64;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Avisos de la PC con la aplicacion cerrada.
 *
 * Servicio en primer plano: mantiene una conexion SSE con el puente
 * (/dsh-companion/pc-events) y muestra una notificacion cuando Harness termina
 * de responder en la computadora. El aviso nace en el puente, que vigila las
 * sesiones en disco, asi que no depende del WebView ni de que la app este
 * abierta. Android puede matar un proceso en segundo plano, pero no un servicio
 * en primer plano con su notificacion permanente.
 */
public class PcEventsService extends Service {

    public static final String ACTION_START = "com.tintaynodos.dshcompanion.PC_EVENTS_START";
    public static final String ACTION_STOP = "com.tintaynodos.dshcompanion.PC_EVENTS_STOP";
    public static final String PREF_ENABLED = "pc_notifications_enabled";

    private volatile boolean running = false;
    private volatile HttpURLConnection connection = null;
    private Thread worker = null;

    private static volatile boolean serviceRunning = false;

    /** ¿Esta el servicio escuchando ahora mismo? (para mostrarlo en Ajustes) */
    public static boolean isRunning() {
        return serviceRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // Los canales se crean al abrir la app; si el servicio arranca antes (o
        // tras reiniciar el telefono), notificar con un canal inexistente se
        // descarta en silencio.
        NotificationHelper.initChannels(this);
    }

    public static boolean isEnabled(Context context) {
        if (context == null) return false;
        SharedPreferences prefs = context.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        return prefs.getBoolean(PREF_ENABLED, false);
    }

    public static void start(Context context) {
        if (context == null) return;
        Intent intent = new Intent(context, PcEventsService.class);
        intent.setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        if (context == null) return;
        Intent intent = new Intent(context, PcEventsService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopListening();
            serviceRunning = false;
            NotificationsPc.cancelPcService(this);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Notificacion permanente del servicio (canal silencioso).
        startForeground(NotificationHelper.NOTIFICATION_ID_PC_SERVICE, NotificationsPc.buildPcServiceNotification(this));
        serviceRunning = true;
        if (!running) startListening();
        return START_STICKY;
    }

    private void startListening() {
        running = true;
        worker = new Thread(() -> {
            int attempt = 0;
            while (running) {
                try {
                    listenOnce();
                    attempt = 0;
                } catch (Throwable error) {
                    attempt++;
                    // Sin traza, un 403 o una URL vacia se quedaban en silencio y
                    // el aviso simplemente nunca llegaba.
                    android.util.Log.w("DshPcEvents", "SSE falló (intento " + attempt + "): " + error);
                }
                if (!running) break;
                long wait = Math.min(30_000L, 2_000L * Math.max(1, attempt));
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException stop) {
                    break;
                }
            }
        }, "dsh-pc-events");
        worker.setDaemon(true);
        worker.start();
    }

    private void listenOnce() throws Exception {
        String base = MainActivity.getActiveBunkerUrl(this);
        if (base == null || base.trim().isEmpty()) {
            throw new IllegalStateException("sin direccion de la computadora configurada");
        }
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        String endpoint = base.replaceAll("/+$", "") + "/dsh-companion/pc-events";

        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
        connection = conn;
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(0);
        conn.setRequestProperty("Accept", "text/event-stream");
        conn.setRequestProperty("Cache-Control", "no-store");

        String key = MainActivity.getAccessKey(this);
        if (key != null && !key.trim().isEmpty()) {
            String credentials = "dsh:" + key.trim();
            String encoded = Base64.encodeToString(credentials.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            conn.setRequestProperty("Authorization", "Basic " + encoded);
        }

        // La sesion del telefono es la cookie de dispositivo que el WebView ya
        // tiene tras aprobar el equipo. Sin ella, si no hay clave guardada, el
        // puente responde 403 y el servicio reintenta en bucle sin avisar nada.
        try {
            String cookie = android.webkit.CookieManager.getInstance().getCookie(endpoint);
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        } catch (Throwable ignored) {}

        int status = conn.getResponseCode();
        if (status != 200) {
            conn.disconnect();
            throw new IllegalStateException("SSE " + status);
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while (running && (line = reader.readLine()) != null) {
                if (!line.startsWith("data:")) continue;
                String payload = line.substring(5).trim();
                if (payload.isEmpty()) continue;
                if (payload.contains("\"response-finished\"")) {
                    String space = field(payload, "space");
                    NotificationsPc.notifyPcResponse(this, space);
                }
            }
        } finally {
            conn.disconnect();
            connection = null;
        }
    }

    /** Extrae un campo de texto de un JSON pequeno sin dependencias. */
    private static String field(String json, String name) {
        String needle = "\"" + name + "\":\"";
        int start = json.indexOf(needle);
        if (start < 0) return "";
        start += needle.length();
        int end = json.indexOf('"', start);
        if (end < 0) return "";
        return json.substring(start, end);
    }

    private void stopListening() {
        running = false;
        HttpURLConnection conn = connection;
        connection = null;
        if (conn != null) {
            try { conn.disconnect(); } catch (Throwable ignored) {}
        }
        Thread thread = worker;
        worker = null;
        if (thread != null) {
            try { thread.interrupt(); } catch (Throwable ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        stopListening();
        serviceRunning = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
