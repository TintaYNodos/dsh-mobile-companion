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

import android.content.res.Configuration;
import android.view.Window;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Paleta de color y helpers visuales derivados del tema.
 */
class ThemePalette {
    static int themeMode(MainActivity a) {
        return a.prefs != null ? a.prefs.getInt("theme_mode", 0) : 0;
    }

    static boolean isDark(MainActivity a) {
        int m = ThemePalette.themeMode(a);
        if (m == 1) return true;
        if (m == 2) return false;
        return (a.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    static int dp(MainActivity a, float value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, a.getResources().getDisplayMetrics());
    }

    static int color(MainActivity a, int darkValue, int lightValue) {
        return ThemePalette.isDark(a) ? darkValue : lightValue;
    }

    static int surface(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#161B22"), Color.parseColor("#FFFFFF"));
    }

    static int raised(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#21262D"), Color.parseColor("#F6F8FA"));
    }

    static int outline(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#30363D"), Color.parseColor("#D0D7DE"));
    }

    static int ink(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#E6EDF3"), Color.parseColor("#1F2328"));
    }

    static int inkDim(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#8B949E"), Color.parseColor("#656D76"));
    }

    /** Acento DeepSeek oficial: azul DeepSeek sobre oscuro, azul intenso sobre claro. */
    static int accentInk(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#58A6FF"), Color.parseColor("#0969DA"));
    }

    static int accentPrimary(MainActivity a) {
        return ThemePalette.color(a, Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA"));
    }

    static GradientDrawable rounded(MainActivity a, int fill, int stroke, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setColor(fill);
        if (stroke != Color.TRANSPARENT) drawable.setStroke(ThemePalette.dp(a, 1), stroke);
        drawable.setCornerRadius(ThemePalette.dp(a, radiusDp));
        return drawable;
    }

    static void applySystemBarsTheme(MainActivity a) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = a.getWindow();
            if (window == null) return;
            boolean dark = ThemePalette.isDark(a);
            int barColor = dark ? Color.parseColor("#0A0E17") : Color.parseColor("#FFFFFF");
            window.setStatusBarColor(barColor);
            window.setNavigationBarColor(barColor);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                View decor = window.getDecorView();
                int flags = decor.getSystemUiVisibility();
                if (!dark) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                }
                decor.setSystemUiVisibility(flags);
            }
        }
    }
}
