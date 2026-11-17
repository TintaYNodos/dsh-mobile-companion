/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Locale;

/**
 * Lector NATIVO de la copia cifrada del último chat.
 *
 * Existe porque el lector web (`offline.html`) solo se sirve desde el puente:
 * con la PC apagada no hay página que abrir. Esta pantalla no usa red ni el
 * WebView: lee del archivo privado cifrado por {@link OfflineChatStore}, que
 * guarda el cliente cuando el interruptor de «Copia del chat para uso sin
 * conexión» está activo. Se llega desde el Hub («Último chat guardado») y
 * desde Ajustes («Leer el último chat»).
 *
 * Es una actividad de solo lectura, exportada=false y sin extras: no acepta
 * intenciones de otras apps ni contenido de red. FLAG_SECURE evita capturas y
 * miniatura en Recientes porque la copia es privada.
 */
public class OfflineChatActivity extends Activity {

    private OfflineChatStore.Chat chat;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(ThemePalette.isDark(this) ? R.style.Theme_Companion : R.style.Theme_Companion_Light);
        super.onCreate(savedInstanceState);
        // La copia es privada: sin capturas ni miniatura en la vista de Recientes.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        ThemePalette.applySystemBarsTheme(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(ThemePalette.surface(this));
        root.setFitsSystemWindows(true);
        root.setPadding(dp(18), dp(14), dp(18), dp(12));
        setContentView(root);

        root.addView(buildHeader());

        TextView subtitle = smallText("Copia cifrada en este teléfono. Se lee sin la PC y sin\n"
                + "conexión; no se envía a ningún sitio.", 11.5f, ThemePalette.inkDim(this));
        subtitle.setPadding(0, dp(2), 0, dp(12));
        root.addView(subtitle);

        OfflineChatStore.Load loaded = OfflineChatStore.load(this);
        if (loaded.status == OfflineChatStore.Load.STATUS_OK && loaded.chat != null) {
            showChat(root, loaded.chat);
        } else if (loaded.status == OfflineChatStore.Load.STATUS_UNAVAILABLE) {
            showMessage(root, "Copia no disponible",
                    "El cifrado de este teléfono no está disponible o la copia no se puede "
                            + "descifrar. Por privacidad el chat nunca se guarda en claro: no hay "
                            + "nada que mostrar.");
        } else {
            showMessage(root, "Todavía no hay copia",
                    "Activa «Copia del chat para uso sin conexión» en Ajustes y oculta la app. "
                            + "El último chat se guardará cifrado en el teléfono para leerlo sin la PC.");
        }
    }

    /** Cabecera con el título de la pantalla y el botón de volver. */
    private LinearLayout buildHeader() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView heading = smallText("Último chat guardado", 20f, ThemePalette.ink(this));
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        heading.setLayoutParams(new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        header.addView(heading);

        Button back = UiKit.actionCompact(this, "Volver", false, this::finish);
        back.setContentDescription("Volver");
        header.addView(back);
        return header;
    }

    /** Pinta la copia: título, fecha local, texto seleccionable y botón Copiar. */
    private void showChat(LinearLayout root, OfflineChatStore.Chat stored) {
        this.chat = stored;

        TextView title = smallText(stored.title, 17f, ThemePalette.ink(this));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, dp(4), 0, dp(2));
        root.addView(title);

        TextView date = smallText(dateLabel(stored.updatedAt), 11.5f, ThemePalette.inkDim(this));
        date.setPadding(0, 0, 0, dp(10));
        root.addView(date);

        // Scroll nativo: el tope de 20 000 caracteres se desplaza sin cargar red.
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        TextView body = smallText(stored.text, 14f, ThemePalette.ink(this));
        body.setTextIsSelectable(true);
        body.setLineSpacing(dp(4), 1f);
        body.setPadding(dp(14), dp(12), dp(14), dp(12));
        body.setBackground(ThemePalette.rounded(this, ThemePalette.raised(this),
                ThemePalette.outline(this), 10f));
        scroll.addView(body);
        root.addView(scroll);

        Button copy = UiKit.action(this, "Copiar", 1, this::copyChat);
        copy.setContentDescription("Copiar el chat al portapapeles");
        root.addView(copy);
    }

    /** Estado vacío o «no disponible»: nunca se inventa contenido. */
    private void showMessage(LinearLayout root, String headingText, String detail) {
        TextView heading = smallText(headingText, 16f, ThemePalette.ink(this));
        heading.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(heading);

        TextView body = smallText(detail, 13f, ThemePalette.inkDim(this));
        body.setLineSpacing(dp(3), 1f);
        body.setPadding(0, dp(8), 0, 0);
        root.addView(body);
    }

    /** Copia el texto completo al portapapeles (sin red y sin tocar el archivo). */
    private void copyChat() {
        if (chat == null) return;
        try {
            ClipboardManager manager =
                    (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (manager == null) return;
            manager.setPrimaryClip(ClipData.newPlainText("Copia del chat", chat.text));
            Toast.makeText(this, "Chat copiado al portapapeles", Toast.LENGTH_SHORT).show();
        } catch (Throwable ignored) {
            Toast.makeText(this, "No se pudo copiar el chat", Toast.LENGTH_SHORT).show();
        }
    }

    /** Fecha local del guardado; si no se puede interpretar, se muestra tal cual. */
    private static String dateLabel(String updatedAt) {
        if (updatedAt == null || updatedAt.trim().isEmpty()) return "Guardado sin fecha";
        String raw = updatedAt.trim();
        try {
            Instant instant = Instant.parse(raw);
            DateTimeFormatter format = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM)
                    .withLocale(Locale.getDefault())
                    .withZone(ZoneId.systemDefault());
            return "Guardado el " + format.format(instant);
        } catch (Throwable ignored) {
            return "Guardado: " + raw;
        }
    }

    private TextView smallText(String value, float sizeSp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTextColor(color);
        return view;
    }

    private int dp(float value) {
        return ThemePalette.dp(this, value);
    }
}
