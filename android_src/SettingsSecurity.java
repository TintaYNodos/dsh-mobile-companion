/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Seccion SEGURIDAD BIOMETRICA del dialogo de Ajustes: bloqueo por huella,
 * doble biometria en acciones criticas y bloqueo de capturas.
 */
class SettingsSecurity {

    static void addSection(MainActivity a, LinearLayout form) {
        form.addView(UiKit.sectionHeader(a, "SEGURIDAD BIOMÉTRICA"));
        LinearLayout bioCard = new LinearLayout(a);
        bioCard.setOrientation(LinearLayout.HORIZONTAL);
        bioCard.setGravity(Gravity.CENTER_VERTICAL);
        bioCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        bioCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout bioText = new LinearLayout(a);
        bioText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams btParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bioText.setLayoutParams(btParams);

        TextView bioTitle = new TextView(a);
        bioTitle.setText("Bloquear con huella digital");
        bioTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        bioTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bioTitle.setTextColor(ThemePalette.ink(a));
        bioText.addView(bioTitle);

        TextView bioDesc = new TextView(a);
        bioDesc.setText("Pide confirmación biométrica al abrir la app");
        bioDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        bioDesc.setTextColor(ThemePalette.inkDim(a));
        bioText.addView(bioDesc);
        bioCard.addView(bioText);

        Switch swBio = new Switch(a);
        swBio.setChecked(a.prefs.getBoolean("biometric_lock_enabled", false));
        bioCard.addView(swBio);
        LinearLayout.LayoutParams bcParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bcParams.bottomMargin = ThemePalette.dp(a, 8);
        bioCard.setLayoutParams(bcParams);
        form.addView(bioCard);

        LinearLayout bioCritCard = new LinearLayout(a);
        bioCritCard.setOrientation(LinearLayout.HORIZONTAL);
        bioCritCard.setGravity(Gravity.CENTER_VERTICAL);
        bioCritCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        bioCritCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout bioCritText = new LinearLayout(a);
        bioCritText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams bctParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bioCritText.setLayoutParams(bctParams);

        TextView bioCritTitle = new TextView(a);
        bioCritTitle.setText("Doble biometría en acciones críticas");
        bioCritTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        bioCritTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bioCritTitle.setTextColor(ThemePalette.ink(a));
        bioCritText.addView(bioCritTitle);

        TextView bioCritDesc = new TextView(a);
        bioCritDesc.setText("Pide huella para autorizar herramientas de riesgo en la PC");
        bioCritDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        bioCritDesc.setTextColor(ThemePalette.inkDim(a));
        bioCritText.addView(bioCritDesc);
        bioCritCard.addView(bioCritText);

        Switch swBioCrit = new Switch(a);
        swBioCrit.setChecked(a.prefs.getBoolean("biometric_critical_actions_enabled", true));
        swBioCrit.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean("biometric_critical_actions_enabled", checked).apply();
            Toast.makeText(a, checked ? "Doble biometría activada" : "Doble biometría desactivada", Toast.LENGTH_SHORT).show();
        });
        bioCritCard.addView(swBioCrit);
        LinearLayout.LayoutParams bccParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bccParams.bottomMargin = ThemePalette.dp(a, 14);
        bioCritCard.setLayoutParams(bccParams);
        form.addView(bioCritCard);

        // P34: FLAG_SECURE opcional. Mientras el usuario no lo cambie, el valor
        // efectivo sigue al bloqueo biométrico (ver ScreenSecurity).
        LinearLayout secureCard = new LinearLayout(a);
        secureCard.setOrientation(LinearLayout.HORIZONTAL);
        secureCard.setGravity(Gravity.CENTER_VERTICAL);
        secureCard.setPadding(ThemePalette.dp(a, 14), ThemePalette.dp(a, 10), ThemePalette.dp(a, 14), ThemePalette.dp(a, 10));
        secureCard.setBackground(ThemePalette.rounded(a, ThemePalette.raised(a), ThemePalette.outline(a), 8f));

        LinearLayout secureText = new LinearLayout(a);
        secureText.setOrientation(LinearLayout.VERTICAL);
        secureText.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView secureTitle = new TextView(a);
        secureTitle.setText("Bloquear capturas de pantalla");
        secureTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        secureTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        secureTitle.setTextColor(ThemePalette.ink(a));
        secureText.addView(secureTitle);

        TextView secureDesc = new TextView(a);
        secureDesc.setText("Impide capturas y oculta la vista previa en Recientes. Activado por defecto con el bloqueo biométrico.");
        secureDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        secureDesc.setTextColor(ThemePalette.inkDim(a));
        secureText.addView(secureDesc);
        secureCard.addView(secureText);

        final Switch swSecure = new Switch(a);
        final android.widget.CompoundButton.OnCheckedChangeListener secureListener = (bv, checked) -> {
            a.prefs.edit().putBoolean(KEY_SECURE_SCREEN, checked).apply();
            ScreenSecurity.apply(a);
            Toast.makeText(a, checked ? "Capturas bloqueadas" : "Capturas permitidas", Toast.LENGTH_SHORT).show();
        };
        swSecure.setChecked(ScreenSecurity.isEnabled(a));
        swSecure.setOnCheckedChangeListener(secureListener);
        secureCard.addView(swSecure);
        LinearLayout.LayoutParams secureParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        secureParams.bottomMargin = ThemePalette.dp(a, 14);
        secureCard.setLayoutParams(secureParams);
        form.addView(secureCard);

        swBio.setOnCheckedChangeListener((bv, checked) -> {
            a.prefs.edit().putBoolean(KEY_BIOMETRIC_LOCK, checked).apply();
            if (checked) {
                Toast.makeText(a, "Bloqueo por huella activado", Toast.LENGTH_SHORT).show();
            }
            if (!a.prefs.contains(KEY_SECURE_SCREEN)) {
                // El valor efectivo de FLAG_SECURE sigue al biométrico: se
                // refleja en el interruptor sin fijar la preferencia.
                swSecure.setOnCheckedChangeListener(null);
                swSecure.setChecked(checked);
                swSecure.setOnCheckedChangeListener(secureListener);
            }
            ScreenSecurity.apply(a);
        });
    }
}
