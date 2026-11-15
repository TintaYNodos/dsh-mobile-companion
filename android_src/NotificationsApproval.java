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
 * Avisos de peticiones de herramienta/permiso. El aviso es solo informativo:
 * no lleva botones Aprobar/Rechazar porque el puente no puede resolver esa
 * decision desde el telefono; indica donde aprobar y toca para abrir la app.
 * Separado de NotificationHelper para mantener ese archivo pequeno.
 */
final class NotificationsApproval {

    private static final long[] VIBRATE_APPROVAL = new long[]{0, 250, 150, 250};

    private NotificationsApproval() {
    }

    /**
     * Muestra la notificacion informativa de peticion de herramienta / permiso.
     * P3: sin botones ni accion pendiente; el unico intent es abrir la app.
     */
    public static void notifyApproval(Context context, String key, String toolName, String headline, String detail) {
        if (!MainActivity.shouldShowNotification(context)) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        int notifId = NotificationHelper.notificationIdForKey(key);

        // Intent principal al tocar la notificacion: abre MainActivity
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, notifId, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title = "DSH: Aprobación requerida";
        if (toolName != null && !toolName.trim().isEmpty() && !toolName.equalsIgnoreCase("Harness")) {
            title = "Aprobación: " + toolName;
        }

        String body = (headline != null && !headline.trim().isEmpty()) ? headline : "Una herramienta solicita confirmación";
        // P3: sin botones en la notificacion; se indica donde si se puede aprobar.
        String hint = "Abre DeepSeek Harness en la computadora para aprobar o rechazar.";
        String fullText = body + "\n" + hint;
        if (detail != null && !detail.trim().isEmpty()) {
            fullText = body + "\n" + detail;
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, NotificationHelper.CHANNEL_APPROVALS);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setVibrate(VIBRATE_APPROVAL);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(fullText))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_SECRET)
                .setColor(Color.parseColor("#0EA5E9"));

        nm.notify(notifId, builder.build());
    }
}
