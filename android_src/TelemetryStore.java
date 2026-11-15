/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
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
import java.util.ArrayList;
import java.util.List;


import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Historial de telemetria usado por el panel y el grafico.
 */
/** Historial corto de telemetria leida del puente (compartido con el widget). */
class TelemetryStore {

    private static final List<MainActivity.TelemetryPoint> HISTORY = new ArrayList<>();

    static synchronized void recordTelemetryPoint(int cpuPercent, int tempC, int ramPercent) {
        HISTORY.add(new MainActivity.TelemetryPoint(System.currentTimeMillis(), cpuPercent, tempC, ramPercent));
        while (HISTORY.size() > MAX_TELEMETRY_HISTORY) {
            HISTORY.remove(0);
        }
    }

    static synchronized List<MainActivity.TelemetryPoint> getTelemetryHistory(SharedPreferences prefs) {
        if (HISTORY.isEmpty() && prefs != null) {
            int cpu = prefs.getInt("stat_cpu_percent", -1);
            int temp = prefs.getInt("stat_cpu_temp", 0);
            int ram = prefs.getInt("stat_ram_percent", 0);
            if (cpu >= 0) {
                HISTORY.add(new MainActivity.TelemetryPoint(System.currentTimeMillis() - 15000, cpu, temp, ram));
                HISTORY.add(new MainActivity.TelemetryPoint(System.currentTimeMillis(), cpu, temp, ram));
            }
        }
        return new ArrayList<>(HISTORY);
    }

    private TelemetryStore() {}
}
