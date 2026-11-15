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

import android.net.ConnectivityManager;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Liberacion ordenada de recursos al destruir la Activity.
 */
class Cleanup {

    /** Suelta todo lo que puede retener la Activity mientras se destruye. */
    static void run(MainActivity a) {
        a.ui.removeCallbacksAndMessages(null);

        a.scanCancelled.set(true);
        if (a.scanFuture != null) {
            a.scanFuture.cancel(true);
            a.scanFuture = null;
        }
        a.scanExecutor.shutdownNow();

        if (a.audioRequest != null) {
            a.audioRequest.deny();
            a.audioRequest = null;
        }
        if (a.fileCallback != null) {
            a.fileCallback.onReceiveValue(null);
            a.fileCallback = null;
        }
        if (a.addressDialog != null && a.addressDialog.isShowing()) {
            try {
                a.addressDialog.dismiss();
            } catch (Throwable ignored) {}
        }
        a.addressDialog = null;

        if (a.sheetDialog != null && a.sheetDialog.isShowing()) {
            try {
                a.sheetDialog.dismiss();
            } catch (Throwable ignored) {}
        }
        a.sheetDialog = null;

        if (a.settingsDialog != null && a.settingsDialog.isShowing()) {
            try {
                a.settingsDialog.dismiss();
            } catch (Throwable ignored) {}
        }
        a.settingsDialog = null;

        try {
            if (a.networkCallback != null) {
                ConnectivityManager manager = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (manager != null) manager.unregisterNetworkCallback(a.networkCallback);
                a.networkCallback = null;
            }
        } catch (Throwable ignored) {
        }

        if (MainActivity.sInstance == a) MainActivity.sInstance = null;
        a.ui.removeCallbacks(a.disconnectionWatchdog);
        a.ui.removeCallbacks(a.deviceCheckPoll);
        a.pollExecutor.shutdownNow();

        if (a.webView != null) {
            // Desacoplar antes de destruir: los callbacks pendientes retienen la
            // Activity durante la destruccion.
            try {
                a.webView.setWebChromeClient(null);
                a.webView.setWebViewClient(null);
                a.webView.setDownloadListener(null);
                a.webView.removeJavascriptInterface("AndroidCompanion");
            } catch (Throwable ignored) {
            }
            a.webView.stopLoading();
            a.webView.loadUrl("about:blank");
            a.webView.clearHistory();
            a.webView.removeAllViews();
            a.root.removeView(a.webView);
            a.webView.destroy();
            a.webView = null;
        }
    }
}
