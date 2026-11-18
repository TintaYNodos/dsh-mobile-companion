/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
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
    static int themeMode(Activity a) {
        if (a == null) return 0;
        return a.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("theme_mode", 0);
    }

    static boolean isDark(Activity a) {
        int m = ThemePalette.themeMode(a);
        if (m == 1) return true;
        if (m == 2) return false;
        return (a.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    static int dp(Activity a, float value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, a.getResources().getDisplayMetrics());
    }

    static int color(Activity a, int darkValue, int lightValue) {
        return ThemePalette.isDark(a) ? darkValue : lightValue;
    }

    static int surface(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#161B22"), Color.parseColor("#FFFFFF"));
    }

    static int raised(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#21262D"), Color.parseColor("#F6F8FA"));
    }

    static int outline(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#30363D"), Color.parseColor("#D0D7DE"));
    }

    static int ink(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#E6EDF3"), Color.parseColor("#1F2328"));
    }

    static int inkDim(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#8B949E"), Color.parseColor("#656D76"));
    }

    /** Acento de la marca: azul claro sobre oscuro, azul intenso sobre claro. */
    static int accentInk(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#58A6FF"), Color.parseColor("#0969DA"));
    }

    static int accentPrimary(Activity a) {
        return ThemePalette.color(a, Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA"));
    }

    /**
     * Rojo de peligro con contraste AA (>= 4,5:1) medido en los dos temas.
     *
     * El #EF4444 anterior daba 4,04:1 sobre #21262D y 3,53:1 sobre #F6F8FA
     * (por debajo de AA a 13 sp). En oscuro se aclara y en claro se oscurece:
     *   - #FF7B72 sobre raised #21262D = 6,04:1 y sobre surface #161B22 = 6,86:1
     *   - #D1242F sobre raised #F6F8FA = 4,93:1 y sobre surface #FFFFFF = 5,24:1
     * Los ratios los comprueba `ThemeContrastTest` (Java) y
     * `test/verify_client_ux.mjs` (estatico, leyendo estas constantes).
     */
    static final int DANGER_DARK = 0xFFFF7B72;
    static final int DANGER_LIGHT = 0xFFD1242F;

    static int danger(Activity a) {
        return ThemePalette.color(a, DANGER_DARK, DANGER_LIGHT);
    }

    static GradientDrawable rounded(Activity a, int fill, int stroke, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setColor(fill);
        if (stroke != Color.TRANSPARENT) drawable.setStroke(ThemePalette.dp(a, 1), stroke);
        drawable.setCornerRadius(ThemePalette.dp(a, radiusDp));
        return drawable;
    }

    static void applySystemBarsTheme(Activity a) {
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
