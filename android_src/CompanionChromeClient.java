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

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * WebChromeClient: progreso, selector de archivos y permisos de audio.
 */
class CompanionChromeClient extends WebChromeClient {

    private final MainActivity a;

    CompanionChromeClient(MainActivity a) {
        this.a = a;
    }

    @Override
    public void onProgressChanged(WebView view, int newProgress) {
        if (newProgress < 100) {
            a.progressBar.setVisibility(View.VISIBLE);
            a.progressBar.setProgress(newProgress);
        } else {
            a.progressBar.setVisibility(View.GONE);
        }
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (a.fileCallback != null) a.fileCallback.onReceiveValue(null);
        // Con el teclado abierto el dock fijo tapaba la capa del selector. Se
        // oculta antes de lanzarlo y se restaura cuando el resultado vuelve
        // (archivo elegido o cancelado), incluso si el lanzamiento falla.
        final ValueCallback<Uri[]> pending = callback;
        a.fileCallback = value -> {
            view.evaluateJavascript(
                    "window.__DSH_SET_FILE_PICKER__ && window.__DSH_SET_FILE_PICKER__(false);", null);
            pending.onReceiveValue(value);
        };
        view.evaluateJavascript(
                "window.__DSH_SET_FILE_PICKER__ && window.__DSH_SET_FILE_PICKER__(true);", null);

        Intent intent = params.createIntent();
        try {
            a.startActivityForResult(intent, REQUEST_FILE);
        } catch (ActivityNotFoundException missing) {
            Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
            fallback.addCategory(Intent.CATEGORY_OPENABLE);
            fallback.setType("*/*");
            try {
                a.startActivityForResult(Intent.createChooser(fallback, "Seleccionar archivo"), REQUEST_FILE);
            } catch (Throwable unavailable) {
                view.evaluateJavascript(
                        "window.__DSH_SET_FILE_PICKER__ && window.__DSH_SET_FILE_PICKER__(false);", null);
                a.fileCallback = null;
                pending.onReceiveValue(null);
            }
        }
        return true;
    }

    @Override
    public void onPermissionRequest(final PermissionRequest request) {
        // Conceder el micrófono sin mirar el origen permitiría que
        // cualquier página o marco llegado al WebView escuche y suba audio.
        if (request == null || !UrlTools.isSameBunker(a, request.getOrigin())) {
            if (request != null) request.deny();
            return;
        }

        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                if (a.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    if (a.audioRequest != null) a.audioRequest.deny();
                    a.audioRequest = request;
                    a.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_AUDIO);
                }
                return;
            }
        }
        request.deny();
    }

    @Override
    public void onPermissionRequestCanceled(PermissionRequest request) {
        if (a.audioRequest == request) a.audioRequest = null;
    }
}
