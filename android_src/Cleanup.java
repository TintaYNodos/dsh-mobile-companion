/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.net.ConnectivityManager;

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

        // La capa sin conexión guarda referencias a vistas de la Activity.
        ConnectionScreen.release(a);

        try {
            if (a.networkCallback != null) {
                ConnectivityManager manager = (ConnectivityManager) a.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (manager != null) manager.unregisterNetworkCallback(a.networkCallback);
                a.networkCallback = null;
            }
        } catch (Throwable ignored) {
        }

        if (MainActivity.sInstance == a) MainActivity.sInstance = null;
        // P1: la sesión JS desaparece con la vista; el nonce deja de ser válido.
        BridgeGuard.revoke();
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
