/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Cliente movil de DSH Companion.
 *
 * La interfaz es la propia aplicacion web servida por el puente; esta clase solo
 * aporta el contenedor nativo: endurecimiento del WebView, reconexion automatica
 * y un selector discreto de bunker. No reimplementa la experiencia de producto.
 *
 * El resto de responsabilidades vive en clases hermanas del mismo paquete:
 * WebViewSetup/CompanionWebViewClient/CompanionChromeClient, ConnectionController,
 * Discovery, PillUi, BannerUi, HubSheet, SettingsScreen, PcDialogs, PcRegistryStore,
 * UpdateInstaller, BiometricGate, WebBridge, NotesActivity, KillSwitchUi y demas.
 */
public class MainActivity extends Activity {

    public static class TelemetryPoint {
        public final long timestamp;
        public final int cpuPercent;
        public final int tempC;
        public final int ramPercent;

        public TelemetryPoint(long timestamp, int cpuPercent, int tempC, int ramPercent) {
            this.timestamp = timestamp;
            this.cpuPercent = cpuPercent;
            this.tempC = tempC;
            this.ramPercent = ramPercent;
        }
    }

    public static final String PREFS = PrefKeys.PREFS;

    static MainActivity sInstance;
    static boolean sIsAppVisible = false;
    volatile boolean isGeneratingResponse = false;
    final Handler ui = new Handler(Looper.getMainLooper());
    SharedPreferences prefs;
    FrameLayout root;
    WebView webView;
    ProgressBar progressBar;
    LinearLayout pill;
    TextView pillLabel;
    View pillDot;
    LinearLayout banner;
    TextView bannerText;
    Button bannerWolButton;
    AlertDialog sheetDialog;
    AlertDialog settingsDialog;
    String activeUrl = "";
    int state = STATE_RETRYING, attempts = 0;
    boolean reconnecting = false, pageLoading = false;
    boolean mainFrameFailed = false, isImeVisible = false;
    boolean biometricUnlocked = false, biometricPromptActive = false;
    long lastPausedAt = 0L;
    long lastConnectedTime = System.currentTimeMillis();
    boolean disconnectionAlerted = false;
    int composerInsertRetries = 0;
    int dockPushRetries = 0;
    String pendingSharedText = null;
    EditText activeAddPcUrlField = null;
    ValueCallback<Uri[]> fileCallback;
    PermissionRequest audioRequest;
    final ExecutorService scanExecutor = Executors.newSingleThreadExecutor();
    volatile AtomicBoolean scanCancelled = new AtomicBoolean(false); // testigo del sondeo en curso
    Future<?> scanFuture;
    ConnectivityManager.NetworkCallback networkCallback;
    float dragOffsetX, dragOffsetY;
    float touchStartX;
    float touchStartY;
    boolean dragging;

    final ExecutorService pollExecutor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "dsh-poll");
        t.setDaemon(true);
        return t;
    });

    final Runnable restorePillAlpha = () -> PillUi.resetPillAlpha(this);
    final Runnable collapsePill = () -> PillUi.setPillExpanded(this, false, true);
    final Runnable reconnectTick = () -> ConnectionController.runReconnect(this);
    final Runnable disconnectionWatchdog = () -> ConnectionController.disconnectionWatchdogTick(this);
    final Runnable deviceCheckPoll = () -> ConnectionController.deviceCheckPollTick(this);

    public static MainActivity getInstance() { return sInstance; }
    public static boolean isAppVisible() { return sIsAppVisible && sInstance != null; }
    public static String getActiveBunkerUrl(Context context) { return PcRegistryStore.getActiveBunkerUrl(context); }
    public static String getAccessKey(Context context) { return PcRegistryStore.getAccessKey(context); }
    public static boolean shouldShowNotification(Context context) { return NotificationGate.shouldShowNotification(context); }
    public boolean isOnline() { return state == STATE_ONLINE; }
    public void setGenerationState(boolean isGenerating) { this.isGeneratingResponse = isGenerating; }
    public boolean isDark() { return ThemePalette.isDark(this); }
    int themeMode() { return ThemePalette.themeMode(this); }
    boolean isEnterSendEnabled() { return WebBridge.isEnterSendEnabled(this); }
    boolean isEnterNewlineEnabled() { return WebBridge.isEnterNewlineEnabled(this); }
    boolean isQuickActionsEnabled() { return WebBridge.isQuickActionsEnabled(this); }
    boolean isCodeKeysEnabled() { return WebBridge.isCodeKeysEnabled(this); }
    public void recordHeartbeat() { ConnectionController.recordHeartbeat(this); }
    public void saveOfflineDraft(String draft) { WebBridge.saveOfflineDraft(this, draft); }
    public boolean saveOfflineChat(String title, String text, String updatedAt) { return OfflineChatStore.save(this, title, text, updatedAt); }
    public void reloadMainSession() { WebBridge.reloadMainSession(this); }
    public void requestCriticalBiometricApproval(String key, String toolName) {
        BiometricGate.requestCriticalBiometricApproval(this, key, toolName);
    }
    public void downloadAndInstallApk() { UpdateInstaller.downloadAndInstallApk(this); }
    public void sendWakeOnLan(String macAddress) { WakeOnLan.sendWakeOnLan(this, macAddress); }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        // P3: la notificacion de aprobacion ya no guarda decisiones pendientes.
        // Se borran las que pudo dejar una version anterior para que no se
        // apliquen solas al actualizar (el receptor que las usaba ya no existe).
        if (prefs.contains("pending_action_decision") || prefs.contains("pending_action_id")) {
            prefs.edit().remove("pending_action_decision").remove("pending_action_id").apply();
        }
        // 5.2.8: el antiguo modo de consulta en la nube se retiró del cliente. Su
        // almacén legacy "dsh_secure_vault" solo guardaba la clave de ese modo;
        // se borra en la primera apertura para no dejar el valor cifrado.
        SharedPreferences legacyVault = getSharedPreferences("dsh_secure_vault", MODE_PRIVATE);
        if (!legacyVault.getAll().isEmpty()) {
            legacyVault.edit().clear().apply();
        }
        int themeRes = ThemePalette.isDark(this) ? R.style.Theme_Companion : R.style.Theme_Companion_Light;
        setTheme(themeRes);
        super.onCreate(savedInstanceState);
        MainActivity.sInstance = this;
        ThemePalette.applySystemBarsTheme(this);
        // P34: bloqueo de capturas/vista previa, opcional en Ajustes y activo
        // por defecto cuando el bloqueo biométrico está encendido.
        ScreenSecurity.apply(this);
        NotificationHelper.initChannels(this);

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
            }
        }

        // Si el usuario dejo activados los avisos de la PC, el servicio debe
        // seguir vivo tras reiniciar la aplicacion.
        if (PcEventsService.isEnabled(this)) {
            try { PcEventsService.start(this); } catch (Throwable ignored) {}
        }

        if (prefs.getBoolean(KEY_KEEP_SCREEN, true)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        setContentView(root);

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                boolean imeVisible = insets.isVisible(WindowInsets.Type.ime());
                PillUi.onImeVisibilityChanged(this, imeVisible);
            }
            return v.onApplyWindowInsets(insets);
        });

        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsets insets = root.getRootWindowInsets();
                if (insets != null) {
                    PillUi.onImeVisibilityChanged(this, insets.isVisible(WindowInsets.Type.ime()));
                    return;
                }
            }
            android.graphics.Rect r = new android.graphics.Rect();
            root.getWindowVisibleDisplayFrame(r);
            int screenHeight = root.getRootView().getHeight();
            int keypadHeight = screenHeight - r.bottom;
            boolean imeVisible = keypadHeight > screenHeight * 0.15;
            PillUi.onImeVisibilityChanged(this, imeVisible);
        });

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        webView.setBackgroundColor(ThemePalette.isDark(this) ? Color.parseColor("#151517") : Color.parseColor("#FFFFFF"));
        webView.setOnScrollChangeListener((v, scrollX, scrollY, oldX, oldY) -> {
            if (Math.abs(scrollY - oldY) > 6) {
                if (pill != null && pill.getVisibility() == View.VISIBLE) {
                    pill.animate().cancel();
                    pill.animate().alpha(0.20f).setDuration(150).start();
                }
                ui.removeCallbacks(restorePillAlpha);
                ui.postDelayed(restorePillAlpha, 800);
            }
        });
        root.addView(webView);

        BannerUi.buildProgressBar(this);
        BannerUi.buildBanner(this);
        WebViewSetup.configureWebView(this);
        PillUi.buildPill(this);
        ConnectionScreen.build(this);
        PillUi.applyOrientationLayout(this, getResources().getConfiguration().orientation);
        ConnectionController.watchNetwork(this);

        if (savedInstanceState != null) {
            android.webkit.WebBackForwardList restored = webView.restoreState(savedInstanceState);
            android.webkit.WebHistoryItem item = restored == null ? null : restored.getCurrentItem();
            String restoredUrl = item == null ? null : item.getUrl();

            if (restoredUrl != null && (restoredUrl.startsWith("http://") || restoredUrl.startsWith("https://"))) {
                // Sin recomponer activeUrl, toda navegacion interna se abriria
                // en el navegador externo porque la frontera de origen quedaria vacia.
                activeUrl = restoredUrl;
                PillUi.refreshPillLabel(this);
                ConnectionController.markRetrying(this);
            } else {
                ConnectionController.boot(this);
            }
        } else {
            ConnectionController.boot(this);
        }

        if (getIntent() != null && getIntent().getBooleanExtra("trigger_update", false)) {
            // P18: MainActivity está exportada; solo la propia app (notificación
            // de actualización) puede pedir una instalación por extra.
            if (IntentGuard.isTrusted(this, getIntent())) {
                ui.postDelayed(() -> UpdateInstaller.downloadAndInstallApkFromHub(this), 800);
            } else {
                android.util.Log.w("DshIntent", "trigger_update ignorado: intent sin firma de la app");
            }
        }

        IntentRouter.setupDynamicShortcuts(this);
        IntentRouter.handleIncomingIntent(this, getIntent());

        ui.postDelayed(disconnectionWatchdog, 30_000L);
        ui.postDelayed(deviceCheckPoll, 15_000L);
        UpdateInstaller.checkGitHubReleases(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("trigger_update", false)) {
            if (IntentGuard.isTrusted(this, intent)) {
                ui.postDelayed(() -> UpdateInstaller.downloadAndInstallApkFromHub(this), 600);
            } else {
                android.util.Log.w("DshIntent", "trigger_update ignorado: intent sin firma de la app");
            }
        }
        IntentRouter.handleIncomingIntent(this, intent);
    }

    public void vibrateHaptic(String type) {
        try {
            if (root != null) {
                root.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY);
            }
            Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    int duration = "alert".equalsIgnoreCase(type) ? 70 : ("reject".equalsIgnoreCase(type) ? 45 : 25);
                    vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(25);
                }
            }
        } catch (Throwable ignored) {}
    }

    @Override
    protected void onResume() {
        super.onResume();
        // P34: reaplica FLAG_SECURE por si el usuario lo cambió en Ajustes.
        ScreenSecurity.apply(this);
        // H-10: el interruptor de batería se quedaba encendido aunque el sistema
        // denegara la exención; se re-sincroniza al volver del diálogo.
        SettingsNotifications.resyncBatterySwitch(this);
        // Al volver: restaura la pildora (share-sheet), su opacidad y posicion.
        PillUi.onResumeRestore(this);
        ConnectionController.onResume(this);
    }

    @Override
    protected void onPause() {
        // H-04b: volcar la cookie de dispositivo para no perder el emparejamiento.
        WebViewSetup.flushCookies();
        ConnectionController.onPause(this);
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        sIsAppVisible = hasFocus;
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (webView != null && level >= TRIM_MEMORY_MODERATE) {
            webView.clearCache(false);
        }
    }

    @Override
    protected void onDestroy() {
        Cleanup.run(this);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Al rotar el aviso de teclado puede quedar desfasado: reevaluar.
        isImeVisible = false;
        PillUi.applyOrientationLayout(this, newConfig.orientation);
        ui.postDelayed(() -> PillUi.applyOrientationLayout(this,
                getResources().getConfiguration().orientation), 400);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (KeyRouter.dispatchKeyEvent(this, event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        ActivityResults.onActivityResult(this, requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        ActivityResults.onRequestPermissionsResult(this, requestCode, permissions, results);
    }
}
