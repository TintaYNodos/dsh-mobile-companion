/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Política del vigilante (watchdog) del servicio de avisos de la PC.
 *
 * El servicio SSE (`PcEventsService`) puede quedarse colgado leyendo un flujo
 * que ya no llega: la conexión TCP sigue abierta, `readLine()` nunca devuelve
 * nada y el teléfono deja de avisar sin que nadie lo note. Esta clase decide,
 * a partir de marcas de tiempo, qué hacer:
 *
 * <pre>
 *   OK        la escucha está viva o no toca actuar todavía
 *   RECONNECT cerrar el SSE actual y volver a abrirlo
 *   RESTART   reiniciar la escucha completa (varias reconexiones sin recuperar)
 *   ALERT     el reinicio tampoco recuperó: avisar que los avisos están detenidos
 * </pre>
 *
 * Reglas (umbrales configurables desde Ajustes y por constructor):
 * <ul>
 *   <li>Silencio máximo sin actividad (1, 3 o 5 min; 3 por defecto) → RECONNECT.
 *       El puente manda un comentario `: keep-alive` cada 25 s, así que un flujo
 *       sano nunca llega a ese umbral.</li>
 *   <li>N RECONNECT seguidos sin recuperar (1, 2 o 3; 2 por defecto) → RESTART,
 *       con un mínimo de 10 min entre reinicios para no entrar en bucle.</li>
 *   <li>5 min después del RESTART sin conexión buena → ALERT, una sola vez. Si
 *       "Avisar si no recupera" está apagado no se notifica: se cierra la
 *       ventana y el ciclo vuelve a intentarlo, siempre con el reinicio
 *       limitado a uno cada 10 min.</li>
 * </ul>
 *
 * Java puro, sin Android, para poder probarla con `java` normal:
 * `android_src/tests/WatchdogPolicyTest.java`. El servicio la reconstruye en
 * cada tick con los valores de Ajustes (`PrefKeys.watchdogPolicy`), así que
 * cambiarlos aplica sin reiniciar el servicio.
 */
final class WatchdogPolicy {

    /** Acción que el servicio debe ejecutar. */
    enum Action {
        OK,
        RECONNECT,
        RESTART,
        ALERT
    }

    /** Silencio máximo sin actividad antes de reconectar (3 min por defecto). */
    static final long DEFAULT_STALE_MS = 3 * 60_000L;
    /** Margen que se le da a un RECONNECT antes de darlo por fallido. */
    static final long DEFAULT_RECONNECT_GRACE_MS = 60_000L;
    /** Margen tras un RESTART para que vuelva la conexión. */
    static final long DEFAULT_RESTART_GRACE_MS = 5 * 60_000L;
    /** Nunca más de un RESTART cada 10 minutos. */
    static final long DEFAULT_RESTART_COOLDOWN_MS = 10 * 60_000L;
    /** Dos reconexiones seguidas sin recuperar → RESTART (por defecto). */
    static final int MAX_FAILED_RECONNECTS = 2;
    /** Opción máxima de "Reintentos antes de reiniciar" en Ajustes. */
    static final int MAX_RETRIES_OPTION = 3;
    /** Con menos de un segundo no tiene sentido evaluar nada. */
    static final long MIN_THRESHOLD_MS = 1_000L;

    /**
     * Estado observable que mantiene el servicio. El servicio actualiza las
     * marcas con {@link #markEvent}, {@link #markConnected} y
     * {@link #markAttempt}; {@link #decide} es lo único que mueve el resto.
     */
    static final class State {
        /** Interruptor de Ajustes; si está apagado no se propone nada. */
        boolean enabled = true;
        /** Última línea leída del SSE (evento o keep-alive). */
        long lastEventAt = 0L;
        /** Última conexión HTTP 200 establecida. */
        long lastOkAt = 0L;
        /** Último intento de conexión (para diagnóstico). */
        long lastConnectAttemptAt = 0L;
        /** Último RECONNECT ejecutado (0 = ninguno en esta sesión). */
        long lastReconnectAt = 0L;
        /** Último RESTART ejecutado (0 = ninguno en esta sesión). */
        long lastRestartAt = 0L;
        /** Momento del RESTART pendiente de recuperar (0 = sin reinicio pendiente). */
        long restartArmedAt = 0L;
        /** Reconexiones pedidas que no recuperaron la escucha. */
        int failedReconnects = 0;
        /** Ya se cerró la ventana del último cuelgue (no repetir cada minuto). */
        boolean alertSent = false;
    }

    private final long staleMs;
    private final long reconnectGraceMs;
    private final long restartGraceMs;
    private final long restartCooldownMs;
    private final int maxFailedReconnects;
    private final boolean alertEnabled;

    WatchdogPolicy() {
        this(DEFAULT_STALE_MS, DEFAULT_RECONNECT_GRACE_MS, DEFAULT_RESTART_GRACE_MS,
                DEFAULT_RESTART_COOLDOWN_MS, MAX_FAILED_RECONNECTS, true);
    }

    /** Solo lo configurable en Ajustes: silencio, reintentos y aviso. */
    WatchdogPolicy(long staleMs, int maxFailedReconnects, boolean alertEnabled) {
        this(staleMs, DEFAULT_RECONNECT_GRACE_MS, DEFAULT_RESTART_GRACE_MS,
                DEFAULT_RESTART_COOLDOWN_MS, maxFailedReconnects, alertEnabled);
    }

    /** Configuración completa, incluidos los márgenes (pruebas finas). */
    WatchdogPolicy(long staleMs, long reconnectGraceMs, long restartGraceMs, long restartCooldownMs) {
        this(staleMs, reconnectGraceMs, restartGraceMs, restartCooldownMs, MAX_FAILED_RECONNECTS, true);
    }

    WatchdogPolicy(long staleMs, long reconnectGraceMs, long restartGraceMs, long restartCooldownMs,
                   int maxFailedReconnects, boolean alertEnabled) {
        this.staleMs = Math.max(MIN_THRESHOLD_MS, staleMs);
        this.reconnectGraceMs = Math.max(MIN_THRESHOLD_MS, reconnectGraceMs);
        this.restartGraceMs = Math.max(MIN_THRESHOLD_MS, restartGraceMs);
        this.restartCooldownMs = Math.max(MIN_THRESHOLD_MS, restartCooldownMs);
        this.maxFailedReconnects = retriesFor(maxFailedReconnects);
        this.alertEnabled = alertEnabled;
    }

    /** Política con los valores de Ajustes (minutos 1/3/5, reintentos 1/2/3). */
    static WatchdogPolicy fromValues(int staleMinutes, int retries, boolean alertEnabled) {
        return new WatchdogPolicy(staleMsForMinutes(staleMinutes), retries, alertEnabled);
    }

    /** Silencio en minutos; cualquier valor distinto de 1, 3 o 5 cae en 3 min. */
    static long staleMsForMinutes(int minutes) {
        return minutes == 1 || minutes == 3 || minutes == 5 ? minutes * 60_000L : DEFAULT_STALE_MS;
    }

    /** Reintentos antes de reiniciar; fuera de 1..3 se usa el valor por defecto. */
    static int retriesFor(int retries) {
        return retries >= 1 && retries <= MAX_RETRIES_OPTION ? retries : MAX_FAILED_RECONNECTS;
    }

    /** Umbral de silencio en milisegundos (para la línea de estado de Ajustes). */
    long staleMs() {
        return staleMs;
    }

    /** Reconexiones fallidas seguidas antes de reiniciar. */
    int maxFailedReconnects() {
        return maxFailedReconnects;
    }

    /** ¿Está activado "Avisar si no recupera"? */
    boolean alertEnabled() {
        return alertEnabled;
    }

    /** Registra actividad en el flujo: un evento SSE o un keep-alive. */
    void markEvent(State state, long at) {
        if (state == null) return;
        state.lastEventAt = Math.max(0L, at);
        // Si llega algo, la escucha está viva: se olvidan los fallos previos.
        state.failedReconnects = 0;
        state.alertSent = false;
    }

    /** Registra una conexión establecida (HTTP 200 del SSE). */
    void markConnected(State state, long at) {
        if (state == null) return;
        state.lastOkAt = Math.max(0L, at);
        state.failedReconnects = 0;
        state.alertSent = false;
        if (state.restartArmedAt > 0L && at >= state.restartArmedAt) {
            state.restartArmedAt = 0L;
        }
    }

    /** Registra un intento de conexión, haya funcionado o no. */
    void markAttempt(State state, long at) {
        if (state == null) return;
        state.lastConnectAttemptAt = Math.max(0L, at);
    }

    /**
     * Decide la acción a ejecutar. Puede modificar el estado (contadores y
     * marcas de la acción que propone); el servicio solo tiene que ejecutarla.
     */
    Action decide(State state, long now) {
        if (state == null) return Action.OK;
        if (!state.enabled) return Action.OK;

        if (state.restartArmedAt > 0L) {
            // Reinicio reciente: se espera su margen sin insistir con más
            // reinicios. Si vuelve la conexión, se da por recuperado.
            if (state.lastOkAt >= state.restartArmedAt) {
                state.restartArmedAt = 0L;
                state.failedReconnects = 0;
                state.alertSent = false;
                return Action.OK;
            }
            if (now - state.restartArmedAt >= restartGraceMs) {
                if (alertEnabled) {
                    if (state.alertSent) return Action.OK;
                    state.alertSent = true;
                    return Action.ALERT;
                }
                // "Avisar si no recupera" apagado: no se notifica, pero el
                // vigilante sigue vivo. Se cierra la ventana para que el ciclo
                // vuelva a reconectar; el reinicio sigue limitado a 1/10 min.
                state.restartArmedAt = 0L;
                state.failedReconnects = 0;
                state.lastReconnectAt = 0L;
                return Action.OK;
            }
            return Action.OK;
        }

        long lastAlive = Math.max(state.lastEventAt, state.lastOkAt);
        boolean stale = lastAlive <= 0L || now - lastAlive >= staleMs;
        if (!stale) {
            state.failedReconnects = 0;
            state.alertSent = false;
            return Action.OK;
        }

        if (state.failedReconnects >= maxFailedReconnects) {
            // N reconexiones fallidas seguidas: toca reiniciar la escucha,
            // salvo que el límite de 1 reinicio / 10 min lo impida.
            if (state.lastRestartAt > 0L && now - state.lastRestartAt < restartCooldownMs) {
                return Action.OK;
            }
            state.lastRestartAt = now;
            state.restartArmedAt = now;
            state.failedReconnects = 0;
            state.lastReconnectAt = 0L;
            return Action.RESTART;
        }

        // Una reconexión por ventana de gracia: no cerrar y abrir el SSE cada
        // minuto mientras el puente está caído de verdad.
        if (state.lastReconnectAt > 0L && now - state.lastReconnectAt < reconnectGraceMs) {
            return Action.OK;
        }
        state.lastReconnectAt = now;
        state.failedReconnects++;
        return Action.RECONNECT;
    }

    /** "hace 35 s", "hace 3 min", "hace 2 h", "hace 4 d" o "nunca". */
    static String describeAge(long now, long then) {
        if (then <= 0L) return "nunca";
        long seconds = Math.max(0L, (now - then) / 1000L);
        if (seconds < 60L) return "hace " + seconds + " s";
        long minutes = seconds / 60L;
        if (minutes < 60L) return "hace " + minutes + " min";
        long hours = minutes / 60L;
        if (hours < 24L) return "hace " + hours + " h";
        return "hace " + (hours / 24L) + " d";
    }
}
