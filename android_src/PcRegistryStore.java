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



import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Registro de equipos (pc_registry_json) y resolucion del bunker.
 */
/** Registro de equipos en SharedPreferences y resolucion del bunker activo. */
class PcRegistryStore {

    /** URL efectiva del bunker para procesos sin Activity (servicio, receptor). */
    static String getActiveBunkerUrl(Context context) {
        if (MainActivity.sInstance != null && MainActivity.sInstance.activeUrl != null
                && !MainActivity.sInstance.activeUrl.trim().isEmpty()) {
            return MainActivity.sInstance.activeUrl;
        }
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        // Fuente principal: el registro de equipos (lo que el usuario configura).
        // Antes solo se leian las claves antiguas bunker_url_1/2, que el editor de
        // PCs no escribe: con la app cerrada la URL salia vacia y el servicio de
        // avisos no se conectaba a nada.
        try {
            org.json.JSONArray arr = new org.json.JSONArray(prefs.getString("pc_registry_json", "[]"));
            if (arr.length() > 0) {
                String activeId = prefs.getString("active_pc_id", "");
                String fallback = "";
                for (int i = 0; i < arr.length(); i++) {
                    org.json.JSONObject row = arr.optJSONObject(i);
                    if (row == null) continue;
                    String url = row.optString("url", "");
                    if (url == null || url.trim().isEmpty()) continue;
                    if (!activeId.isEmpty() && activeId.equals(row.optString("id", ""))) return UrlTools.withScheme(url.trim());
                    if (fallback.isEmpty()) fallback = url.trim();
                }
                if (!fallback.isEmpty()) return UrlTools.withScheme(fallback);
            }
        } catch (Throwable ignored) {}

        int slot = prefs.getInt(KEY_ACTIVE, 1);
        String url = prefs.getString(slot == 1 ? KEY_URL_1 : KEY_URL_2, "");
        if (url == null || url.trim().isEmpty()) {
            url = prefs.getString(slot == 1 ? KEY_URL_2 : KEY_URL_1, "");
        }
        if (url == null) return "";
        url = url.trim();
        return url.isEmpty() ? "" : UrlTools.withScheme(url);
    }

    /**
     * Clave efectiva del bunker para procesos sin actividad (servicio de avisos,
     * receptor de notificaciones).
     *
     * La clave se guarda cifrada con AndroidKeyStore dentro de
     * `pc_registry_json`. Si se encuentra una clave antigua en claro se migra en
     * el acto: se cifra y se reescribe el registro antes de devolverla.
     */
    static String getAccessKey(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        try {
            org.json.JSONArray arr = new org.json.JSONArray(prefs.getString("pc_registry_json", "[]"));
            String activeId = prefs.getString("active_pc_id", "");
            String activeKey = "";
            String fallback = "";
            boolean migrated = false;

            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;

                String stored = row.optString("accessKey", "");
                if (stored == null || stored.trim().isEmpty()) continue;

                // Migracion automatica: lo que este en claro se cifra y se
                // reescribe el registro. Las claves ya cifradas no se tocan.
                if (PcEntry.needsKeyMigration(row)) {
                    try {
                        row.put("accessKey", KeyStoreVault.encryptForStorage(context, stored.trim()));
                        migrated = true;
                    } catch (Exception ignored) {}
                }

                String key = KeyStoreVault.decryptForStorage(context, row.optString("accessKey", stored));
                if (key == null) key = "";
                key = key.trim();
                if (key.isEmpty()) continue;

                if (!activeId.isEmpty() && activeId.equals(row.optString("id", ""))) {
                    activeKey = key;
                }
                if (fallback.isEmpty()) fallback = key;
            }

            if (migrated) {
                prefs.edit().putString("pc_registry_json", arr.toString()).apply();
            }
            if (!activeKey.isEmpty()) return activeKey;
            if (!fallback.isEmpty()) return fallback;
        } catch (Throwable ignored) {}

        // Compatibilidad con la preferencia heredada (version muy antigua).
        // No queda ningun escritor de esta clave: solo se lee si el registro
        // no tiene credenciales.
        String legacy = prefs.getString(KEY_ACCESS_KEY, "");
        return legacy == null ? "" : legacy.trim();
    }

    static List<PcEntry> getPcList(MainActivity a) {
        List<PcEntry> list = new ArrayList<>();
        String raw = a.prefs.getString("pc_registry_json", "");
        boolean needsMigration = false;
        boolean migrationBlocked = false;
        if (!raw.isEmpty()) {
            try {
                org.json.JSONArray arr = new org.json.JSONArray(raw);
                for (int i = 0; i < arr.length(); i++) {
                    org.json.JSONObject row = arr.getJSONObject(i);
                    if (PcEntry.needsKeyMigration(row)) needsMigration = true;
                    PcEntry e = PcEntry.fromJson(row, a);
                    if (e != null && !e.url.isEmpty()) {
                        list.add(e);
                        // Si una clave cifrada no se pudo descifrar (keystore
                        // perdido) no se reescribe el registro para no borrarla.
                        if (e.accessKey.isEmpty() && KeyStoreVault.isEncryptedValue(row.optString("accessKey", ""))) {
                            migrationBlocked = true;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        if (list.isEmpty()) {
            String u1 = a.prefs.getString(KEY_URL_1, "");
            String n1 = a.prefs.getString(KEY_NAME_1, "PC 1");
            String key = a.prefs.getString(KEY_ACCESS_KEY, "");
            if (!u1.isEmpty()) {
                list.add(new PcEntry("pc_1", n1.isEmpty() ? "PC 1" : n1, u1, key));
            }
            String u2 = a.prefs.getString(KEY_URL_2, "");
            String n2 = a.prefs.getString(KEY_NAME_2, "PC 2");
            if (!u2.isEmpty()) {
                list.add(new PcEntry("pc_2", n2.isEmpty() ? "PC 2" : n2, u2, key));
            }
            PcRegistryStore.savePcList(a, list);
            // La clave heredada ya vive cifrada dentro del registro.
            a.prefs.edit().remove(KEY_ACCESS_KEY).apply();
        } else if (needsMigration && !migrationBlocked) {
            // Reescribe el registro con las claves migradas a cifrado.
            PcRegistryStore.savePcList(a, list);
        }
        return list;
    }

    static void savePcList(MainActivity a, List<PcEntry> list) {
        org.json.JSONArray arr = new org.json.JSONArray();
        for (PcEntry e : list) arr.put(e.toJson(a));
        a.prefs.edit().putString("pc_registry_json", arr.toString()).apply();
    }

    static String getActivePcId(MainActivity a, List<PcEntry> list) {
        String active = a.prefs.getString("active_pc_id", "");
        if (!active.isEmpty()) {
            for (PcEntry e : list) {
                if (e.id.equals(active)) return active;
            }
        }
        return list.isEmpty() ? "" : list.get(0).id;
    }

    static void setActivePcId(MainActivity a, String id) {
        a.prefs.edit().putString("active_pc_id", id).apply();
    }

    static PcEntry getActivePc(MainActivity a) {
        List<PcEntry> list = PcRegistryStore.getPcList(a);
        String activeId = PcRegistryStore.getActivePcId(a, list);
        for (PcEntry e : list) {
            if (e.id.equals(activeId)) return e;
        }
        return list.isEmpty() ? null : list.get(0);
    }

    static String activeLabel(MainActivity a) {
        PcEntry pc = PcRegistryStore.getActivePc(a);
        if (pc != null && !pc.name.isEmpty()) {
            return pc.name.length() > 14 ? pc.name.substring(0, 14) + "..." : pc.name;
        }
        return "PC 1";
    }

    static String urlForSlot(MainActivity a, int slot) {
        PcEntry pc = PcRegistryStore.getActivePc(a);
        return pc != null ? pc.url : a.prefs.getString(KEY_URL_1, "");
    }

    /** Ultima computadora conocida (activa, guardada o del registro), o "" si no hay. */
    static String lastKnownBunkerUrl(MainActivity a) {
        PcEntry pc = PcRegistryStore.getActivePc(a);
        if (pc != null && pc.url != null && !pc.url.trim().isEmpty()) return UrlTools.normalizeUrl(pc.url);

        String stored = a.prefs.getString(KEY_URL_1, "");
        if (stored != null && !stored.trim().isEmpty()) return UrlTools.normalizeUrl(stored);

        for (PcEntry entry : PcRegistryStore.getPcList(a)) {
            if (entry != null && entry.url != null && !entry.url.trim().isEmpty()) return UrlTools.normalizeUrl(entry.url);
        }
        return "";
    }
}
