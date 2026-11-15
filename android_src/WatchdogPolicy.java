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
 *   RESTART   reiniciar la escucha completa (dos reconexiones sin recuperar)
 *   ALERT     el reinicio tampoco recuperó: avisar que los avisos están detenidos
 * </pre>
 *
 * Reglas (umbrales por defecto, configurables en el constructor):
 * <ul>
 *   <li>3 min sin ninguna actividad (evento SSE o conexión establecida)
 *       → RECONNECT. El puente manda un comentario `: keep-alive` cada 25 s,
 *       así que un flujo sano nunca llega a 3 min de silencio.</li>
 *   <li>Dos RECONNECT seguidos sin recuperar → RESTART, con un mínimo de
 *       10 min entre reinicios para no entrar en bucle.</li>
 *   <li>5 min después del RESTART sin conexión buena → ALERT, una sola vez.</li>
 * </ul>
 *
 * Java puro, sin Android, para poder probarla con `java` normal:
 * `android_src/tests/WatchdogPolicyTest.java`.
 */
final class WatchdogPolicy {

    /** Acción que el servicio debe ejecutar. */
    enum Action {
        OK,
        RECONNECT,
        RESTART,
        ALERT
    }

    /** Silencio máximo sin actividad antes de reconectar. */
    static final long DEFAULT_STALE_MS = 3 * 60_000L;
    /** Margen que se le da a un RECONNECT antes de darlo por fallido. */
    static final long DEFAULT_RECONNECT_GRACE_MS = 60_000L;
    /** Margen tras un RESTART para que vuelva la conexión. */
    static final long DEFAULT_RESTART_GRACE_MS = 5 * 60_000L;
    /** Nunca más de un RESTART cada 10 minutos. */
    static final long DEFAULT_RESTART_COOLDOWN_MS = 10 * 60_000L;
    /** Dos reconexiones seguidas sin recuperar → RESTART. */
    static final int MAX_FAILED_RECONNECTS = 2;
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
        /** Ya se avisó del último cuelgue (no repetir el aviso cada minuto). */
        boolean alertSent = false;
    }

    private final long staleMs;
    private final long reconnectGraceMs;
    private final long restartGraceMs;
    private final long restartCooldownMs;

    WatchdogPolicy() {
        this(DEFAULT_STALE_MS, DEFAULT_RECONNECT_GRACE_MS,
                DEFAULT_RESTART_GRACE_MS, DEFAULT_RESTART_COOLDOWN_MS);
    }

    WatchdogPolicy(long staleMs, long reconnectGraceMs, long restartGraceMs, long restartCooldownMs) {
        this.staleMs = Math.max(MIN_THRESHOLD_MS, staleMs);
        this.reconnectGraceMs = Math.max(MIN_THRESHOLD_MS, reconnectGraceMs);
        this.restartGraceMs = Math.max(MIN_THRESHOLD_MS, restartGraceMs);
        this.restartCooldownMs = Math.max(MIN_THRESHOLD_MS, restartCooldownMs);
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
                if (state.alertSent) return Action.OK;
                state.alertSent = true;
                return Action.ALERT;
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

        if (state.failedReconnects >= MAX_FAILED_RECONNECTS) {
            // Dos reconexiones fallidas seguidas: toca reiniciar la escucha,
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
