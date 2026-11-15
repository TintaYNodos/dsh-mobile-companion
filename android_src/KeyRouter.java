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

import android.view.KeyEvent;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Atajos de teclado fisico (Ctrl+Enter, Ctrl+R, Escape).
 */
class KeyRouter {

    static boolean dispatchKeyEvent(MainActivity a, KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            boolean isCtrl = event.isCtrlPressed()
                    || (event.getMetaState() & KeyEvent.META_CTRL_ON) != 0
                    || (event.getModifiers() & KeyEvent.META_CTRL_ON) != 0;

            // Ctrl + Enter: Enviar mensaje al compositor web
            if (isCtrl && (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                WebBridge.submitComposer(a);
                return true;
            }

            // Ctrl + R: Recargar sesión activa
            if (isCtrl && keyCode == KeyEvent.KEYCODE_R) {
                if (a.webView != null) {
                    a.webView.reload();
                }
                return true;
            }

            // Esc: Cerrar bottom sheet / dialogos si estan abiertos o despachar Escape al WebView
            if (keyCode == KeyEvent.KEYCODE_ESCAPE) {
                if (a.sheetDialog != null && a.sheetDialog.isShowing()) {
                    HubSheet.dismissHub(a);
                    return true;
                }
                if (a.addressDialog != null && a.addressDialog.isShowing()) {
                    a.addressDialog.dismiss();
                    return true;
                }
                WebBridge.dispatchEscapeToWeb(a);
                return true;
            }
        }
        return false;
    }
}
