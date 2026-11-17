/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.view.KeyEvent;

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
                WebBridge.dispatchEscapeToWeb(a);
                return true;
            }
        }
        return false;
    }
}
