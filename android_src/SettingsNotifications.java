/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Seccion NOTIFICACIONES del dialogo de Ajustes: aviso maestro, avisos de la
 * PC, configuracion del vigilante, pruebas de la cadena de avisos y arranque
 * tras reiniciar el telefono.
 */
class SettingsNotifications {

    static void addSection(MainActivity a, LinearLayout form) {
        form.addView(UiKit.sectionHeader(a, "NOTIFICACIONES"));
        LinearLayout notifCard = new LinearLayout(a);
        notifCard.setOrientation(LinearLayout.HORIZONTAL);
        notifCard.setGravity(Gravity.CENTER_VERTICAL);
        notifCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        notifCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout notifText = new LinearLayout(a);
        notifText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams ntParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        notifText.setLayoutParams(ntParams);

        TextView notifTitle = new TextView(a);
        notifTitle.setText("Notificaciones del sistema");
        notifTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        notifTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        notifTitle.setTextColor(ThemePalette.ink(a));
        notifText.addView(notifTitle);

        TextView notifDesc = new TextView(a);
        notifDesc.setText("Avisos de herramientas, pausas y estado");
        notifDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        notifDesc.setTextColor(ThemePalette.inkDim(a));
        notifText.addView(notifDesc);
        notifCard.addView(notifText);

        Switch swNotif = new Switch(a);
        swNotif.setChecked(a.prefs.getBoolean("notifications_master_enabled", true));
        swNotif.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean("notifications_master_enabled", checked).apply();
        });
        notifCard.addView(swNotif);
        LinearLayout.LayoutParams ncParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ncParams.bottomMargin = ThemePalette.dp(a, 14);
        notifCard.setLayoutParams(ncParams);
        form.addView(notifCard);

        form.addView(UiKit.settingSwitchCard(a,
                "Notificaciones de la PC",
                "Avisa al terminar una respuesta en la computadora, aunque la aplicación esté cerrada.",
                a.prefs.getBoolean(PcEventsService.PREF_ENABLED, false),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(PcEventsService.PREF_ENABLED, checked).apply();
                    if (checked) {
                        if (!NotificationGate.canPostNotifications(a)) NotificationGate.requestNotificationPermission(a);
                        PcEventsService.start(a);
                        Toast.makeText(a, "Avisos de la PC activados", Toast.LENGTH_SHORT).show();
                    } else {
                        // Con los avisos apagados, el arranque tras reiniciar el
                        // telefono tampoco vuelve a levantar el servicio.
                        PcEventsService.stop(a);
                        Toast.makeText(a, "Avisos de la PC desactivados", Toast.LENGTH_SHORT).show();
                    }
                }));

        // Vigilante del servicio: umbrales configurables. El servicio los relee
        // en cada tick (1 min), asi que un cambio aplica sin reiniciar nada. La
        // linea de estado muestra la configuracion vigente, la ultima conexion
        // buena y la ultima accion del watchdog; se refresca sola cada 10 s.
        TextView watchdogLine = new TextView(a);
        watchdogLine.setText(watchdogStatus(a));
        watchdogLine.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        watchdogLine.setTextColor(ThemePalette.inkDim(a));
        watchdogLine.setPadding(ThemePalette.dp(a, 4), 0, ThemePalette.dp(a, 4), ThemePalette.dp(a, 12));
        final Runnable refreshWatchdog = new Runnable() {
            @Override
            public void run() {
                if (!watchdogLine.isAttachedToWindow()) return; // el dialogo se cerro
                watchdogLine.setText(watchdogStatus(a));
                watchdogLine.postDelayed(this, 10_000L);
            }
        };

        form.addView(UiKit.settingSwitchCard(a,
                "Reiniciar el servicio si se cuelga",
                "Si la conexión se queda colgada, reconecta sola y avisa cuando no puede.",
                a.prefs.getBoolean(PrefKeys.KEY_PC_EVENTS_WATCHDOG, true),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(PrefKeys.KEY_PC_EVENTS_WATCHDOG, checked).apply();
                    watchdogLine.setText(watchdogStatus(a));
                }));

        addChoiceCard(a, form, PrefKeys.KEY_PC_EVENTS_WATCHDOG_STALE_MIN,
                "Silencio antes de reconectar",
                "Minutos sin ninguna señal del puente antes de cerrar y reabrir la conexión (3 por defecto).",
                new int[]{1, 3, 5}, new String[]{"1 min", "3 min", "5 min"},
                PrefKeys.PC_EVENTS_WATCHDOG_STALE_MIN_DEFAULT);

        addChoiceCard(a, form, PrefKeys.KEY_PC_EVENTS_WATCHDOG_RETRIES,
                "Reintentos antes de reiniciar",
                "Reconexiones seguidas que se dan por fallidas antes de reiniciar la escucha (2 por defecto).",
                new int[]{1, 2, 3}, new String[]{"1", "2", "3"},
                PrefKeys.PC_EVENTS_WATCHDOG_RETRIES_DEFAULT);

        form.addView(UiKit.settingSwitchCard(a,
                "Avisar si no recupera",
                "Si el reinicio tampoco recupera la conexión, muestra un aviso. Apagado sigue reintentando, en silencio.",
                a.prefs.getBoolean(PrefKeys.KEY_PC_EVENTS_WATCHDOG_ALERT, true),
                (view, checked) -> {
                    a.prefs.edit().putBoolean(PrefKeys.KEY_PC_EVENTS_WATCHDOG_ALERT, checked).apply();
                    watchdogLine.setText(watchdogStatus(a));
                }));

        Button btnProbeWatchdog = UiKit.actionCompact(a, "Probar ahora", false, () -> {
            Toast.makeText(a, probeWatchdogText(a), Toast.LENGTH_LONG).show();
            watchdogLine.setText(watchdogStatus(a));
        });
        LinearLayout.LayoutParams probeLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        probeLp.bottomMargin = ThemePalette.dp(a, 10);
        btnProbeWatchdog.setLayoutParams(probeLp);
        form.addView(btnProbeWatchdog);

        form.addView(watchdogLine);
        watchdogLine.postDelayed(refreshWatchdog, 10_000L);

        // Pruebas de la cadena de avisos: primero el aviso local (permiso y
        // canal), despues el recorrido completo hasta el puente. Sin esto, un
        // fallo solo se descubre cuando el chat termina y no suena nada.
        LinearLayout notifyTests = new LinearLayout(a);
        notifyTests.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams ntLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ntLp.bottomMargin = ThemePalette.dp(a, 10);
        notifyTests.setLayoutParams(ntLp);

        Button btnTestLocal = UiKit.actionCompact(a, "Probar aviso local", false, () -> {
            if (!NotificationGate.canPostNotifications(a)) {
                NotificationGate.requestNotificationPermission(a);
                Toast.makeText(a, "Concede el permiso de notificaciones y reintenta", Toast.LENGTH_LONG).show();
                return;
            }
            NotificationsPc.notifyPcResponse(a, "Prueba local");
            Toast.makeText(a, "Aviso enviado: revisa la barra de notificaciones", Toast.LENGTH_SHORT).show();
        });
        Button btnTestPc = UiKit.actionCompact(a, "Probar desde la PC", false, () -> {
            NotificationGate.sendPcEventTest(a);
        });
        LinearLayout.LayoutParams t1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        t1.setMarginEnd(ThemePalette.dp(a, 6));
        btnTestLocal.setLayoutParams(t1);
        notifyTests.addView(btnTestLocal);
        notifyTests.addView(btnTestPc);
        form.addView(notifyTests);

        // Los avisos "aunque la app este cerrada" dependen del servicio en primer
        // plano. Samsung y otros fabricantes lo matan si la app no esta exenta de
        // la optimizacion de bateria, y entonces el aviso deja de llegar sin que
        // nada lo indique. Aqui se pide la exencion con un toque.
        form.addView(UiKit.settingSwitchCard(a,
                "Permitir en segundo plano",
                "Evita que el telefono mate el servicio de avisos cuando la app esta cerrada.",
                isBatteryExempt(a),
                (view, checked) -> {
                    if (checked && !isBatteryExempt(a)) requestBatteryExemption(a);
                    else if (checked) Toast.makeText(a, "Ya esta exento de la optimizacion de bateria", Toast.LENGTH_SHORT).show();
                }));
    }

    /**
     * Tarjeta con una fila de opciones exclusivas (por ejemplo 1/3/5 min). El
     * valor elegido se guarda como entero en las preferencias y el servicio lo
     * aplica en el siguiente tick, sin reiniciar el servicio.
     */
    private static void addChoiceCard(MainActivity a, LinearLayout form, String prefKey, String title,
                                      String description, int[] values, String[] labels, int fallback) {
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        card.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.bottomMargin = ThemePalette.dp(a, 10);
        card.setLayoutParams(cardLp);

        TextView heading = new TextView(a);
        heading.setText(title);
        heading.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        heading.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        heading.setTextColor(ThemePalette.ink(a));
        card.addView(heading);

        TextView detail = new TextView(a);
        detail.setText(description);
        detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        detail.setTextColor(ThemePalette.inkDim(a));
        card.addView(detail);

        LinearLayout row = new LinearLayout(a);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, ThemePalette.dp(a, 8), 0, 0);
        final Button[] buttons = new Button[values.length];
        final Runnable repaint = () -> {
            int current = a.prefs.getInt(prefKey, fallback);
            for (int i = 0; i < buttons.length; i++) styleChoice(a, buttons[i], values[i] == current);
        };
        for (int i = 0; i < values.length; i++) {
            final int value = values[i];
            final String label = labels[i];
            Button button = UiKit.actionCompact(a, label, false, () -> {
                a.prefs.edit().putInt(prefKey, value).apply();
                repaint.run();
                Toast.makeText(a, title + ": " + label, Toast.LENGTH_SHORT).show();
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            lp.setMarginEnd(ThemePalette.dp(a, i < values.length - 1 ? 6 : 0));
            button.setLayoutParams(lp);
            buttons[i] = button;
            row.addView(button);
        }
        repaint.run();
        card.addView(row);
        form.addView(card);
    }

    /** Pinta un boton de opcion: color de acento si esta elegido, tarjeta si no. */
    private static void styleChoice(MainActivity a, Button button, boolean selected) {
        button.setTextColor(selected ? Color.WHITE : ThemePalette.ink(a));
        button.setBackground(selected
                ? ThemePalette.rounded(a, ThemePalette.accentPrimary(a), Color.TRANSPARENT, 8f)
                : ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));
    }

    /** "Probar ahora": comprobacion inmediata del vigilante y su resultado. */
    static String probeWatchdogText(MainActivity a) {
        WatchdogPolicy.Action action = PcEventsService.probeNow(a);
        if (action == null) {
            if (!PcEventsService.isEnabled(a)) return "Activa «Notificaciones de la PC» para probar el vigilante.";
            if (!PcEventsService.isWatchdogEnabled(a)) return "El vigilante está desactivado: activa «Reiniciar el servicio si se cuelga».";
            // Habilitado pero sin escucha (el sistema lo mató, por ejemplo): no
            // hay nada sano que reiniciar, así que se arranca desde aquí mismo.
            try {
                PcEventsService.start(a);
                return "El servicio de avisos no estaba escuchando; se arrancó de nuevo.";
            } catch (Throwable error) {
                return "El servicio de avisos no está escuchando: abre la app y reintenta.";
            }
        }
        switch (action) {
            case OK:
                return "Vigilante: la escucha está sana, sin cambios.";
            case RECONNECT:
                return "Vigilante: la escucha estaba callada; se reconectó el flujo.";
            case RESTART:
                return "Vigilante: no recuperaba; se reinició la escucha.";
            default:
                return "Vigilante: no se pudo recuperar; se avisó de que los avisos están detenidos.";
        }
    }

    /**
     * Línea de estado del vigilante: configuración vigente, última conexión
     * correcta y última acción del watchdog (reconexión, reinicio o aviso). Se
     * refresca sola mientras el diálogo está abierto.
     */
    static String watchdogStatus(MainActivity a) {
        long now = System.currentTimeMillis();
        long lastOk = a.prefs.getLong(PrefKeys.KEY_PC_EVENTS_LAST_OK, 0L);
        String lastConnection = lastOk > 0L
                ? "Última conexión: " + WatchdogPolicy.describeAge(now, lastOk)
                : "Última conexión: ninguna todavía";
        WatchdogPolicy configured = PrefKeys.watchdogPolicy(a.prefs);
        String config = "silencio " + (configured.staleMs() / 60_000L) + " min · "
                + configured.maxFailedReconnects() + " reintentos · "
                + (configured.alertEnabled() ? "avisa" : "sin aviso");

        String watchdogText;
        if (!PcEventsService.isEnabled(a)) {
            watchdogText = "watchdog inactivo (avisos de la PC apagados)";
        } else if (!a.prefs.getBoolean(PrefKeys.KEY_PC_EVENTS_WATCHDOG, true)) {
            watchdogText = "watchdog desactivado";
        } else if (!PcEventsService.isRunning()) {
            watchdogText = "watchdog detenido (escucha apagada)";
        } else {
            String note = a.prefs.getString(PrefKeys.KEY_PC_EVENTS_WATCHDOG_NOTE, "");
            long noteAt = a.prefs.getLong(PrefKeys.KEY_PC_EVENTS_WATCHDOG_NOTE_AT, 0L);
            watchdogText = note != null && !note.isEmpty() && noteAt > 0L
                    ? "watchdog: " + note + " " + WatchdogPolicy.describeAge(now, noteAt)
                    : "watchdog vigilando, sin incidencias";
        }
        return lastConnection + " · " + config + " · " + watchdogText;
    }

    static boolean isBatteryExempt(MainActivity a) {
        try {
            PowerManager pm = (PowerManager) a.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(a.getPackageName());
        } catch (Throwable ignored) {
            return false;
        }
    }

    static void requestBatteryExemption(MainActivity a) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + a.getPackageName()));
            a.startActivity(intent);
            Toast.makeText(a, "Acepta la exencion para que los avisos no se corten", Toast.LENGTH_LONG).show();
        } catch (Throwable error) {
            try {
                a.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Throwable ignored) {
                Toast.makeText(a, "Abre Ajustes del sistema y exime esta app de la bateria", Toast.LENGTH_LONG).show();
            }
        }
    }
}
