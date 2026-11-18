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
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.TypefaceSpan;
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
import java.util.List;
import java.util.Locale;

/**
 * Lector NATIVO de la copia cifrada del último chat, sin red ni WebView.
 *
 * Pinta cada mensaje por separado (etiqueta «Tú»/«Agente», hora si existe y un
 * TextView por mensaje, máximo {@value #MAX_MESSAGES}), con los bloques de
 * código en monoespaciada. Una copia antigua de texto plano se sigue leyendo
 * con sus párrafos. Solo lectura: FLAG_SECURE y sin extras.
 */
public class OfflineChatActivity extends Activity {

    /** Tope de mensajes que se pintan; el resto se recorta con aviso. */
    private static final int MAX_MESSAGES = 400;
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
        if (!OfflineChatStore.isEnabled(this)) {
            showMessage(root, "Copia desactivada",
                    "La copia del chat para uso sin conexión está apagada en Ajustes. "
                            + "Actívala y pulsa «Guardar ahora» para guardar el chat cifrado en el teléfono.");
        } else if (loaded.status == OfflineChatStore.Load.STATUS_OK && loaded.chat != null) {
            showChat(root, loaded.chat);
        } else if (loaded.status == OfflineChatStore.Load.STATUS_UNAVAILABLE) {
            showMessage(root, "Copia no disponible",
                    "El cifrado de este teléfono no está disponible o la copia no se puede "
                            + "descifrar. Por privacidad el chat nunca se guarda en claro: no hay "
                            + "nada que mostrar.");
        } else if (!conectadoAPc()) {
            showMessage(root, "Sin conexión con la PC",
                    "La copia se toma del chat abierto en el búnker. Conéctate a la PC, "
                            + "abre un chat y pulsa «Guardar ahora» en Ajustes; después podrás leerlo "
                            + "aunque la PC esté apagada.");
        } else {
            showMessage(root, "Todavía no hay copia",
                    "Abre un chat y pulsa «Guardar ahora» en Ajustes (o activa «Copia del chat "
                            + "para uso sin conexión» y oculta la app). El último chat se guardará "
                            + "cifrado en el teléfono para leerlo sin la PC.");
        }
    }

    /** true si la app sigue conectada al búnker, para explicar las capturas. */
    private static boolean conectadoAPc() {
        try {
            MainActivity instance = MainActivity.getInstance();
            return instance != null && instance.isOnline();
        } catch (Throwable ignored) {
            return false;
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

    /** Pinta la copia: título, fecha, mensajes y botón Copiar. */
    private void showChat(LinearLayout root, OfflineChatStore.Chat stored) {
        this.chat = stored;
        TextView title = smallText(stored.title, 17f, ThemePalette.ink(this));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, dp(4), 0, dp(2));
        root.addView(title);
        TextView date = smallText(dateLabel(stored.updatedAt), 11.5f, ThemePalette.inkDim(this));
        date.setPadding(0, 0, 0, dp(10));
        root.addView(date);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        scroll.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setPadding(dp(4), dp(2), dp(4), dp(2));
        scroll.addView(list);

        List<OfflineChatFormat.Message> messages = stored.messages;
        if (messages.isEmpty()) messages = OfflineChatFormat.parseLegacy(stored.text);
        if (!messages.isEmpty()) {
            int first = Math.max(0, messages.size() - MAX_MESSAGES);
            if (first > 0) {
                list.addView(smallText("Se muestran los últimos " + MAX_MESSAGES + " mensajes.",
                        11.5f, ThemePalette.inkDim(this)));
            }
            for (int i = first; i < messages.size(); i++) list.addView(messageView(messages.get(i)));
        } else {
            // Copia antigua de texto plano: se conservan sus párrafos.
            TextView body = smallText(stored.text, 14f, ThemePalette.ink(this));
            body.setTextIsSelectable(true);
            body.setLineSpacing(dp(4), 1f);
            body.setPadding(dp(14), dp(12), dp(14), dp(12));
            body.setBackground(ThemePalette.rounded(this, ThemePalette.raised(this),
                    ThemePalette.outline(this), 10f));
            list.addView(body);
        }
        root.addView(scroll);
        Button copy = UiKit.action(this, "Copiar", 1, this::copyChat);
        copy.setContentDescription("Copiar el chat al portapapeles");
        root.addView(copy);
    }

    /** Tarjeta de un mensaje: etiqueta con hora y cuerpo con formato. */
    private LinearLayout messageView(OfflineChatFormat.Message message) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(9), dp(12), dp(9));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(7);
        card.setLayoutParams(params);
        card.setBackground(ThemePalette.rounded(this, ThemePalette.raised(this),
                ThemePalette.outline(this), 9f));
        String label = message.isUser() ? "Tú" : "Agente";
        if (!message.time.isEmpty()) label += "  ·  " + message.time;
        TextView header = smallText(label, 11.5f, message.isUser()
                ? ThemePalette.accentInk(this) : ThemePalette.inkDim(this));
        header.setTypeface(Typeface.DEFAULT_BOLD);
        card.addView(header);
        TextView body = smallText("", 14f, ThemePalette.ink(this));
        body.setText(styledBody(message.text));
        body.setTextIsSelectable(true);
        body.setLineSpacing(dp(3), 1f);
        card.addView(body);
        return card;
    }

    /** Cuerpo con los bloques de código en monoespaciada, sin mostrar las marcas. */
    private CharSequence styledBody(String raw) {
        int codeBackground = ThemePalette.color(this,
                Color.parseColor("#0D1117"), Color.parseColor("#EAEEF2"));
        SpannableStringBuilder builder = new SpannableStringBuilder();
        String text = raw == null ? "" : raw;
        int index = 0;
        while (index < text.length()) {
            int open = text.indexOf("```", index);
            if (open < 0) {
                builder.append(text.substring(index));
                break;
            }
            builder.append(text.substring(index, open));
            int mark = builder.length();
            int codeStart = open + 3;
            int firstBreak = text.indexOf('\n', codeStart);
            int close = text.indexOf("```", codeStart);
            if (close < 0) {
                appendCode(builder, text.substring(codeStart), mark, codeBackground);
                break;
            }
            int begin = firstBreak >= 0 && firstBreak < close ? firstBreak + 1 : codeStart;
            appendCode(builder, text.substring(begin, close), mark, codeBackground);
            index = close + 3;
            if (index < text.length() && text.charAt(index) == '\n') index++;
        }
        return builder;
    }

    /** Añade un bloque de código ya sin las marcas y le da estilo monoespaciado. */
    private static void appendCode(SpannableStringBuilder builder, String code, int mark, int background) {
        builder.append(code);
        int end = builder.length();
        if (end <= mark) return;
        builder.setSpan(new TypefaceSpan("monospace"), mark, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        builder.setSpan(new BackgroundColorSpan(background), mark, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        builder.setSpan(new RelativeSizeSpan(0.92f), mark, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
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

    /** Copia el texto completo al portapapeles, sin red y sin tocar el archivo. */
    private void copyChat() {
        if (chat == null) return;
        List<OfflineChatFormat.Message> messages = chat.messages.isEmpty()
                ? OfflineChatFormat.parseLegacy(chat.text) : chat.messages;
        String body = messages.isEmpty() ? chat.text : OfflineChatFormat.plainText(messages);
        try {
            ClipboardManager manager =
                    (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (manager == null) return;
            manager.setPrimaryClip(ClipData.newPlainText("Copia del chat", body));
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
