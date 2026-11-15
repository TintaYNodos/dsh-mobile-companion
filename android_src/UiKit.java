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

import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import android.view.WindowManager;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Constructores de widgets y estilo comun de dialogos.
 */
class UiKit {
    static TextView sectionHeader(MainActivity a, String text) {
        TextView label = new TextView(a);
        label.setText(text);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
        label.setLetterSpacing(0.08f);
        label.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        label.setTextColor(ThemePalette.accentInk(a));
        label.setPadding(0, ThemePalette.dp(a, 12), 0, ThemePalette.dp(a, 5));
        return label;
    }

    /**
     * Tarjeta de ajuste con titulo, descripcion e interruptor. El interruptor
     * lleva contentDescription para que TalkBack anuncie de que ajuste se trata.
     */
    static LinearLayout settingSwitchCard(MainActivity a, String title, String description, boolean checked,
                                           android.widget.CompoundButton.OnCheckedChangeListener onChange) {
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        card.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout column = new LinearLayout(a);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView heading = new TextView(a);
        heading.setText(title);
        heading.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        heading.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        heading.setTextColor(ThemePalette.ink(a));
        column.addView(heading);

        TextView detail = new TextView(a);
        detail.setText(description);
        detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        detail.setTextColor(ThemePalette.inkDim(a));
        column.addView(detail);
        card.addView(column);

        Switch toggle = new Switch(a);
        toggle.setChecked(checked);
        toggle.setContentDescription(title);
        toggle.setOnCheckedChangeListener(onChange);
        card.addView(toggle);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = ThemePalette.dp(a, 10);
        card.setLayoutParams(params);
        return card;
    }

    static TextView sectionLabel(MainActivity a, String text) {
        return UiKit.sectionHeader(a, text);
    }

    static EditText field(MainActivity a, String hint, String value) {
        EditText input = new EditText(a);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(true);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        input.setTextColor(ThemePalette.ink(a));
        input.setHintTextColor(ThemePalette.color(a, Color.parseColor("#484F58"), Color.parseColor("#8C959F")));
        input.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));
        input.setPadding(ThemePalette.dp(a, 12), ThemePalette.dp(a, 11), ThemePalette.dp(a, 12), ThemePalette.dp(a, 11));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = ThemePalette.dp(a, 8);
        input.setLayoutParams(params);
        return input;
    }

    static Button actionCompact(MainActivity a, String label, boolean primary, Runnable onClick) {
        Button button = new Button(a);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        button.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        if (primary) {
            button.setTextColor(Color.WHITE);
            button.setBackground(ThemePalette.rounded(a, ThemePalette.accentPrimary(a), Color.TRANSPARENT, 8f));
        } else {
            button.setTextColor(ThemePalette.ink(a));
            button.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));
        }
        button.setPadding(ThemePalette.dp(a, 12), ThemePalette.dp(a, 10), ThemePalette.dp(a, 12), ThemePalette.dp(a, 10));
        button.setOnClickListener(v -> onClick.run());
        return button;
    }

    static Button action(MainActivity a, String label, int style, Runnable onClick) {
        Button button = new Button(a);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        button.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        if (style == 1) { // Primary DeepSeek Blue
            button.setTextColor(Color.WHITE);
            button.setBackground(ThemePalette.rounded(a, 
                    ThemePalette.accentPrimary(a),
                    Color.TRANSPARENT, 8f));
        } else if (style == 3) { // Special / Update APK
            button.setTextColor(ThemePalette.accentInk(a));
            button.setBackground(ThemePalette.rounded(a, 
                    ThemePalette.color(a, Color.parseColor("#131D2E"), Color.parseColor("#F0F6FF")),
                    ThemePalette.color(a, Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA")), 8f));
        } else if (style == 4) { // Up to date / Sistema al día
            button.setTextColor(ThemePalette.color(a, Color.parseColor("#3FB950"), Color.parseColor("#1A7F37")));
            button.setBackground(ThemePalette.rounded(a, 
                    ThemePalette.color(a, Color.parseColor("#0D1D16"), Color.parseColor("#EAFBEA")),
                    ThemePalette.color(a, Color.parseColor("#238636"), Color.parseColor("#2DA44E")), 8f));
        } else { // Secondary Surface Card
            button.setTextColor(ThemePalette.ink(a));
            button.setBackground(ThemePalette.rounded(a, 
                    ThemePalette.raised(a),
                    ThemePalette.outline(a), 8f));
        }
        button.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 11), ThemePalette.dp(a, 14), ThemePalette.dp(a, 11));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = ThemePalette.dp(a, 6);
        button.setLayoutParams(params);

        button.setOnClickListener(v -> onClick.run());
        return button;
    }

    static void styleDialog(MainActivity a, AlertDialog dialog) {
        if (dialog == null) return;
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(ThemePalette.surface(a)));
            }
            try {
                int titleId = a.getResources().getIdentifier("alertTitle", "id", "android");
                if (titleId > 0) {
                    TextView tv = dialog.findViewById(titleId);
                    if (tv != null) {
                        tv.setTextColor(ThemePalette.ink(a));
                        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15.5f);
                        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                }
                int msgId = a.getResources().getIdentifier("message", "id", "android");
                if (msgId > 0) {
                    TextView msg = dialog.findViewById(msgId);
                    if (msg != null) {
                        msg.setTextColor(ThemePalette.ink(a));
                    }
                }
                Button pos = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
                if (pos != null) {
                    pos.setTextColor(ThemePalette.accentInk(a));
                    pos.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                }
                Button neg = dialog.getButton(AlertDialog.BUTTON_NEGATIVE);
                if (neg != null) {
                    neg.setTextColor(ThemePalette.inkDim(a));
                    neg.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                }
                Button neu = dialog.getButton(AlertDialog.BUTTON_NEUTRAL);
                if (neu != null) {
                    neu.setTextColor(Color.parseColor("#EF4444"));
                    neu.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                }
            } catch (Throwable ignored) {}
        });
    }
}
