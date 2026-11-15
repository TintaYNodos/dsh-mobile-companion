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
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

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
 *
 * Vigilante: un SSE puede quedarse colgado sin error (TCP abierta, `readLine()`
 * sin datos) y los avisos mueren en silencio. Cada minuto, solo con el servicio
 * en primer plano, se evalua {@link WatchdogPolicy}: sin actividad cierra y
 * reabre el SSE; dos reconexiones sin recuperar reinician la escucha; si en
 * 5 min tampoco vuelve, avisa que los avisos estan detenidos.
 */
public class PcEventsService extends Service {

    public static final String ACTION_START = "com.tintaynodos.dshcompanion.PC_EVENTS_START";
    public static final String ACTION_STOP = "com.tintaynodos.dshcompanion.PC_EVENTS_STOP";
    public static final String PREF_ENABLED = "pc_notifications_enabled";

    private static final String TAG = "DshPcEvents";
    /** Cada cuanto se evalua al vigilante; solo con el servicio en primer plano. */
    private static final long WATCHDOG_TICK_MS = 60_000L;
    /** Margen para que el hilo viejo suelte el socket antes de abrir el nuevo. */
    private static final long RESTART_SETTLE_MS = 1_000L;

    private final Object connectionLock = new Object();
    private final Object watchdogLock = new Object();
    private final WatchdogPolicy policy = new WatchdogPolicy();
    private final WatchdogPolicy.State watchdog = new WatchdogPolicy.State();

    private volatile boolean running = false;
    /** Generacion de escucha: invalida hilos viejos tras un reinicio. */
    private volatile int listenEpoch = 0;
    private volatile HttpURLConnection connection = null;
    private Thread worker = null;
    private Handler mainHandler = null;

    private static volatile boolean serviceRunning = false;

    /** Tick del vigilante. Sin AlarmManager: no despierta el telefono. */
    private final Runnable watchdogTick = () -> {
        if (!serviceRunning || !isEnabled(PcEventsService.this)) return;
        try {
            evaluateWatchdog();
        } catch (Throwable error) {
            Log.w(TAG, "watchdog: fallo al evaluar: " + error);
        }
        scheduleWatchdogTick();
    };

    /** Tras un RESTART, abre el hilo nuevo cuando el viejo ya solto el socket. */
    private final Runnable startAfterRestart = () -> {
        // Si en el margen ya arranco otro (START_STICKY), no se duplica el hilo.
        if (serviceRunning && !running) startListening();
    };

    private void scheduleWatchdogTick() {
        if (!serviceRunning || mainHandler == null) return;
        mainHandler.removeCallbacks(watchdogTick);
        mainHandler.postDelayed(watchdogTick, WATCHDOG_TICK_MS);
    }

    /** ¿Esta el servicio escuchando ahora mismo? (para mostrarlo en Ajustes) */
    public static boolean isRunning() {
        return serviceRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        // Canales: si el servicio arranca antes que la app (o tras reiniciar el
        // telefono), un canal inexistente descarta el aviso en silencio.
        NotificationHelper.initChannels(this);
        mainHandler = new Handler(Looper.getMainLooper());
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
            stopEverything();
            stopSelf();
            return START_NOT_STICKY;
        }

        // Notificacion permanente del servicio (canal silencioso).
        startForeground(NotificationHelper.NOTIFICATION_ID_PC_SERVICE, NotificationsPc.buildPcServiceNotification(this));
        serviceRunning = true;
        if (running && ACTION_START.equals(action)) {
            // Peticion explicita (abrir la app o reactivar el interruptor):
            // recicla el SSE por si quedo colgado y el vigilante aun no lo noto.
            restartListening();
        } else if (!running) {
            synchronized (watchdogLock) {
                // Margen de arranque: el servicio acaba de empezar y aun no
                // llego ningun evento; eso no es un cuelgue.
                watchdog.lastEventAt = System.currentTimeMillis();
                watchdog.lastRestartAt = getSharedPreferences(PrefKeys.PREFS, MODE_PRIVATE)
                        .getLong(PrefKeys.KEY_PC_EVENTS_LAST_RESTART, 0L);
            }
            startListening();
        }
        scheduleWatchdogTick();
        return START_STICKY;
    }

    private void startListening() {
        listenEpoch++;
        final int epoch = listenEpoch;
        running = true;
        worker = new Thread(() -> listenLoop(epoch), "dsh-pc-events");
        worker.setDaemon(true);
        worker.start();
    }

    private void listenLoop(int epoch) {
        int attempt = 0;
        while (running && epoch == listenEpoch) {
            try {
                listenOnce(epoch);
                attempt = 0;
            } catch (Throwable error) {
                attempt++;
                // Sin traza, un 403 o una URL vacia se quedaban en silencio.
                Log.w(TAG, "SSE falló (intento " + attempt + "): " + error);
            }
            if (!running || epoch != listenEpoch) break;
            long wait = Math.min(30_000L, 2_000L * Math.max(1, attempt));
            try {
                Thread.sleep(wait);
            } catch (InterruptedException stop) {
                break;
            }
        }
    }

    private void listenOnce(int epoch) throws Exception {
        String base = MainActivity.getActiveBunkerUrl(this);
        if (base == null || base.trim().isEmpty()) {
            throw new IllegalStateException("sin direccion de la computadora configurada");
        }
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        String endpoint = base.replaceAll("/+$", "") + "/dsh-companion/pc-events";

        markAttempt();
        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
        setConnection(conn);
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
        // tiene; sin ella el puente responde 403 y se reintenta en bucle.
        try {
            String cookie = android.webkit.CookieManager.getInstance().getCookie(endpoint);
            if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);
        } catch (Throwable ignored) {}

        try {
            int status = conn.getResponseCode();
            if (status != 200) {
                throw new IllegalStateException("SSE " + status);
            }
            // El flujo respondio: la escucha esta viva aunque no lleguen turnos.
            markConnected();

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (running && epoch == listenEpoch && (line = reader.readLine()) != null) {
                    // Cualquier linea demuestra que el flujo no esta colgado: el
                    // puente manda ": keep-alive" cada 25 s aunque no haya turnos.
                    markEvent();
                    if (!line.startsWith("data:")) continue;
                    String payload = line.substring(5).trim();
                    if (payload.isEmpty()) continue;
                    if (payload.contains("\"response-finished\"")) {
                        String space = field(payload, "space");
                        NotificationsPc.notifyPcResponse(this, space);
                    }
                }
            }
        } finally {
            conn.disconnect();
            clearConnection(conn);
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

    /** Evalua la politica y ejecuta la accion que propone. */
    private void evaluateWatchdog() {
        SharedPreferences prefs = getSharedPreferences(PrefKeys.PREFS, MODE_PRIVATE);
        long now = System.currentTimeMillis();
        WatchdogPolicy.Action action;
        synchronized (watchdogLock) {
            watchdog.enabled = prefs.getBoolean(PrefKeys.KEY_PC_EVENTS_WATCHDOG, true);
            action = policy.decide(watchdog, now);
        }
        if (action == WatchdogPolicy.Action.OK) return;

        String note = action == WatchdogPolicy.Action.RECONNECT ? "reconectó el flujo"
                : action == WatchdogPolicy.Action.RESTART ? "reinició la escucha"
                : "avisó: avisos detenidos";
        prefs.edit()
                .putString(PrefKeys.KEY_PC_EVENTS_WATCHDOG_NOTE, note)
                .putLong(PrefKeys.KEY_PC_EVENTS_WATCHDOG_NOTE_AT, now)
                .apply();
        Log.i(TAG, "watchdog: " + action + " (" + note + ")");

        if (action == WatchdogPolicy.Action.RECONNECT) {
            // Cerrar el SSE actual: readLine() falla y el bucle reabre solo.
            disconnectCurrent();
        } else if (action == WatchdogPolicy.Action.RESTART) {
            prefs.edit().putLong(PrefKeys.KEY_PC_EVENTS_LAST_RESTART, now).apply();
            restartListening();
        } else {
            // Aviso honesto: los avisos estan detenidos y abrir la app reconecta.
            NotificationHelper.notifyPcEventsStalled(this);
        }
    }

    /**
     * RESTART: no se hace `stopSelf()` + arrancar de nuevo porque desde Android
     * 12 un servicio en segundo plano no puede volver a arrancar su propio
     * servicio en primer plano (ForegroundServiceStartNotAllowedException) y
     * quedaria un doble servicio. Se reinicia la escucha dentro del mismo
     * servicio: el hilo viejo se invalida (listenEpoch), se cierra su socket y
     * se abre uno nuevo. Para el usuario es el mismo efecto, sin carreras.
     */
    private void restartListening() {
        stopListening();
        if (mainHandler == null) {
            startListening();
        } else {
            mainHandler.postDelayed(startAfterRestart, RESTART_SETTLE_MS);
        }
    }

    private void markAttempt() {
        long now = System.currentTimeMillis();
        synchronized (watchdogLock) {
            policy.markAttempt(watchdog, now);
        }
    }

    private void markConnected() {
        long now = System.currentTimeMillis();
        long previousOk;
        synchronized (watchdogLock) {
            previousOk = watchdog.lastOkAt;
            policy.markConnected(watchdog, now);
        }
        // Persistir como mucho cada 30 s: un puente que acepta y cierra el flujo
        // no debe escribir preferencias en cada reintento.
        if (now - previousOk >= 30_000L) {
            getSharedPreferences(PrefKeys.PREFS, MODE_PRIVATE).edit()
                    .putLong(PrefKeys.KEY_PC_EVENTS_LAST_OK, now).apply();
        }
        try { NotificationHelper.cancelPcEventsStalled(this); } catch (Throwable ignored) {}
    }

    private void markEvent() {
        long now = System.currentTimeMillis();
        synchronized (watchdogLock) {
            policy.markEvent(watchdog, now);
        }
    }

    private void setConnection(HttpURLConnection conn) {
        synchronized (connectionLock) {
            connection = conn;
        }
    }

    private void clearConnection(HttpURLConnection conn) {
        synchronized (connectionLock) {
            if (connection == conn) connection = null;
        }
    }

    /** Cierra el SSE actual; el hilo de escucha reabre solo. */
    private void disconnectCurrent() {
        HttpURLConnection conn;
        synchronized (connectionLock) {
            conn = connection;
            connection = null;
        }
        if (conn != null) {
            try { conn.disconnect(); } catch (Throwable ignored) {}
        }
    }

    private void stopListening() {
        running = false;
        listenEpoch++; // invalida el bucle viejo aunque se vuelva a arrancar
        disconnectCurrent();
        Thread thread = worker;
        worker = null;
        if (thread != null) {
            try { thread.interrupt(); } catch (Throwable ignored) {}
        }
    }

    private void stopEverything() {
        serviceRunning = false;
        if (mainHandler != null) {
            mainHandler.removeCallbacks(watchdogTick);
            mainHandler.removeCallbacks(startAfterRestart);
        }
        stopListening();
        NotificationsPc.cancelPcService(this);
        try {
            NotificationHelper.cancelPcEventsStalled(this);
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        stopEverything();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
