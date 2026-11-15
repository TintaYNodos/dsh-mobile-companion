/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;

/**
 * Creacion de los canales de notificacion.
 *
 * Separado de NotificationHelper: los canales se definen una vez al arrancar y
 * no cambian con cada aviso, mientras que el helper crece con cada tipo de
 * mensaje. Los nombres de canal viven en NotificationHelper para que todos los
 * emisores compartan la misma constante.
 */
public final class NotificationChannels {

    private static final long[] VIBRATE_APPROVAL = new long[]{0, 250, 150, 250};
    private static final long[] VIBRATE_DISCONNECT = new long[]{0, 400, 200, 400};

    private NotificationChannels() {
    }

    public static void create(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel approvals = new NotificationChannel(
                NotificationHelper.CHANNEL_APPROVALS,
                "Peticiones y Aprobaciones",
                NotificationManager.IMPORTANCE_HIGH
        );
        approvals.setDescription("Peticiones de herramientas y permisos que requieren Aceptar o Rechazar");
        approvals.enableVibration(true);
        approvals.setVibrationPattern(VIBRATE_APPROVAL);
        approvals.enableLights(true);
        approvals.setLightColor(Color.parseColor("#0EA5E9"));
        approvals.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(approvals);

        NotificationChannel tasks = new NotificationChannel(
                NotificationHelper.CHANNEL_TASKS,
                "Tareas y Respuestas",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        tasks.setDescription("Avisos cuando Harness finaliza una respuesta o un trabajo");
        tasks.enableVibration(true);
        tasks.setVibrationPattern(new long[]{0, 180});
        nm.createNotificationChannel(tasks);

        NotificationChannel connection = new NotificationChannel(
                NotificationHelper.CHANNEL_CONNECTION,
                "Estado de Conexión",
                NotificationManager.IMPORTANCE_HIGH
        );
        connection.setDescription("Avisos si se pierde la conexion con la computadora por mas de 10 minutos");
        connection.enableVibration(true);
        connection.setVibrationPattern(VIBRATE_DISCONNECT);
        nm.createNotificationChannel(connection);

        NotificationChannel pc = new NotificationChannel(
                NotificationHelper.CHANNEL_PC,
                "Respuestas de la PC",
                NotificationManager.IMPORTANCE_HIGH
        );
        pc.setDescription("Avisa cuando Harness termina de responder en la computadora");
        pc.enableVibration(true);
        pc.setVibrationPattern(new long[]{0, 220, 120, 220});
        pc.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(pc);

        NotificationChannel service = new NotificationChannel(
                NotificationHelper.CHANNEL_SERVICE,
                "Escucha activa",
                NotificationManager.IMPORTANCE_LOW
        );
        service.setDescription("Mantiene la escucha de la computadora con la aplicacion cerrada");
        service.setShowBadge(false);
        nm.createNotificationChannel(service);

        NotificationChannel critical = new NotificationChannel(
                NotificationHelper.CHANNEL_CRITICAL,
                "Avisos críticos",
                NotificationManager.IMPORTANCE_HIGH
        );
        critical.setDescription("Kill switch, revocaciones y acciones de seguridad");
        critical.enableVibration(true);
        critical.setVibrationPattern(VIBRATE_APPROVAL);
        critical.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(critical);
    }
}
