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

import android.webkit.WebSettings;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Puente JS del cliente: tema, Enter, outbox offline y compositor.
 */
class WebBridge {

    /**
     * P1: genera el nonce de la navegación principal y lo inyecta en el frame
     * raíz. Un iframe cross-origin no puede leer esta propiedad del padre, así
     * que no puede armar el puente ni aportar el token a los métodos sensibles.
     */
    static void beginBridgePage(MainActivity a, String pageUrl) {
        if (a.webView == null) return;
        a.dockPushRetries = 0;
        String nonce = BridgeGuard.rotateForPage(pageUrl);
        WebBridge.evalBridgeToken(a, nonce);
    }

    /** Re-inyecta el mismo nonce (carrera de carga) o lo crea si no hay. */
    static void ensureBridgeTokenForPage(MainActivity a, String pageUrl) {
        if (a.webView == null) return;
        BridgeGuard.confirmPageUrl(pageUrl);
        String nonce = BridgeGuard.currentNonce();
        if (nonce == null) nonce = BridgeGuard.rotateForPage(pageUrl);
        WebBridge.evalBridgeToken(a, nonce);
        // El dock se configura solo al cargar: perfil, ids activos e interruptores.
        WebBridge.applyDockPreferencesToWeb(a);
    }

    private static void evalBridgeToken(MainActivity a, String nonce) {
        if (a.webView == null || nonce == null) return;
        String js = ";(function(){ window.__DSH_BRIDGE_TOKEN__ = '" + nonce + "'; })();";
        a.webView.evaluateJavascript(js, null);
    }

    /**
     * P1: guarda un borrador por el puente con el nonce de página. WebBridge y
     * CompanionBridge se compilan en el mismo APK, así que la firma con token
     * siempre coincide: aquí NO hay llamada de respaldo sin token (fail-closed).
     */
    private static final String DRAFT_SAVE_JS =
            "function __dshSaveOfflineDraft(v) {"
            + "  var b = window.AndroidCompanion;"
            + "  var n = window.__DSH_BRIDGE_TOKEN__;"
            + "  if (!b || !n || typeof b.saveOfflineDraft !== 'function') return false;"
            + "  try {"
            + "    try { if (typeof b.armBridge === 'function') b.armBridge(n); } catch (e0) {}"
            + "    return b.saveOfflineDraft(n, v) !== false;"
            + "  } catch (e1) { return false; }"
            + "}";

    /**
     * P1 (5.1.9): isOnline tambien exige el nonce. Si el token no existe o el
     * puente aun no esta armado se responde "en linea" a proposito: asi el
     * interceptor de borradores no se traga la tecla Enter por un rechazo del
     * guardian. Nunca se llama a isOnline sin nonce.
     */
    private static final String ONLINE_CHECK_JS =
            "function __dshIsOnline() {"
            + "  var b = window.AndroidCompanion;"
            + "  var n = window.__DSH_BRIDGE_TOKEN__;"
            + "  if (!b || !n || typeof b.isOnline !== 'function') return true;"
            + "  try {"
            + "    try { if (typeof b.armBridge === 'function') b.armBridge(n); } catch (e0) {}"
            + "    return b.isOnline(n) !== false;"
            + "  } catch (e1) { return true; }"
            + "}";

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

    /** Interruptor de Ajustes: copia del chat en localStorage para el lector offline. */
    static boolean isOfflineCopyEnabled(MainActivity a) {
        return a.prefs == null || a.prefs.getBoolean(KEY_OFFLINE_COPY, true);
    }

    /**
     * P54 (bloque F): comunica al cliente inyectado si debe guardar la copia
     * del chat para el lector sin conexión. Se reaplica en cada carga de página.
     * P56: si el interruptor está apagado, además se borra la copia nativa
     * cifrada (también cubre una preferencia apagada al arrancar la app).
     */
    static void applyOfflineCopyToWeb(MainActivity a) {
        boolean enabled = WebBridge.isOfflineCopyEnabled(a);
        if (!enabled) OfflineChatStore.clear(a);
        if (a.webView == null) return;
        String js = "(function(){ if (window.__DSH_SET_OFFLINE_COPY__) { window.__DSH_SET_OFFLINE_COPY__("
                + enabled + "); } })();";
        a.webView.evaluateJavascript(js, null);
    }

    /**
     * «Guardar ahora» de Ajustes: fuerza la captura del chat actual en el
     * cliente (no espera al pagehide) y explica el motivo si no hay copia:
     * sin PC, sin chat, sin cifrado o sin captura todavía.
     */
    static void captureOfflineChatNow(MainActivity a) {
        if (a.webView == null || !WebBridge.isOfflineCopyEnabled(a)) {
            Toast.makeText(a, "Abre un chat y activa «Copia del chat para uso sin conexión».",
                    Toast.LENGTH_LONG).show();
            return;
        }
        String js = "(function(){ return typeof window.__DSH_CAPTURE_CHAT_NOW__ === 'function'"
                + " ? window.__DSH_CAPTURE_CHAT_NOW__() : ''; })()";
        a.webView.evaluateJavascript(js, result -> {
            // El cliente responde "ok" o el motivo; evaluateJavascript lo entrega entre comillas.
            String reason = result == null ? "" : result.trim().replace("\"", "");
            String message;
            if ("ok".equals(reason)) message = "Copia del chat guardada y cifrada en el teléfono.";
            else if ("no-encryption".equals(reason)) message = "No se pudo cifrar la copia en este teléfono.";
            else if ("no-chat".equals(reason)) message = a.isOnline()
                    ? "No encontré texto en el chat. Abre una conversación y pulsa «Guardar ahora»."
                    : "Sin conexión con la PC: no hay un chat abierto que copiar.";
            else if ("too-short".equals(reason)) message = "El chat es demasiado corto para guardar una copia.";
            else if ("disabled".equals(reason)) message = "La copia sin conexión está desactivada.";
            else message = "No se pudo guardar la copia. Abre un chat y reintenta.";
            Toast.makeText(a, message, Toast.LENGTH_LONG).show();
            a.vibrateHaptic("ok".equals(reason) ? "confirm" : "reject");
        });
    }

    static boolean isCodeKeysEnabled(MainActivity a) {
        return a.prefs == null || a.prefs.getBoolean(KEY_SHOW_CODE_KEYS, true);
    }

    /**
     * Aplica al instante los interruptores, el perfil y los ids activos del
     * dock (JSON en SharedPreferences) sin recargar la pagina. Tambien llega
     * al terminar cada carga, porque el cliente arranca con los valores por
     * defecto hasta que el nativo se los manda.
     */
    static void applyDockPreferencesToWeb(MainActivity a) {
        if (a.webView == null) return;
        String raw = a.prefs == null ? null : a.prefs.getString(KEY_QUICK_COMMANDS, null);
        String config = PrefKeys.quickDockJson(raw,
                WebBridge.isQuickActionsEnabled(a), WebBridge.isCodeKeysEnabled(a));
        // Si el cliente aun no definio el receptor (script en el <head> que
        // todavia no corrio), se reintenta un numero acotado de veces: con un
        // unico push el dock se quedaba con los valores por defecto.
        String js = "(function(){"
                + " if (typeof window.__DSH_SET_DOCK_PREFS__ !== 'function') return false;"
                + " window.__DSH_SET_DOCK_PREFS__(" + config + ");"
                + " return true;"
                + " })();";
        a.webView.evaluateJavascript(js, result -> {
            if ("true".equals(result)) {
                a.dockPushRetries = 0;
                return;
            }
            if (a.dockPushRetries >= 4) return;
            a.dockPushRetries++;
            a.ui.postDelayed(() -> WebBridge.applyDockPreferencesToWeb(a), 400);
        });
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
                + DRAFT_SAVE_JS
                + ONLINE_CHECK_JS
                + "function captureAndSave(e) { "
                + "  if (__dshIsOnline()) return; "
                + "  { "
                + "    var t = document.querySelector('textarea, [contenteditable=\"true\"]'); "
                + "    if (t) { "
                + "      var v = (t.value || t.innerText || '').trim(); "
                + "      if (v) { "
                + "        if (e) { e.preventDefault(); e.stopPropagation(); } "
                + "        if (__dshSaveOfflineDraft(v)) { "
                + "          t.value = ''; "
                + "          if (t.innerText) t.innerText = ''; "
                + "        } "
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
                    + DRAFT_SAVE_JS
                    + "try { "
                    + "  var t = document.querySelector('textarea, [contenteditable=\"true\"]'); "
                    + "  if (t) { "
                    + "    var v = (t.value || t.innerText || '').trim(); "
                    + "    if (v && __dshSaveOfflineDraft(v)) { "
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
