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
 * Tarjeta de un equipo registrado dentro del panel.
 */
class PcCards {

    static View buildPcCard(MainActivity a, PcEntry pc, boolean active) {
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 11), ThemePalette.dp(a, 14), ThemePalette.dp(a, 11));

        int cardBg = active
                ? ThemePalette.color(a, Color.parseColor("#161F30"), Color.parseColor("#F0F6FF"))
                : ThemePalette.raised(a);
        int cardStroke = active
                ? ThemePalette.color(a, Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA"))
                : ThemePalette.outline(a);
        card.setBackground(ThemePalette.rounded(a, cardBg, cardStroke, 8f));

        LinearLayout topRow = new LinearLayout(a);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView head = new TextView(a);
        head.setText(pc.name);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f);
        head.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        head.setTextColor(active ? ThemePalette.ink(a) : ThemePalette.inkDim(a));
        LinearLayout.LayoutParams headParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        head.setLayoutParams(headParams);
        topRow.addView(head);

        TextView badge = new TextView(a);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f);
        badge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        badge.setPadding(ThemePalette.dp(a, 6), ThemePalette.dp(a, 2), ThemePalette.dp(a, 6), ThemePalette.dp(a, 2));
        if (active) {
            badge.setText("Activo");
            badge.setTextColor(ThemePalette.color(a, Color.parseColor("#58A6FF"), Color.parseColor("#0969DA")));
            badge.setBackground(ThemePalette.rounded(a, 
                    ThemePalette.color(a, Color.parseColor("#1C2D4A"), Color.parseColor("#DDF4FF")),
                    Color.TRANSPARENT, 4f));
        } else {
            badge.setText("En espera");
            badge.setTextColor(ThemePalette.inkDim(a));
            badge.setBackground(ThemePalette.rounded(a, 
                    ThemePalette.color(a, Color.parseColor("#21262D"), Color.parseColor("#EAEFF5")),
                    Color.TRANSPARENT, 4f));
        }
        topRow.addView(badge);
        card.addView(topRow);

        String displayAddress = pc.url.replaceFirst("^https?://", "").replaceAll("/+$", "");
        TextView detail = new TextView(a);
        detail.setText(displayAddress);
        detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        detail.setTypeface(android.graphics.Typeface.MONOSPACE);
        detail.setTextColor(active ? ThemePalette.color(a, Color.parseColor("#79C0FF"), Color.parseColor("#0969DA")) : ThemePalette.inkDim(a));
        detail.setPadding(0, ThemePalette.dp(a, 4), 0, 0);
        card.addView(detail);

        if (pc.macAddress != null && !pc.macAddress.trim().isEmpty() && (a.state != STATE_ONLINE || !active)) {
            Button btnWol = UiKit.actionCompact(a, "Encender PC (Red local)", true, () -> {
                a.sendWakeOnLan(pc.macAddress);
            });
            LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            wlp.topMargin = ThemePalette.dp(a, 6);
            btnWol.setLayoutParams(wlp);
            card.addView(btnWol);
        }

        card.setOnClickListener(v -> {
            PcRegistryStore.setActivePcId(a, pc.id);
            ConnectionController.connectTo(a, pc.url);
            HubSheet.dismissHub(a);
        });

        card.setOnLongClickListener(v -> {
            HubSheet.dismissHub(a);
            PcDialogs.openEditPcDialog(a, pc);
            return true;
        });

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = ThemePalette.dp(a, 6);
        card.setLayoutParams(params);
        return card;
    }
}
