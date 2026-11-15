/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

import java.util.Locale;
import android.view.WindowManager;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Tarjetas de telemetria, consola cruda y prevencion de suspension.
 */
class SystemCards {
    static View buildTelemetryCard(MainActivity a) {
        int cpuPercent = a.prefs.getInt("stat_cpu_percent", -1);
        if (cpuPercent < 0) return null;

        int tempC = a.prefs.getInt("stat_cpu_temp", 0);
        float ramUsed = a.prefs.getFloat("stat_ram_used", 0);
        float ramTotal = a.prefs.getFloat("stat_ram_total", 0);
        int ramPercent = a.prefs.getInt("stat_ram_percent", 0);
        float diskFree = a.prefs.getFloat("stat_disk_free", 0);
        String uptime = a.prefs.getString("stat_uptime", "");

        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 11), ThemePalette.dp(a, 14), ThemePalette.dp(a, 11));
        card.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout top = new LinearLayout(a);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        TextView label = new TextView(a);
        label.setText("TELEMETRÍA PC 1" + (uptime.isEmpty() ? "" : " · " + uptime));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
        label.setLetterSpacing(0.06f);
        label.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        label.setTextColor(ThemePalette.accentInk(a));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        label.setLayoutParams(lp);
        top.addView(label);

        if (tempC > 0) {
            TextView tempBadge = new TextView(a);
            tempBadge.setText(tempC + "°C");
            tempBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
            tempBadge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            tempBadge.setTextColor(tempC > 80 ? Color.parseColor("#F87171") : ThemePalette.accentInk(a));
            top.addView(tempBadge);
        }
        card.addView(top);

        TextView row1 = new TextView(a);
        String cpuText = "CPU: " + cpuPercent + "%" + (tempC > 0 ? " (" + tempC + "°C)" : "");
        String ramText = "RAM: " + String.format(Locale.US, "%.1f", ramUsed) + "/" + String.format(Locale.US, "%.1f", ramTotal) + " GB (" + ramPercent + "%)";
        row1.setText(cpuText + "  ·  " + ramText);
        row1.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        row1.setTypeface(android.graphics.Typeface.MONOSPACE);
        row1.setTextColor(ThemePalette.ink(a));
        row1.setPadding(0, ThemePalette.dp(a, 3), 0, 0);
        card.addView(row1);

        if (diskFree > 0) {
            TextView row2 = new TextView(a);
            row2.setText("Disco C: " + String.format(Locale.US, "%.0f", diskFree) + " GB libres");
            row2.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
            row2.setTypeface(android.graphics.Typeface.MONOSPACE);
            row2.setTextColor(ThemePalette.inkDim(a));
            row2.setPadding(0, ThemePalette.dp(a, 2), 0, 0);
            card.addView(row2);
        }

        card.setClickable(true);
        card.setFocusable(true);

        final TextView hint = new TextView(a);
        hint.setText("Toca para ver datos crudos de hardware");
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f);
        hint.setTextColor(ThemePalette.accentInk(a));
        hint.setPadding(0, ThemePalette.dp(a, 4), 0, 0);
        card.addView(hint);

        final LinearLayout chartContainer = new LinearLayout(a);
        chartContainer.setOrientation(LinearLayout.VERTICAL);
        chartContainer.setVisibility(View.GONE);
        chartContainer.setPadding(0, ThemePalette.dp(a, 8), 0, ThemePalette.dp(a, 2));

        final View rawConsole = SystemCards.buildRawTelemetryConsole(a);
        chartContainer.addView(rawConsole);

        final TelemetryChartView chartView = new TelemetryChartView(a);
        LinearLayout.LayoutParams chartLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ThemePalette.dp(a, 54));
        chartLp.topMargin = ThemePalette.dp(a, 8);
        chartView.setLayoutParams(chartLp);
        chartContainer.addView(chartView);
        card.addView(chartContainer);

        card.setOnClickListener(v -> {
            boolean showing = chartContainer.getVisibility() == View.VISIBLE;
            if (showing) {
                chartContainer.setVisibility(View.GONE);
                hint.setText("Toca para ver datos crudos de hardware");
            } else {
                int bLevel = a.prefs != null ? a.prefs.getInt("stat_battery_level", -1) : -1;
                boolean bAc = a.prefs != null && a.prefs.getBoolean("stat_battery_ac", false);
                chartView.setBatteryInfo(bLevel, bAc);
                chartView.setData(TelemetryStore.getTelemetryHistory(a.prefs));
                chartContainer.setVisibility(View.VISIBLE);
                hint.setText("Toca para ocultar desglose");
            }
        });

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = ThemePalette.dp(a, 8);
        card.setLayoutParams(params);
        return card;
    }

    static View buildRawTelemetryConsole(MainActivity a) {
        LinearLayout console = new LinearLayout(a);
        console.setOrientation(LinearLayout.VERTICAL);
        console.setPadding(ThemePalette.dp(a, 12), ThemePalette.dp(a, 10), ThemePalette.dp(a, 12), ThemePalette.dp(a, 10));
        console.setBackground(ThemePalette.rounded(a, Color.parseColor("#0A0E17"), ThemePalette.outline(a), 6f));

        String model = a.prefs.getString("stat_cpu_model", "AMD Ryzen 7 5700U with Radeon Graphics");
        int cores = a.prefs.getInt("stat_cpu_cores", 16);
        int cpu = a.prefs.getInt("stat_cpu_percent", 0);
        int temp = a.prefs.getInt("stat_cpu_temp", 0);

        float ramUsed = a.prefs.getFloat("stat_ram_used", 0);
        float ramTotal = a.prefs.getFloat("stat_ram_total", 0);
        int ramPercent = a.prefs.getInt("stat_ram_percent", 0);
        float ramFree = Math.max(0, ramTotal - ramUsed);

        float diskUsed = a.prefs.getFloat("stat_disk_used", 0);
        float diskTotal = a.prefs.getFloat("stat_disk_total", 0);
        float diskFree = a.prefs.getFloat("stat_disk_free", 0);
        int diskPercent = a.prefs.getInt("stat_disk_percent", 0);

        int batLevel = a.prefs.getInt("stat_battery_level", -1);
        boolean batAc = a.prefs.getBoolean("stat_battery_ac", false);
        String batStatus = a.prefs.getString("stat_battery_status", batAc ? "Enchufado (AC)" : "En batería");

        String uptime = a.prefs.getString("stat_uptime", "");
        String activeHost = a.activeUrl.isEmpty() ? PcRegistryStore.urlForSlot(a, 1) : a.activeUrl;

        console.addView(SystemCards.rawSectionHeader(a, "PROCESADOR"));
        console.addView(SystemCards.rawItem(a, "Modelo", model));
        console.addView(SystemCards.rawItem(a, "Núcleos", cores > 0 ? cores + " hilos de ejecución" : "Multi-core"));
        console.addView(SystemCards.rawItem(a, "Carga / Temp", cpu + "% en uso · " + (temp > 0 ? temp + "°C ACPI" : "Sin sensor")));

        console.addView(SystemCards.rawSectionHeader(a, "MEMORIA RAM"));
        console.addView(SystemCards.rawItem(a, "Uso actual", String.format(Locale.US, "%.1f GB de %.1f GB (%d%%)", ramUsed, ramTotal, ramPercent)));
        console.addView(SystemCards.rawItem(a, "Disponible", String.format(Locale.US, "%.1f GB libres para DSH", ramFree)));

        if (diskTotal > 0 || diskFree > 0) {
            console.addView(SystemCards.rawSectionHeader(a, "ALMACENAMIENTO C"));
            console.addView(SystemCards.rawItem(a, "Capacidad", String.format(Locale.US, "%.1f GB totales · %d%% en uso", diskTotal, diskPercent)));
            console.addView(SystemCards.rawItem(a, "Espacio libre", String.format(Locale.US, "%.1f GB libres (NTFS)", diskFree)));
        }

        if (batLevel >= 0) {
            console.addView(SystemCards.rawSectionHeader(a, "ENERGÍA"));
            console.addView(SystemCards.rawItem(a, "Batería", batLevel + "% · " + (batAc ? "Corriente alterna (AC)" : "En batería")));
        }

        console.addView(SystemCards.rawSectionHeader(a, "SISTEMA & ENLACE"));
        if (!uptime.isEmpty()) console.addView(SystemCards.rawItem(a, "Encendido", uptime + " ininterrumpido"));
        console.addView(SystemCards.rawItem(a, "Dirección", activeHost));

        return console;
    }

    static TextView rawSectionHeader(MainActivity a, String title) {
        TextView tv = new TextView(a);
        tv.setText(title);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 9.5f);
        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        tv.setLetterSpacing(0.08f);
        // El panel crudo tiene fondo oscuro fijo: los colores deben ser claros
        // siempre. Con los del tema, en modo claro el texto quedaba casi negro
        // sobre negro y no se leía.
        tv.setTextColor(Color.parseColor("#7DD3FC"));
        tv.setPadding(0, ThemePalette.dp(a, 6), 0, ThemePalette.dp(a, 1));
        return tv;
    }

    static TextView rawItem(MainActivity a, String label, String value) {
        TextView tv = new TextView(a);
        tv.setText("• " + label + ": " + value);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        tv.setTypeface(android.graphics.Typeface.MONOSPACE);
        tv.setTextColor(Color.parseColor("#D6DEEB"));
        tv.setPadding(0, ThemePalette.dp(a, 1), 0, ThemePalette.dp(a, 1));
        return tv;
    }

    static View buildKeepAwakeCard(MainActivity a) {
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        card.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout textCol = new LinearLayout(a);
        textCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        textCol.setLayoutParams(tParams);

        TextView title = new TextView(a);
        title.setText("Prevenir suspensión");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setTextColor(ThemePalette.ink(a));
        textCol.addView(title);

        TextView desc = new TextView(a);
        desc.setText("Evita que el sistema suspenda el WebSocket");
        desc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        desc.setTextColor(ThemePalette.inkDim(a));
        desc.setPadding(0, ThemePalette.dp(a, 1), 0, 0);
        textCol.addView(desc);

        card.addView(textCol);

        Switch keepAwake = new Switch(a);
        keepAwake.setChecked(a.prefs.getBoolean(KEY_KEEP_SCREEN, true));
        keepAwake.setOnCheckedChangeListener((buttonView, checked) -> {
            a.prefs.edit().putBoolean(KEY_KEEP_SCREEN, checked).apply();
            if (checked) {
                a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        card.addView(keepAwake);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = ThemePalette.dp(a, 4);
        card.setLayoutParams(params);
        return card;
    }
}
