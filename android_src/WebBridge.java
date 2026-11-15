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

import android.webkit.WebSettings;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Puente JS del cliente: tema, Enter, outbox offline, satelite y compositor.
 */
class WebBridge {
    static void applyThemeToWeb(MainActivity a) {
        if (a.webView == null) return;
        int m = ThemePalette.themeMode(a);
        String modeStr = m == 1 ? "dark" : (m == 2 ? "light" : "system");
        boolean dark = ThemePalette.isDark(a);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                if (m == 1) {
                    a.webView.getSettings().setForceDark(WebSettings.FORCE_DARK_ON);
                } else if (m == 2) {
                    a.webView.getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
                } else {
                    a.webView.getSettings().setForceDark(dark ? WebSettings.FORCE_DARK_ON : WebSettings.FORCE_DARK_OFF);
                }
            } catch (Throwable ignored) {}
        }

        String js = "(function(){ if (window.__DSH_SET_THEME__) { window.__DSH_SET_THEME__('" + modeStr + "', " + dark + "); } })();";
        a.webView.evaluateJavascript(js, null);
    }

    static boolean isEnterSendEnabled(MainActivity a) {
        if (a.prefs == null) return false;
        if (a.prefs.contains(KEY_ENTER_SEND)) {
            return a.prefs.getBoolean(KEY_ENTER_SEND, false);
        }
        return !a.prefs.getBoolean(KEY_ENTER_NEWLINE, true);
    }

    static boolean isEnterNewlineEnabled(MainActivity a) {
        return !WebBridge.isEnterSendEnabled(a);
    }

    static void applyEnterBehaviorToWeb(MainActivity a) {
        if (a.webView == null) return;
        boolean sends = WebBridge.isEnterSendEnabled(a);
        // Se manda el sentido directo; el "invertido" queda solo para paginas
        // antiguas que no conozcan el metodo nuevo.
        String js = "(function(){"
                + " if (window.__DSH_SET_ENTER_SENDS__) { window.__DSH_SET_ENTER_SENDS__(" + sends + "); return; }"
                + " if (window.__DSH_SET_ENTER_BEHAVIOR__) { window.__DSH_SET_ENTER_BEHAVIOR__(" + (!sends) + "); }"
                + " })();";
        a.webView.evaluateJavascript(js, null);
    }

    static boolean isQuickActionsEnabled(MainActivity a) {
        return a.prefs == null || a.prefs.getBoolean(KEY_SHOW_QUICK_ACTIONS, true);
    }

    static boolean isCodeKeysEnabled(MainActivity a) {
        return a.prefs == null || a.prefs.getBoolean(KEY_SHOW_CODE_KEYS, true);
    }

    /** Aplica al instante los interruptores del bloque del compositor, sin recargar. */
    static void applyDockPreferencesToWeb(MainActivity a) {
        if (a.webView == null) return;
        String js = "(function(){ if (window.__DSH_SET_DOCK_PREFS__) { window.__DSH_SET_DOCK_PREFS__({ quick: "
                + WebBridge.isQuickActionsEnabled(a) + ", keys: " + WebBridge.isCodeKeysEnabled(a) + " }); } })();";
        a.webView.evaluateJavascript(js, null);
    }

    static void reloadMainSession(MainActivity a) {
        a.ui.post(() -> {
            if (a.webView != null) {
                BannerUi.hideBanner(a);
                ConnectionController.markRetrying(a);
                a.webView.clearCache(true);
                String target = a.activeUrl.isEmpty() ? PcRegistryStore.urlForSlot(a, 1) : a.activeUrl;
                ConnectionController.startLoad(a, target);
            }
        });
    }

    static void applyOutboxInterceptorToWeb(MainActivity a) {
        if (a.webView == null) return;
        String js = "(function(){ "
                + "if (window.__DSH_OUTBOX_INSTALLED__) return; "
                + "window.__DSH_OUTBOX_INSTALLED__ = true; "
                + "function captureAndSave(e) { "
                + "  if (window.AndroidCompanion && typeof window.AndroidCompanion.isOnline === 'function' && !window.AndroidCompanion.isOnline()) { "
                + "    var t = document.querySelector('textarea, [contenteditable=\"true\"]'); "
                + "    if (t) { "
                + "      var v = (t.value || t.innerText || '').trim(); "
                + "      if (v) { "
                + "        if (e) { e.preventDefault(); e.stopPropagation(); } "
                + "        window.AndroidCompanion.saveOfflineDraft(v); "
                + "        t.value = ''; "
                + "        if (t.innerText) t.innerText = ''; "
                + "      } "
                + "    } "
                + "  } "
                + "} "
                + "document.addEventListener('keydown', function(e){ "
                + "  if (e.key === 'Enter' && !e.shiftKey) { captureAndSave(e); } "
                + "}, true); "
                + "document.addEventListener('click', function(e){ "
                + "  var btn = e.target.closest('button[type=\"submit\"], button[aria-label*=\"Send\" i], button[aria-label*=\"Enviar\" i]'); "
                + "  if (btn) { captureAndSave(e); } "
                + "}, true); "
                + "})();";
        a.webView.evaluateJavascript(js, null);
    }

    static void checkAndInjectOfflineOutbox(MainActivity a) {
        if (a.prefs == null || a.webView == null) return;
        String draft = a.prefs.getString("pending_outbox_draft", null);
        if (draft == null || draft.trim().isEmpty()) return;

        String jsonSafe = org.json.JSONObject.quote(draft);
        String js = "(function(){ "
                + "if (window.__DSH_INSERT_INTO_COMPOSER__) { "
                + "  return window.__DSH_INSERT_INTO_COMPOSER__(" + jsonSafe + "); "
                + "} "
                + "return false; "
                + "})()";
        a.webView.evaluateJavascript(js, res -> {
            if ("true".equals(res) || Boolean.parseBoolean(res)) {
                a.composerInsertRetries = 0;
                a.prefs.edit().remove("pending_outbox_draft").apply();
                a.vibrateHaptic("confirm");
                Toast.makeText(a, "Borrador sin conexión restaurado en el compositor", Toast.LENGTH_SHORT).show();
            } else if (a.composerInsertRetries++ < 5) {
                // Reintentos acotados: si el compositor nunca aparece, no se queda
                // reprogramando cada 1,2 s durante toda la sesión.
                a.ui.postDelayed(() -> {
                    if (a.state == STATE_ONLINE) {
                        WebBridge.checkAndInjectOfflineOutbox(a);
                    }
                }, 1200);
            }
        });
    }

    static void captureDraftIfOffline(MainActivity a) {
        if (a.state != STATE_ONLINE && a.webView != null) {
            String js = "(function(){ "
                    + "try { "
                    + "  var t = document.querySelector('textarea, [contenteditable=\"true\"]'); "
                    + "  if (t) { "
                    + "    var v = (t.value || t.innerText || '').trim(); "
                    + "    if (v && window.AndroidCompanion && window.AndroidCompanion.saveOfflineDraft) { "
                    + "      window.AndroidCompanion.saveOfflineDraft(v); "
                    + "      t.value = ''; "
                    + "      if (t.innerText) t.innerText = ''; "
                    + "    } "
                    + "  } "
                    + "} catch(e){} "
                    + "})();";
            a.webView.evaluateJavascript(js, null);
        }
    }

    static void saveOfflineDraft(MainActivity a, String draft) {
        if (draft == null || draft.trim().isEmpty()) return;
        if (a.prefs != null) {
            a.prefs.edit().putString("pending_outbox_draft", draft.trim()).apply();
        }
        a.ui.post(() -> {
            Toast.makeText(a, "Borrador guardado localmente (esperando conexión)", Toast.LENGTH_SHORT).show();
            a.vibrateHaptic("confirm");
        });
    }

    static void injectSharedTextIfReady(MainActivity a) {
        if (a.pendingSharedText == null || a.pendingSharedText.isEmpty() || a.webView == null) return;
        String json = org.json.JSONObject.quote(a.pendingSharedText);
        a.webView.evaluateJavascript("if (window.__DSH_INSERT_INTO_COMPOSER__) { window.__DSH_INSERT_INTO_COMPOSER__(" + json + "); }", (res) -> {
            if ("true".equals(res)) {
                Toast.makeText(a, "Texto compartido insertado en el compositor", Toast.LENGTH_SHORT).show();
                a.pendingSharedText = null;
            }
        });
    }

    static void submitComposer(MainActivity a) {
        if (a.webView == null) return;
        String js = "(function() {\n" +
                "  if (typeof window.__DSH_SUBMIT_COMPOSER__ === 'function') {\n" +
                "    window.__DSH_SUBMIT_COMPOSER__();\n" +
                "    return;\n" +
                "  }\n" +
                "  var btn = document.querySelector('button[type=\"submit\"], button[aria-label*=\"Send\" i], button[aria-label*=\"Enviar\" i], .composer-submit-btn, [data-testid=\"send-button\"]');\n" +
                "  if (btn) { btn.click(); return; }\n" +
                "  var ta = document.querySelector('textarea, [contenteditable=\"true\"]');\n" +
                "  if (ta) {\n" +
                "    var form = ta.closest('form');\n" +
                "    if (form) { if (form.requestSubmit) form.requestSubmit(); else form.submit(); return; }\n" +
                "    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));\n" +
                "  }\n" +
                "})();";
        a.webView.evaluateJavascript(js, null);
    }

    static void dispatchEscapeToWeb(MainActivity a) {
        if (a.webView == null) return;
        String js = "(function() {\n" +
                "  var target = document.activeElement || document.body;\n" +
                "  var evtDown = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true });\n" +
                "  target.dispatchEvent(evtDown);\n" +
                "  var evtUp = new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true });\n" +
                "  target.dispatchEvent(evtUp);\n" +
                "})();";
        a.webView.evaluateJavascript(js, null);
    }
}
