/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Proveedor de widget de inicio 2x1 nativo con RemoteViews.
 * Muestra el estado de conexion, temperatura fisica y boton de accion rapida "Nuevo chat".
 */
public class CompanionWidget extends AppWidgetProvider {

    private static final String PREFS = "DshCompanionPrefs";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (context == null || appWidgetManager == null || appWidgetIds == null) return;
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        if (context == null || appWidgetManager == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        int slot = prefs.getInt("active_slot", 1);
        String pcName = prefs.getString(slot == 1 ? "bunker_name_1" : "bunker_name_2", "PC " + slot);
        if (pcName == null || pcName.trim().isEmpty()) {
            pcName = "PC " + slot;
        }

        int connState = prefs.getInt("connection_state", 1);
        String statusText;
        if (connState == 0) {
            statusText = "Conectado";
        } else if (connState == 1) {
            statusText = "Reconectando";
        } else {
            statusText = "Desconectado";
        }

        String titleLine = pcName + " - " + statusText;

        int tempC = prefs.getInt("stat_cpu_temp", 0);
        int cpuPercent = prefs.getInt("stat_cpu_percent", -1);

        String tempLine;
        if (tempC > 0 && cpuPercent >= 0) {
            tempLine = "CPU: " + cpuPercent + "% · Temp: " + tempC + "°C";
        } else if (tempC > 0) {
            tempLine = "Temperatura: " + tempC + "°C";
        } else if (cpuPercent >= 0) {
            tempLine = "CPU: " + cpuPercent + "%";
        } else {
            tempLine = "Temperatura: sin datos";
        }

        String pkg = context.getPackageName();
        int layoutId = context.getResources().getIdentifier("widget_companion", "layout", pkg);
        if (layoutId == 0) return;

        RemoteViews views = new RemoteViews(pkg, layoutId);

        int titleId = context.getResources().getIdentifier("widget_title", "id", pkg);
        int subtitleId = context.getResources().getIdentifier("widget_subtitle", "id", pkg);
        int btnId = context.getResources().getIdentifier("widget_btn_new_chat", "id", pkg);
        int textContainerId = context.getResources().getIdentifier("widget_text_container", "id", pkg);

        if (titleId != 0) {
            views.setTextViewText(titleId, titleLine);
        }
        if (subtitleId != 0) {
            views.setTextViewText(subtitleId, tempLine);
        }

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        // Boton "Nuevo chat": abre MainActivity con extra shortcut_action = "new_chat"
        if (btnId != 0) {
            Intent newChatIntent = new Intent(context, MainActivity.class);
            newChatIntent.setAction(Intent.ACTION_VIEW);
            newChatIntent.putExtra("shortcut_action", "new_chat");
            newChatIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            // P18: el atajo debe ir firmado para que MainActivity lo acepte.
            IntentGuard.sign(context, newChatIntent);
            PendingIntent newChatPending = PendingIntent.getActivity(context, 201, newChatIntent, flags);
            views.setOnClickPendingIntent(btnId, newChatPending);
        }

        // Tocar texto o contenedor: abrir la app
        if (textContainerId != 0) {
            Intent mainIntent = new Intent(context, MainActivity.class);
            mainIntent.setAction(Intent.ACTION_MAIN);
            mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent mainPending = PendingIntent.getActivity(context, 202, mainIntent, flags);
            views.setOnClickPendingIntent(textContainerId, mainPending);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static void updateAllWidgets(Context context) {
        if (context == null) return;
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName widget = new ComponentName(context, CompanionWidget.class);
            int[] ids = manager.getAppWidgetIds(widget);
            if (ids != null && ids.length > 0) {
                for (int id : ids) {
                    updateAppWidget(context, manager, id);
                }
            }
        } catch (Throwable ignored) {
        }
    }
}
