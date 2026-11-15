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



import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Barra de progreso y banner de estado/aviso.
 */
class BannerUi {
    static void buildProgressBar(MainActivity a) {
        a.progressBar = new ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ThemePalette.dp(a, 2), Gravity.TOP);
        a.progressBar.setLayoutParams(params);
        a.progressBar.setMax(100);
        a.progressBar.setVisibility(View.GONE);
        a.root.addView(a.progressBar);
    }

    static void buildBanner(MainActivity a) {
        a.banner = new LinearLayout(a);
        a.banner.setOrientation(LinearLayout.VERTICAL);
        a.banner.setGravity(Gravity.CENTER_VERTICAL);
        a.banner.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 9), ThemePalette.dp(a, 14), ThemePalette.dp(a, 9));
        a.banner.setBackground(ThemePalette.rounded(a, 
                ThemePalette.color(a, Color.parseColor("#1E1A11"), Color.parseColor("#FEF6E7")),
                ThemePalette.color(a, Color.parseColor("#B45309"), Color.parseColor("#D97706")),
                9f));

        a.bannerText = new TextView(a);
        a.bannerText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        a.bannerText.setTextColor(ThemePalette.color(a, Color.parseColor("#FCD34D"), Color.parseColor("#92400E")));
        a.bannerText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        a.banner.addView(a.bannerText);

        a.bannerWolButton = new Button(a);
        a.bannerWolButton.setText("Encender PC (Red local)");
        a.bannerWolButton.setAllCaps(false);
        a.bannerWolButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        a.bannerWolButton.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        a.bannerWolButton.setTextColor(Color.WHITE);
        a.bannerWolButton.setBackground(ThemePalette.rounded(a, Color.parseColor("#D97706"), Color.TRANSPARENT, 6f));
        a.bannerWolButton.setPadding(ThemePalette.dp(a, 10), ThemePalette.dp(a, 6), ThemePalette.dp(a, 10), ThemePalette.dp(a, 6));
        a.bannerWolButton.setVisibility(View.GONE);
        LinearLayout.LayoutParams wolLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wolLp.topMargin = ThemePalette.dp(a, 6);
        a.bannerWolButton.setLayoutParams(wolLp);
        a.banner.addView(a.bannerWolButton);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        params.setMargins(ThemePalette.dp(a, 10), ThemePalette.dp(a, 10), ThemePalette.dp(a, 10), 0);
        a.banner.setLayoutParams(params);
        a.banner.setVisibility(View.GONE);
        a.banner.setAlpha(0f);
        a.root.addView(a.banner);
    }

    static void showBanner(MainActivity a, String message) {
        a.bannerText.setText(message);
        a.banner.setContentDescription(message);
        a.banner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);

        PcEntry activePc = PcRegistryStore.getActivePc(a);
        if (activePc != null && activePc.macAddress != null && !activePc.macAddress.trim().isEmpty()) {
            a.bannerWolButton.setVisibility(View.VISIBLE);
            a.bannerWolButton.setOnClickListener(v -> a.sendWakeOnLan(activePc.macAddress));
        } else {
            a.bannerWolButton.setVisibility(View.GONE);
        }

        if (a.banner.getVisibility() != View.VISIBLE) {
            a.banner.setVisibility(View.VISIBLE);
            a.banner.animate().alpha(1f).setDuration(180).start();
            a.banner.announceForAccessibility(message);
        }
    }

    static void hideBanner(MainActivity a) {
        if (a.banner.getVisibility() != View.VISIBLE) return;
        a.banner.animate().alpha(0f).setDuration(160).withEndAction(() -> {
            a.banner.setVisibility(View.GONE);
            a.bannerWolButton.setVisibility(View.GONE);
        }).start();
    }
}
