/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Arranque de los avisos de la PC tras reiniciar el teléfono.
 *
 * Android solo entrega BOOT_COMPLETED a receptores con intent-filter, por eso
 * este receptor está exportado; cualquier otra acción se ignora, no acepta nada
 * más. Arranca `PcEventsService` (servicio en primer plano) únicamente si el
 * usuario dejó activos «Notificaciones de la PC» (`pc_events_enabled`) y
 * «Reiniciar el servicio si se cuelga» (`pc_events_watchdog_enabled`). Si el
 * sistema prohíbe arrancar un servicio en primer plano desde el arranque
 * (Android 12+ puede hacerlo), se registra y no se hace nada más: abrir la
 * aplicación sigue arrancando el servicio como siempre.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "DshBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        // El receptor está exportado por exigencia de Android; no atiende otra cosa.
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!PcEventsService.isEnabled(context)) {
            Log.i(TAG, "arranque: avisos de la PC apagados, no se arranca el servicio");
            return;
        }
        if (!PcEventsService.isWatchdogEnabled(context)) {
            Log.i(TAG, "arranque: vigilante apagado, no se arranca el servicio");
            return;
        }
        try {
            // PcEventsService.start() usa startForegroundService (minSdk 26) y el
            // propio servicio publica su notificación permanente en onStartCommand.
            PcEventsService.start(context);
            Log.i(TAG, "arranque: servicio de avisos iniciado");
        } catch (Throwable error) {
            // Sin reintentos ni alarmas: abrir la app vuelve a arrancarlo.
            Log.w(TAG, "arranque: el sistema no permitió iniciar el servicio: " + error);
        }
    }
}
