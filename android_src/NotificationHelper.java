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
 * 1. Aprobaciones y peticiones de herramientas (Prioridad alta con botones de acciÃ³n).
 * 2. Tareas y respuestas completadas (Prioridad normal).
 * 3. Alertas de desconexiÃ³n prolongada (>10 minutos).
 */
public final class NotificationHelper {

    public static final String CHANNEL_APPROVALS = "dsh_channel_approvals";
    public static final String CHANNEL_TASKS = "dsh_channel_tasks";
    public static final String CHANNEL_CONNECTION = "dsh_channel_connection";

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

    private static final long[] VIBRATE_APPROVAL = new long[]{0, 250, 150, 250};
    private static final long[] VIBRATE_DISCONNECT = new long[]{0, 400, 200, 400};

    private NotificationHelper() {
    }

    public static void initChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Canal 1: Aprobaciones y peticiones (Alta prioridad, sonido y vibracion)
        NotificationChannel chApprovals = new NotificationChannel(
                CHANNEL_APPROVALS,
                "Peticiones y Aprobaciones",
                NotificationManager.IMPORTANCE_HIGH
        );
        chApprovals.setDescription("Peticiones de herramientas y permisos que requieren Aceptar o Rechazar");
        chApprovals.enableVibration(true);
        chApprovals.setVibrationPattern(VIBRATE_APPROVAL);
        chApprovals.enableLights(true);
        chApprovals.setLightColor(Color.parseColor("#0EA5E9"));
        chApprovals.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(chApprovals);

        // Canal 2: Tareas y respuestas finalizadas
        NotificationChannel chTasks = new NotificationChannel(
                CHANNEL_TASKS,
                "Tareas y Respuestas",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        chTasks.setDescription("Avisos cuando Harness finaliza una respuesta o un trabajo");
        chTasks.enableVibration(true);
        chTasks.setVibrationPattern(new long[]{0, 180});
        nm.createNotificationChannel(chTasks);

        // Canal 3: Desconexion prolongada (>10 min)
        NotificationChannel chConn = new NotificationChannel(
                CHANNEL_CONNECTION,
                "Estado de ConexiÃ³n",
                NotificationManager.IMPORTANCE_HIGH
        );
        chConn.setDescription("Avisos si se pierde la conexion con la computadora por mas de 10 minutos");
        chConn.enableVibration(true);
        chConn.setVibrationPattern(VIBRATE_DISCONNECT);
        nm.createNotificationChannel(chConn);
    }

    private static int notificationIdForKey(String key) {
        return Math.abs(key.hashCode() % 10000) + 1000;
    }

    /**
     * Muestra notificacion de peticion de herramienta / permiso con botones Aceptar y Rechazar.
     */
    public static void notifyApproval(Context context, String key, String toolName, String headline, String detail) {
        if (!MainActivity.shouldShowNotification(context)) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        int notifId = notificationIdForKey(key);

        // Intent principal al tocar la notificacion: abre MainActivity
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context, notifId, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String bunkerUrl = MainActivity.getActiveBunkerUrl(context);

        // Accion Aceptar / Permitir
        Intent approveIntent = new Intent(context, NotificationActionReceiver.class);
        approveIntent.setAction(ACTION_APPROVE);
        approveIntent.putExtra(EXTRA_REQUEST_ID, key);
        approveIntent.putExtra(EXTRA_ACTION_TYPE, TYPE_TOOL_APPROVAL);
        approveIntent.putExtra(EXTRA_NOTIFICATION_ID, notifId);
        approveIntent.putExtra(EXTRA_BUNKER_URL, bunkerUrl);
        PendingIntent approvePending = PendingIntent.getBroadcast(
                context, notifId * 2 + 1, approveIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Accion Rechazar
        Intent rejectIntent = new Intent(context, NotificationActionReceiver.class);
        rejectIntent.setAction(ACTION_REJECT);
        rejectIntent.putExtra(EXTRA_REQUEST_ID, key);
        rejectIntent.putExtra(EXTRA_ACTION_TYPE, TYPE_TOOL_APPROVAL);
        rejectIntent.putExtra(EXTRA_NOTIFICATION_ID, notifId);
        rejectIntent.putExtra(EXTRA_BUNKER_URL, bunkerUrl);
        PendingIntent rejectPending = PendingIntent.getBroadcast(
                context, notifId * 2 + 2, rejectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String title = "DSH: AprobaciÃ³n requerida";
        if (toolName != null && !toolName.trim().isEmpty() && !toolName.equalsIgnoreCase("Harness")) {
            title = "AprobaciÃ³n: " + toolName;
        }

        String body = (headline != null && !headline.trim().isEmpty()) ? headline : "Una herramienta solicita confirmaciÃ³n";
        String fullText = body;
        if (detail != null && !detail.trim().isEmpty()) {
            fullText = body + "\n" + detail;
        }

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, CHANNEL_APPROVALS);
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
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#0EA5E9"))
                .addAction(new Notification.Action.Builder(0, "Aceptar", approvePending).build())
                .addAction(new Notification.Action.Builder(0, "Rechazar", rejectPending).build());

        nm.notify(notifId, builder.build());
    }

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

        String title = "Dispositivo pide acceso (CÃ³digo " + code + ")";
        String summary = address + " Â· " + (agent != null ? agent : "Dispositivo");

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
                .setStyle(new Notification.BigTextStyle().bigText("CÃ³digo en pantalla: " + code + "\n" + summary))
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setColor(Color.parseColor("#0EA5E9"))
                .addAction(new Notification.Action.Builder(0, "Autorizar", approvePending).build())
                .addAction(new Notification.Action.Builder(0, "Rechazar", rejectPending).build());

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
            notifTitle = "Respuesta lista Â· " + title;
        }

        String body = (preview != null && !preview.trim().isEmpty()) ? preview : "El trabajo de generaciÃ³n ha finalizado.";

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
        String title = "ConexiÃ³n perdida con " + target;
        String body = "Sin conexiÃ³n con DeepSeek Harness desde hace mÃ¡s de " + disconnectedMinutes + " minutos. Verifica que la PC y la red VPN sigan encendidas.";

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
                .setContentTitle("ActualizaciÃ³n disponible (v" + newVersion + ")")
                .setContentText("Toca para descargar e instalar la nueva versiÃ³n.")
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .setColor(Color.parseColor("#1F6FEB"));

        nm.notify(notifId, builder.build());
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
}
