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
    static final String KEY_PILL_EXPANDED_ONCE = "pill_expanded_once";
    static final String KEY_ACCESS_KEY = "access_key";
    static final String KEY_ENTER_NEWLINE = "enter_is_newline";
    static final String KEY_ENTER_SEND = "enter_sends_message";
    static final String KEY_SHOW_QUICK_ACTIONS = "composer_quick_actions";
    static final String KEY_SHOW_CODE_KEYS = "composer_code_keys";
    static final String KEY_BIOMETRIC_LOCK = "biometric_lock_enabled";
    static final String KEY_SECURE_SCREEN = "secure_screen_enabled";
    static final String KEY_OFFLINE_COPY = "offline_copy_enabled";

    static final int PORT = 57420;
    static final int STATE_ONLINE = 0;
    static final int STATE_RETRYING = 1;

    static final int MAX_ATTEMPTS = 12;
    static final long BASE_BACKOFF_MS = 1500L;
    static final long MAX_BACKOFF_MS = 8000L;
    static final int MAX_TELEMETRY_HISTORY = 30;
    static final long DISCONNECTION_THRESHOLD_MS = 10 * 60 * 1000L;

    private PrefKeys() {}
}
