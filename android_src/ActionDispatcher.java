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
 * Despacho de decisiones de aprobacion pendientes o nuevas.
 */
class ActionDispatcher {

    static void checkAndDispatchPendingAction(MainActivity a) {
        if (a.prefs == null) return;
        String pendingAction = a.prefs.getString("pending_action_decision", null);
        String pendingKey = a.prefs.getString("pending_action_id", null);
        if (pendingAction != null && pendingKey != null) {
            a.prefs.edit().remove("pending_action_decision").remove("pending_action_id").apply();
            ActionDispatcher.dispatchAction(a, pendingAction, pendingKey);
        }
    }

    static void dispatchAction(MainActivity a, String action, String key) {
        if ("allow".equals(action) && a.prefs.getBoolean("biometric_critical_actions_enabled", true)
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            a.ui.post(() -> BiometricGate.requestCriticalBiometricApproval(a, key, "Herramienta"));
            return;
        }
        a.ui.post(() -> {
            a.vibrateHaptic("confirm");
            if (a.webView != null) {
                String safeAction = org.json.JSONObject.quote(action);
                String safeKey = org.json.JSONObject.quote(key);
                String script = "if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__(" + safeAction + ", " + safeKey + "); }";
                a.webView.evaluateJavascript(script, null);
            }
        });
    }
}
