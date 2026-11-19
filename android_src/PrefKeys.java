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
 * Claves y constantes compartidas del cliente movil.
 */
/** Claves de SharedPreferences, codigos de peticion y constantes compartidas. */
class PrefKeys {

    static final int REQUEST_FILE = 1001;
    static final int REQUEST_AUDIO = 2002;
    static final int REQUEST_NOTIFICATIONS = 3003;
    static final int REQUEST_INSTALL_PERMISSION = 4004;
    static final int REQUEST_QR_SCAN = 5005;

    static final String PREFS = "DshCompanionPrefs";
    static final String KEY_URL_1 = "bunker_url_1";
    static final String KEY_NAME_1 = "bunker_name_1";
    static final String KEY_URL_2 = "bunker_url_2";
    static final String KEY_NAME_2 = "bunker_name_2";
    static final String KEY_ACTIVE = "active_slot";
    static final String KEY_KEEP_SCREEN = "keep_screen_on";
    static final String KEY_PILL_Y = "pill_fraction_y";
    static final String KEY_PILL_X = "pill_fraction_x";
    static final String KEY_PILL_LANDSCAPE = "pill_show_landscape";
    static final String KEY_DOCK_HIDDEN_PORTRAIT = "dock_hidden_portrait";
    static final String KEY_PILL_EXPANDED_ONCE = "pill_expanded_once";
    static final String KEY_ACCESS_KEY = "access_key";
    static final String KEY_ENTER_NEWLINE = "enter_is_newline";
    static final String KEY_ENTER_SEND = "enter_sends_message";
    static final String KEY_SHOW_QUICK_ACTIONS = "composer_quick_actions";
    static final String KEY_SHOW_CODE_KEYS = "composer_code_keys";
    /** Preferencia JSON de comandos rapidos: perfil y lista de ids activos. */
    static final String KEY_QUICK_COMMANDS = "composer_quick_commands";
    static final String PROFILE_AUTO = "auto";
    static final String PROFILE_ESCRITURA = "escritura";
    static final String PROFILE_CODIGO = "codigo";

    /** Catalogo aprobado: id estable, etiqueta, descripcion (<=60) y grupo. */
    static final String[][] QUICK_COMMANDS = {
            {"escena", "Escena", "Redacta una escena del proyecto con límite de palabras.", "escritura"},
            {"dialogo", "Diálogo", "Escribe un diálogo breve entre personajes del proyecto.", "escritura"},
            {"estilo", "Estilo", "Revisa repeticiones y estilo del texto anterior.", "escritura"},
            {"fuentes", "Fuentes", "Propone fuentes verificables para el tema actual.", "escritura"},
            {"coherencia", "Coherencia", "Detecta contradicciones con el resto del proyecto.", "escritura"},
            {"auditar", "Auditar", "Busca vulnerabilidades y casos límite en el código.", "codigo"},
            {"explicar", "Explicar", "Explica el contenido anterior con ejemplos breves.", "codigo"},
            {"pruebas", "Pruebas", "Genera pruebas unitarias y casos límite del código.", "codigo"},
            {"depurar", "Depurar", "Encuentra la causa del error y el arreglo mínimo.", "codigo"},
            {"diseno", "Diseño", "Propone componentes y estados para una pantalla.", "codigo"},
            {"continuar", "Continuar", "Sigue desde donde se quedó sin repetir nada.", "trabajo"},
            {"pendientes", "Pendientes", "Lista los pendientes abiertos del proyecto.", "trabajo"},
            {"notas", "Notas", "Siempre visible: revisa tus notas del teléfono.", "trabajo"}
    };
    static final String[] QUICK_GROUPS = {"escritura", "codigo", "trabajo"};
    static final String[] QUICK_GROUP_LABELS = {"Escribir", "Código", "Trabajo"};
    static final String[] QUICK_DEFAULT_ESCRITURA = {"escena", "estilo", "fuentes", "continuar"};
    static final String[] QUICK_DEFAULT_CODIGO = {"auditar", "explicar", "pruebas", "continuar"};
    static final String KEY_BIOMETRIC_LOCK = "biometric_lock_enabled";
    static final String KEY_SECURE_SCREEN = "secure_screen_enabled";
    static final String KEY_OFFLINE_COPY = "offline_copy_enabled";
    /** Marca sin contenido: el lector nativo no pudo cifrar o descifrar la copia. */
    static final String KEY_OFFLINE_CHAT_UNAVAILABLE = "offline_chat_unavailable";

    // Vigilante del servicio de avisos de la PC (ver WatchdogPolicy).
    /** Interruptor de Ajustes "Reiniciar el servicio si se cuelga". ON por defecto. */
    static final String KEY_PC_EVENTS_WATCHDOG = "pc_events_watchdog_enabled";
    /** "Silencio antes de reconectar": 1, 3 o 5 minutos; 3 por defecto. */
    static final String KEY_PC_EVENTS_WATCHDOG_STALE_MIN = "pc_events_watchdog_stale_min";
    static final int PC_EVENTS_WATCHDOG_STALE_MIN_DEFAULT = 3;
    /** "Reintentos antes de reiniciar": 1, 2 o 3; 2 por defecto. */
    static final String KEY_PC_EVENTS_WATCHDOG_RETRIES = "pc_events_watchdog_retries";
    static final int PC_EVENTS_WATCHDOG_RETRIES_DEFAULT = 2;
    /** "Avisar si no recupera": ON por defecto. */
    static final String KEY_PC_EVENTS_WATCHDOG_ALERT = "pc_events_watchdog_alert";
    /** Ultima conexion SSE establecida (para "Ultima conexion: hace X"). */
    static final String KEY_PC_EVENTS_LAST_OK = "pc_events_last_ok_at";
    /** Ultimo RESTART del vigilante (limite de 1 cada 10 min). */
    static final String KEY_PC_EVENTS_LAST_RESTART = "pc_events_last_restart_at";
    /** Ultima accion del vigilante y cuando, para la linea de estado. */
    static final String KEY_PC_EVENTS_WATCHDOG_NOTE = "pc_events_watchdog_note";
    static final String KEY_PC_EVENTS_WATCHDOG_NOTE_AT = "pc_events_watchdog_note_at";

    static final int PORT = 57420;
    static final int STATE_ONLINE = 0;
    static final int STATE_RETRYING = 1;

    static final int MAX_ATTEMPTS = 12;
    static final long BASE_BACKOFF_MS = 1500L;
    static final long MAX_BACKOFF_MS = 8000L;
    static final int MAX_TELEMETRY_HISTORY = 30;
    static final long DISCONNECTION_THRESHOLD_MS = 10 * 60 * 1000L;

    /**
     * Política del vigilante con los valores configurados en Ajustes. El
     * servicio la reconstruye en cada tick, así que cambiarlos aplica sin
     * reiniciar nada; cualquier valor inválido cae en el de por defecto.
     */
    static WatchdogPolicy watchdogPolicy(SharedPreferences prefs) {
        if (prefs == null) return new WatchdogPolicy();
        return WatchdogPolicy.fromValues(
                prefs.getInt(KEY_PC_EVENTS_WATCHDOG_STALE_MIN, PC_EVENTS_WATCHDOG_STALE_MIN_DEFAULT),
                prefs.getInt(KEY_PC_EVENTS_WATCHDOG_RETRIES, PC_EVENTS_WATCHDOG_RETRIES_DEFAULT),
                prefs.getBoolean(KEY_PC_EVENTS_WATCHDOG_ALERT, true));
    }

    static String normalizeProfile(String perfil) {
        if (PROFILE_CODIGO.equals(perfil) || PROFILE_ESCRITURA.equals(perfil)) return perfil;
        return PROFILE_AUTO;
    }

    /** Lista activa por defecto; con "auto" se usa la de escritura (JS afina). */
    static String[] quickDefaults(String perfil) {
        return (PROFILE_CODIGO.equals(normalizeProfile(perfil)) ? QUICK_DEFAULT_CODIGO : QUICK_DEFAULT_ESCRITURA).clone();
    }

    /** Notas esta clavada en el dock: no se puede desactivar. */
    static boolean quickAlwaysOn(String id) {
        return "notas".equals(id);
    }

    static boolean quickExists(String id) {
        for (String[] command : QUICK_COMMANDS) {
            if (command[0].equals(id)) return true;
        }
        return false;
    }

    /** El dock pinta como maximo 4 chips activos; el resto va detras de "+". */
    static String[] quickVisible(String[] active) {
        return java.util.Arrays.copyOf(active, Math.min(4, active.length));
    }

    static String[] quickOverflow(String[] active) {
        return active.length > 4 ? java.util.Arrays.copyOfRange(active, 4, active.length) : new String[0];
    }

    static String quickProfileOf(String raw) {
        try {
            return normalizeProfile(new org.json.JSONObject(raw).optString("perfil", PROFILE_AUTO));
        } catch (Exception error) {
            return PROFILE_AUTO;
        }
    }

    /** Ids activos normalizados: catalogo, sin Notas, sin duplicados ni basura. */
    static String[] quickActiveOf(String raw) {
        String perfil = quickProfileOf(raw);
        try {
            org.json.JSONArray ids = new org.json.JSONObject(raw).optJSONArray("activos");
            if (ids == null) return quickDefaults(perfil);
            java.util.ArrayList<String> out = new java.util.ArrayList<>();
            for (int index = 0; index < ids.length(); index++) {
                String id = ids.optString(index, "");
                if (!id.isEmpty() && !quickAlwaysOn(id) && quickExists(id) && !out.contains(id)) out.add(id);
            }
            return out.toArray(new String[0]);
        } catch (Exception error) {
            return quickDefaults(perfil);
        }
    }

    static String quickJson(String perfil, String[] active) {
        org.json.JSONObject json = new org.json.JSONObject();
        try {
            json.put("perfil", normalizeProfile(perfil));
            org.json.JSONArray ids = new org.json.JSONArray();
            for (String id : active) {
                if (!quickAlwaysOn(id) && quickExists(id)) ids.put(id);
            }
            json.put("activos", ids);
        } catch (Exception ignored) {
        }
        return json.toString();
    }

    /** Activa o desactiva un comando conservando el perfil y el orden. */
    static String quickToggle(String raw, String id, boolean enabled) {
        java.util.ArrayList<String> out = new java.util.ArrayList<>();
        for (String current : quickActiveOf(raw)) {
            if (!current.equals(id)) out.add(current);
        }
        if (enabled && !quickAlwaysOn(id) && quickExists(id)) out.add(id);
        return quickJson(quickProfileOf(raw), out.toArray(new String[0]));
    }

    /** Cambiar de perfil restablece la lista activa de ese perfil. */
    static String quickSetProfile(String raw, String perfil) {
        return quickJson(perfil, quickDefaults(perfil));
    }

    /** Preferencia completa que consume el dock (perfil, ids e interruptores). */
    static String quickDockJson(String raw, boolean quick, boolean keys, boolean hiddenPortrait) {
        org.json.JSONObject json = new org.json.JSONObject();
        try {
            json.put("perfil", quickProfileOf(raw));
            org.json.JSONArray ids = new org.json.JSONArray();
            for (String id : quickActiveOf(raw)) ids.put(id);
            json.put("activos", ids);
            json.put("quick", quick);
            json.put("keys", keys);
            json.put("hiddenPortrait", hiddenPortrait);
            json.put("notas", true);
        } catch (Exception ignored) {
        }
        return json.toString();
    }

    private PrefKeys() {}
}
