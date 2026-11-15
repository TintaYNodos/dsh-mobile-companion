/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

/**
 * Gestor de notificaciones de DSH Companion.
 *
 * Canales dedicados:
 * 1. Aprobaciones y peticiones de herramientas (Prioridad alta con botones de acción).
 * 2. Tareas y respuestas completadas (Prioridad normal).
 * 3. Alertas de desconexión prolongada (>10 minutos).
 */
public final class NotificationHelper {

    public static final String CHANNEL_APPROVALS = "dsh_channel_approvals";
    public static final String CHANNEL_TASKS = "dsh_channel_tasks";
    public static final String CHANNEL_CONNECTION = "dsh_channel_connection";
    public static final String CHANNEL_PC = "dsh_channel_pc";
    public static final String CHANNEL_SERVICE = "dsh_channel_service";
    public static final String CHANNEL_CRITICAL = "dsh_channel_critical";

    public static final String ACTION_APPROVE = "com.tintaynodos.dshcompanion.ACTION_APPROVE";
    public static final String ACTION_REJECT = "com.tintaynodos.dshcompanion.ACTION_REJECT";

    public static final String EXTRA_REQUEST_ID = "extra_request_id";
    public static final String EXTRA_ACTION_TYPE = "extra_action_type";
    public static final String EXTRA_NOTIFICATION_ID = "extra_notification_id";
    public static final String EXTRA_BUNKER_URL = "extra_bunker_url";

    public static final String TYPE_TOOL_APPROVAL = "tool_approval";
    public static final String TYPE_DEVICE_PAIRING = "device_pairing";

    public static final int NOTIFICATION_ID_DISCONNECTION = 9001;
    public static final int NOTIFICATION_ID_TASK = 8001;
    public static final int NOTIFICATION_ID_FEEDBACK = 10099;
    public static final int NOTIFICATION_ID_PC_SERVICE = 7001;
    public static final int NOTIFICATION_ID_PC_RESPONSE = 7002;
    public static final int NOTIFICATION_ID_CRITICAL = 7003;

    private static final long[] VIBRATE_APPROVAL = new long[]{0, 250, 150, 250};
    private static final long[] VIBRATE_DISCONNECT = new long[]{0, 400, 200, 400};

    private NotificationHelper() {
    }

    /** Los canales viven en NotificationChannels; aqui se delega por compatibilidad. */
    public static void initChannels(Context context) {
        NotificationChannels.create(context);
    }

    static int notificationIdForKey(String key) {
        return Math.abs(key.hashCode() % 10000) + 1000;
    }

    /**

    /**
     * Muestra notificacion de autorizacion de nuevo dispositivo con botones Aceptar y Rechazar.
     */
    public static void notifyDevicePairing(Context context, String deviceId, String code, String agent, String address, String bunkerUrl) {
        if (!MainActivity.shouldShowNotification(context)) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        int notifId = notificationIdForKey("device:" + deviceId);
        String resolvedBunkerUrl = (bunkerUrl != null && !bunkerUrl.trim().isEmpty())
                ? bunkerUrl
                : MainActivity.getActiveBunkerUrl(context);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, notifId, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent approveIntent = new Intent(context, NotificationActionReceiver.class);
        approveIntent.setAction(ACTION_APPROVE);
        approveIntent.putExtra(EXTRA_REQUEST_ID, deviceId);
        approveIntent.putExtra(EXTRA_ACTION_TYPE, TYPE_DEVICE_PAIRING);
        approveIntent.putExtra(EXTRA_NOTIFICATION_ID, notifId);
        approveIntent.putExtra(EXTRA_BUNKER_URL, resolvedBunkerUrl);
        PendingIntent approvePending = PendingIntent.getBroadcast(
                context, notifId * 2 + 1, approveIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Intent rejectIntent = new Intent(context, NotificationActionReceiver.class);
        rejectIntent.setAction(ACTION_REJECT);
        rejectIntent.putExtra(EXTRA_REQUEST_ID, deviceId);
        rejectIntent.putExtra(EXTRA_ACTION_TYPE, TYPE_DEVICE_PAIRING);
        rejectIntent.putExtra(EXTRA_NOTIFICATION_ID, notifId);
        rejectIntent.putExtra(EXTRA_BUNKER_URL, resolvedBunkerUrl);
        PendingIntent rejectPending = PendingIntent.getBroadcast(
                context, notifId * 2 + 2, rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title = "Dispositivo pide acceso (Código " + code + ")";
        String summary = address + " · " + (agent != null ? agent : "Dispositivo");

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_APPROVALS);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(summary)
                .setStyle(new Notification.BigTextStyle().bigText("Código en pantalla: " + code + "\n" + summary + "\n\nApruébalo desde el panel de la computadora."))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_SECRET)
                .setColor(Color.parseColor("#0EA5E9"));

        nm.notify(notifId, builder.build());
    }

    /**
     * Notifica cuando Harness termina de generar la respuesta.
     */
    public static void notifyGenerationComplete(Context context, String title, String preview) {
        if (!MainActivity.shouldShowNotification(context)) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, NOTIFICATION_ID_TASK, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String notifTitle = "DSH: Respuesta lista";
        if (title != null && !title.trim().isEmpty() && !title.equalsIgnoreCase("DeepSeek Harness")) {
            notifTitle = "Respuesta lista · " + title;
        }

        String body = (preview != null && !preview.trim().isEmpty()) ? preview : "El trabajo de generación ha finalizado.";

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_TASKS);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_DEFAULT);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(notifTitle)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#0EA5E9"));

        nm.notify(NOTIFICATION_ID_TASK, builder.build());
    }

    /**
     * Notifica cuando un trabajo o tarea en segundo plano finaliza.
     */
    public static void notifyJobComplete(Context context, String jobId, String jobName, String status) {
        if (!MainActivity.shouldShowNotification(context)) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        int notifId = notificationIdForKey("job:" + jobId);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, notifId, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String notifTitle = "DSH: Trabajo finalizado (" + status + ")";
        String body = (jobName != null && !jobName.trim().isEmpty()) ? jobName : ("Trabajo ID: " + jobId);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_TASKS);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_DEFAULT);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(notifTitle)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body + "\nEstado: " + status))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#0EA5E9"));

        nm.notify(notifId, builder.build());
    }

    /**
     * Notifica si la conexion con la computadora se perdio por mas de 10 minutos.
     */
    public static void notifyDisconnection(Context context, long disconnectedMinutes, String bunkerLabel) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, NOTIFICATION_ID_DISCONNECTION, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String target = (bunkerLabel != null && !bunkerLabel.trim().isEmpty()) ? bunkerLabel : "la computadora";
        String title = "Conexión perdida con " + target;
        String body = "Sin conexión con DeepSeek Harness desde hace más de " + disconnectedMinutes + " minutos. Verifica que la PC y la red VPN sigan encendidas.";

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_CONNECTION);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setVibrate(VIBRATE_DISCONNECT);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#D97706"));

        nm.notify(NOTIFICATION_ID_DISCONNECTION, builder.build());
    }

    public static void notifyAppUpdateAvailable(Context context, String newVersion) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        int notifId = 9999;
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra("trigger_update", true);
        // P18: firma el extra privilegiado para que MainActivity lo acepte.
        IntentGuard.sign(context, openIntent);
        PendingIntent openPending = PendingIntent.getActivity(
                context, notifId, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_TASKS);
        } else {
            builder = new Notification.Builder(context);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Actualización disponible (v" + newVersion + ")")
                .setContentText("Toca para descargar e instalar la nueva versión.")
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setColor(Color.parseColor("#1F6FEB"));

        nm.notify(notifId, builder.build());
    }

    public static void notifyActionFeedback(Context context, boolean isApprove, String target, boolean success) {
        if (context == null) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, NOTIFICATION_ID_FEEDBACK, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title;
        String text;
        int color;

        if (success) {
            title = isApprove ? "Autorización aplicada con éxito" : "Petición rechazada";
            text = isApprove ? ("Se autorizó la ejecución de " + (target != null ? target : ""))
                             : ("Se rechazó la ejecución de " + (target != null ? target : ""));
            color = Color.parseColor("#10B981");
        } else {
            title = "Error al transmitir decisión";
            text = "No se pudo comunicar con el búnker";
            color = Color.parseColor("#EF4444");
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_APPROVALS);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(color);

        nm.notify(NOTIFICATION_ID_FEEDBACK, builder.build());
    }

    public static void cancelApproval(Context context, String key) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(notificationIdForKey(key));
    }

    public static void cancelDisconnection(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.cancel(NOTIFICATION_ID_DISCONNECTION);
    }

    /**
     * Avisos criticos (kill switch, revocaciones): se muestran siempre, aunque
     * la aplicacion este en primer plano, porque son confirmaciones de una
     * accion de seguridad que el usuario debe ver.
     */
    public static void notifyCritical(Context context, String title, String text) {
        if (context == null) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_CRITICAL);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_MAX);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#EF4444"));

        nm.notify(NOTIFICATION_ID_CRITICAL, builder.build());
    }
}
