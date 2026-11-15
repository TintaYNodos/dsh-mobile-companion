/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

/**
 * Avisos del canal de la PC: la notificacion fija del servicio, su cancelacion y
 * el aviso de "respuesta terminada". Se separaron de NotificationHelper para
 * dejar ese archivo en un tamano manejable.
 */
public final class NotificationsPc {

    private NotificationsPc() {
    }


    /**
     * Notificacion permanente del servicio que escucha a la computadora. Es el
     * "aviso obligatorio" que mantiene vivo el proceso para recibir eventos con
     * la aplicacion cerrada.
     */
    public static Notification buildPcServiceNotification(Context context) {
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, NotificationHelper.NOTIFICATION_ID_PC_SERVICE, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, NotificationHelper.CHANNEL_SERVICE);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_LOW);
        }

        return builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Avisos de la PC activos")
                .setContentText("Recibirás aquí cuando Harness termine una respuesta")
                .setContentIntent(openPending)
                .setOngoing(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .build();
    }

    public static void cancelPcService(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(NotificationHelper.NOTIFICATION_ID_PC_SERVICE);
    }

    /** Aviso de "respuesta terminada en la PC", tambien con la app cerrada. */
    public static void notifyPcResponse(Context context, String space) {
        if (context == null) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        String where = space == null ? "" : space.replace("--", "").replace("-", " ").trim();
        String text = where.isEmpty()
                ? "Harness terminó de responder. Toca para abrir la conversación."
                : "Harness terminó de responder en " + where + ". Toca para abrir la conversación.";

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, NotificationHelper.NOTIFICATION_ID_PC_RESPONSE, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, NotificationHelper.CHANNEL_PC);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Respuesta terminada en la PC")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#22D3EE"));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setChannelId(NotificationHelper.CHANNEL_PC);
        }
        nm.notify(NotificationHelper.NOTIFICATION_ID_PC_RESPONSE, builder.build());
    }

}
