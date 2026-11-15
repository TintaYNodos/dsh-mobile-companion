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
 * Modelo de un equipo emparejado.
 */
/** Equipo registrado por el usuario (bunker de la red privada). */
class PcEntry {

    String id;
    String name;
    String url;
    String accessKey;
    String macAddress;

    PcEntry(String id, String name, String url, String accessKey) {
        this(id, name, url, accessKey, "");
    }

    PcEntry(String id, String name, String url, String accessKey, String macAddress) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.accessKey = accessKey;
        this.macAddress = macAddress != null ? macAddress : "";
    }

    /**
     * Serializa el equipo. La clave de acceso NUNCA se guarda en claro: se
     * cifra con AndroidKeyStore (AES-256-GCM) antes de escribir el registro.
     */
    org.json.JSONObject toJson(Context context) {
        org.json.JSONObject obj = new org.json.JSONObject();
        try {
            obj.put("id", id);
            obj.put("name", name);
            obj.put("url", url);
            obj.put("accessKey", KeyStoreVault.encryptForStorage(context, accessKey));
            obj.put("macAddress", macAddress);
        } catch (Exception ignored) {}
        return obj;
    }

    /**
     * Reconstruye el equipo descifrando la clave guardada. Las claves antiguas
     * en claro se devuelven tal cual; {@link #needsKeyMigration(org.json.JSONObject)}
     * indica al registro que hay que reescribirlas cifradas.
     */
    static PcEntry fromJson(org.json.JSONObject obj, Context context) {
        if (obj == null) return null;
        return new PcEntry(
                obj.optString("id", String.valueOf(System.currentTimeMillis())),
                obj.optString("name", "PC"),
                obj.optString("url", ""),
                KeyStoreVault.decryptForStorage(context, obj.optString("accessKey", "")),
                obj.optString("macAddress", "")
        );
    }

    /** true si el registro guarda una clave en claro que hay que cifrar. */
    static boolean needsKeyMigration(org.json.JSONObject obj) {
        if (obj == null) return false;
        String stored = obj.optString("accessKey", "");
        return stored != null && !stored.trim().isEmpty() && !KeyStoreVault.isEncryptedValue(stored);
    }
}
