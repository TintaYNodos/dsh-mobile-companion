/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.hardware.biometrics.BiometricPrompt;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.HapticFeedbackConstants;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.HttpAuthHandler;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.io.File;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cliente movil de DeepSeek Harness.
 *
 * La interfaz es la propia aplicacion web servida por el puente; esta clase solo
 * aporta el contenedor nativo: endurecimiento del WebView, reconexion automatica
 * y un selector discreto de bunker. No reimplementa la experiencia de producto.
 */
public class MainActivity extends Activity {

    private static final int REQUEST_FILE = 1001;
    private static final int REQUEST_AUDIO = 2002;
    private static final int REQUEST_NOTIFICATIONS = 3003;
    private static final int REQUEST_INSTALL_PERMISSION = 4004;

    private static MainActivity sInstance;
    private static boolean sIsAppVisible = false;

    public static MainActivity getInstance() {
        return sInstance;
    }

    public static boolean isAppVisible() {
        return sIsAppVisible && sInstance != null;
    }

    public static String getActiveBunkerUrl(Context context) {
        if (sInstance != null && sInstance.activeUrl != null && !sInstance.activeUrl.trim().isEmpty()) {
            return sInstance.activeUrl;
        }
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int slot = prefs.getInt(KEY_ACTIVE, 1);
        String url = prefs.getString(slot == 1 ? KEY_URL_1 : KEY_URL_2, "");
        if (url == null || url.trim().isEmpty()) {
            url = prefs.getString(slot == 1 ? KEY_URL_2 : KEY_URL_1, "");
        }
        if (url == null) return "";
        url = url.trim();
        if (!url.isEmpty() && !url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        return url;
    }

    public static String getAccessKey(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getString(KEY_ACCESS_KEY, "");
    }

    public void checkAndDispatchPendingAction() {
        if (prefs == null) return;
        String pendingAction = prefs.getString("pending_action_decision", null);
        String pendingKey = prefs.getString("pending_action_id", null);
        if (pendingAction != null && pendingKey != null) {
            prefs.edit().remove("pending_action_decision").remove("pending_action_id").apply();
            dispatchAction(pendingAction, pendingKey);
        }
    }

    private long lastConnectedTime = System.currentTimeMillis();
    private boolean disconnectionAlerted = false;
    private static final long DISCONNECTION_THRESHOLD_MS = 10 * 60 * 1000L;

    private static final String PREFS = "DshCompanionPrefs";
    private static final String KEY_URL_1 = "bunker_url_1";
    private static final String KEY_NAME_1 = "bunker_name_1";
    private static final String KEY_URL_2 = "bunker_url_2";
    private static final String KEY_NAME_2 = "bunker_name_2";
    private static final String KEY_ACTIVE = "active_slot";
    private static final String KEY_KEEP_SCREEN = "keep_screen_on";
    private static final String KEY_PILL_Y = "pill_fraction_y";
    private static final String KEY_PILL_EXPANDED_ONCE = "pill_expanded_once";
    private static final String KEY_ACCESS_KEY = "access_key";
    private static final String KEY_ENTER_NEWLINE = "enter_is_newline";

    private static final int PORT = 57420;

    private static final int STATE_ONLINE = 0;
    private static final int STATE_RETRYING = 1;

    private AlertDialog sheetDialog;

    private WebView webView;
    private FrameLayout root;
    private LinearLayout pill;
    private TextView pillLabel;
    private View pillDot;
    private ProgressBar progressBar;
    private LinearLayout banner;
    private TextView bannerText;

    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest audioRequest;
    private SharedPreferences prefs;

    private String activeUrl = "";
    private int state = STATE_RETRYING;
    private int attempts = 0;
    private boolean reconnecting = false;

    /** Identidad de la carga en curso: evita que eventos de cargas distintas se pisen. */
    private boolean pageLoading = false;
    private boolean mainFrameFailed = false;
    private final ExecutorService scanExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean scanCancelled = new AtomicBoolean(false);
    private Future<?> scanFuture;
    private AlertDialog addressDialog;

    private static final int MAX_ATTEMPTS = 12;
    private static final long BASE_BACKOFF_MS = 1500L;
    private static final long MAX_BACKOFF_MS = 8000L;

    private float dragOffsetY;
    private float touchStartX;
    private float touchStartY;
    private boolean dragging;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable collapsePill = () -> setPillExpanded(false, true);
    private final Runnable reconnectTick = this::runReconnect;

    private ConnectivityManager.NetworkCallback networkCallback;

    private final Runnable disconnectionWatchdog = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            long elapsed = now - lastConnectedTime;
            if (state != STATE_ONLINE && elapsed >= DISCONNECTION_THRESHOLD_MS && !disconnectionAlerted) {
                disconnectionAlerted = true;
                long minutes = elapsed / (60 * 1000L);
                NotificationHelper.notifyDisconnection(MainActivity.this, minutes, activeLabel());
            }
            ui.postDelayed(this, 30_000L);
        }
    };

    private final Runnable deviceCheckPoll = new Runnable() {
        @Override
        public void run() {
            if (state == STATE_ONLINE && !activeUrl.isEmpty()) {
                final String target = activeUrl;
                new Thread(() -> checkPendingDevices(target)).start();
            }
            ui.postDelayed(this, 15_000L);
        }
    };

    public void recordHeartbeat() {
        lastConnectedTime = System.currentTimeMillis();
        if (disconnectionAlerted) {
            disconnectionAlerted = false;
            NotificationHelper.cancelDisconnection(this);
        }
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

    public void dispatchAction(String action, String key) {
        if ("allow".equals(action) && prefs.getBoolean("biometric_critical_actions_enabled", true)
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ui.post(() -> requestCriticalBiometricApproval(key, "Herramienta"));
            return;
        }
        ui.post(() -> {
            vibrateHaptic("confirm");
            if (webView != null) {
                String safeAction = action.replace("'", "\\'");
                String safeKey = key.replace("'", "\\'");
                String script = "if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__('" + safeAction + "', '" + safeKey + "'); }";
                webView.evaluateJavascript(script, null);
            }
        });
    }

    public void requestCriticalBiometricApproval(String key, String toolName) {
        if (!prefs.getBoolean("biometric_critical_actions_enabled", true) || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            vibrateHaptic("confirm");
            if (webView != null) {
                String safeKey = key.replace("'", "\\'");
                webView.evaluateJavascript("if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__('allow', '" + safeKey + "'); }", null);
            }
            return;
        }

        CancellationSignal signal = new CancellationSignal();
        BiometricPrompt prompt = new BiometricPrompt.Builder(this)
                .setTitle("Confirmar accion critica")
                .setSubtitle("Autorizar ejecucion de " + (toolName != null && !toolName.isEmpty() ? toolName : "herramienta"))
                .setNegativeButton("Cancelar", getMainExecutor(), (d, w) -> {
                    vibrateHaptic("reject");
                    Toast.makeText(this, "Accion cancelada por el usuario", Toast.LENGTH_SHORT).show();
                })
                .build();

        try {
            prompt.authenticate(signal, getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    vibrateHaptic("confirm");
                    if (webView != null) {
                        String safeKey = key.replace("'", "\\'");
                        webView.evaluateJavascript("if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__('allow', '" + safeKey + "'); }", null);
                    }
                    Toast.makeText(MainActivity.this, "Accion autorizada biometricamente", Toast.LENGTH_SHORT).show();
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    vibrateHaptic("reject");
                    Toast.makeText(MainActivity.this, "No se autorizo la accion: " + errString, Toast.LENGTH_SHORT).show();
                }
            });
        } catch (Throwable e) {
            vibrateHaptic("confirm");
            if (webView != null) {
                String safeKey = key.replace("'", "\\'");
                webView.evaluateJavascript("if (window.__DSH_COMPANION_ACTION__) { window.__DSH_COMPANION_ACTION__('allow', '" + safeKey + "'); }", null);
            }
        }
    }

    private String pendingSharedText = null;

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (shared != null && shared.length() > 0) {
                pendingSharedText = shared.toString();
                injectSharedTextIfReady();
            }
            return;
        }

        if (intent.hasExtra("shortcut_action")) {
            String scAction = intent.getStringExtra("shortcut_action");
            if ("new_chat".equals(scAction)) {
                ui.postDelayed(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript("var btn = document.querySelector('button[aria-label*=\"New\" i], button[aria-label*=\"Nuevo\" i], [class*=\"newChat\" i]'); if (btn) btn.click();", null);
                    }
                }, 800);
            } else if ("telemetry".equals(scAction)) {
                ui.postDelayed(this::openHub, 300);
            } else if ("network".equals(scAction)) {
                ui.postDelayed(this::openAddressEditor, 300);
            }
        }
    }

    private void injectSharedTextIfReady() {
        if (pendingSharedText == null || pendingSharedText.isEmpty() || webView == null) return;
        String json = pendingSharedText.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
        webView.evaluateJavascript("if (window.__DSH_INSERT_INTO_COMPOSER__) { window.__DSH_INSERT_INTO_COMPOSER__(\"" + json + "\"); }", (res) -> {
            if ("true".equals(res)) {
                Toast.makeText(this, "Texto compartido insertado en el compositor", Toast.LENGTH_SHORT).show();
                pendingSharedText = null;
            }
        });
    }

    private void checkPendingDevices(String baseUrl) {
        HttpURLConnection conn = null;
        try {
            String statusUrl = baseUrl.replaceAll("/+$", "") + "/dsh-companion/status";
            URL url = new URL(statusUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            conn.setRequestMethod("GET");
            conn.setUseCaches(false);
            String cookie = android.webkit.CookieManager.getInstance().getCookie(statusUrl);
            if (cookie != null) conn.setRequestProperty("Cookie", cookie);

            int respCode = conn.getResponseCode();
            String setCookie = conn.getHeaderField("Set-Cookie");
            if (setCookie != null && !setCookie.isEmpty()) {
                android.webkit.CookieManager.getInstance().setCookie(statusUrl, setCookie);
                android.webkit.CookieManager.getInstance().flush();
            }

            if (respCode == 200) {
                java.io.InputStream is = conn.getInputStream();
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[1024];
                int n;
                while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
                String json = baos.toString("UTF-8");
                is.close();

                org.json.JSONObject obj = new org.json.JSONObject(json);

                String serverVer = obj.optString("apkVersion", obj.optString("version", ""));
                int serverCode = obj.optInt("apkVersionCode", 0);
                String prevVer = obj.optString("previousApkVersion", "");
                int prevCode = obj.optInt("previousApkVersionCode", 0);
                if (serverCode > 0) {
                    prefs.edit()
                            .putString("server_apk_version", serverVer)
                            .putInt("server_apk_code", serverCode)
                            .putString("server_prev_apk_version", prevVer)
                            .putInt("server_prev_apk_code", prevCode)
                            .apply();

                    int installedCode = getInstalledVersionCode();
                    if (serverCode > installedCode) {
                        long lastNotif = prefs.getLong("last_update_notif_time", 0);
                        long now = System.currentTimeMillis();
                        if (now - lastNotif > 4 * 3600 * 1000) {
                            prefs.edit().putLong("last_update_notif_time", now).apply();
                            final String finalVer = serverVer;
                            ui.post(() -> NotificationHelper.notifyAppUpdateAvailable(this, finalVer));
                        }
                    }
                }

                if (obj.has("systemStats") && !obj.isNull("systemStats")) {
                    org.json.JSONObject stats = obj.optJSONObject("systemStats");
                    if (stats != null) {
                        org.json.JSONObject cpu = stats.optJSONObject("cpu");
                        org.json.JSONObject ram = stats.optJSONObject("ram");
                        org.json.JSONObject disk = stats.optJSONObject("disk");

                        int cpuPercent = cpu != null ? cpu.optInt("usagePercent", 0) : 0;
                        int tempC = cpu != null ? cpu.optInt("tempC", 0) : 0;
                        double ramUsed = ram != null ? ram.optDouble("usedGb", 0) : 0;
                        double ramTotal = ram != null ? ram.optDouble("totalGb", 0) : 0;
                        int ramPercent = ram != null ? ram.optInt("percent", 0) : 0;
                        double diskFree = disk != null ? disk.optDouble("freeGb", 0) : 0;
                        String uptime = stats.optString("uptime", "");

                        prefs.edit()
                                .putInt("stat_cpu_percent", cpuPercent)
                                .putInt("stat_cpu_temp", tempC)
                                .putFloat("stat_ram_used", (float) ramUsed)
                                .putFloat("stat_ram_total", (float) ramTotal)
                                .putInt("stat_ram_percent", ramPercent)
                                .putFloat("stat_disk_free", (float) diskFree)
                                .putString("stat_uptime", uptime)
                                .apply();
                    }
                }

                if (obj.has("pendingList")) {
                    org.json.JSONArray list = obj.getJSONArray("pendingList");
                    for (int i = 0; i < list.length(); i++) {
                        org.json.JSONObject dev = list.getJSONObject(i);
                        String devId = dev.optString("id");
                        String devCode = dev.optString("code");
                        String devAgent = dev.optString("agent");
                        String devAddress = dev.optString("address");
                        ui.post(() -> {
                            NotificationHelper.notifyDevicePairing(this, devId, devCode, devAgent, devAddress, baseUrl);
                        });
                    }
                }
            }
        } catch (Throwable ignored) {
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int themeRes = isDark() ? R.style.Theme_Companion : R.style.Theme_Companion_Light;
        setTheme(themeRes);
        super.onCreate(savedInstanceState);
        sInstance = this;
        applySystemBarsTheme();
        NotificationHelper.initChannels(this);

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
            }
        }

        if (prefs.getBoolean(KEY_KEEP_SCREEN, true)) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        setContentView(root);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        webView.setBackgroundColor(isDark() ? Color.parseColor("#151517") : Color.parseColor("#FFFFFF"));
        root.addView(webView);

        buildProgressBar();
        buildBanner();
        configureWebView();
        buildPill();
        watchNetwork();

        if (savedInstanceState != null) {
            android.webkit.WebBackForwardList restored = webView.restoreState(savedInstanceState);
            android.webkit.WebHistoryItem item = restored == null ? null : restored.getCurrentItem();
            String restoredUrl = item == null ? null : item.getUrl();

            if (restoredUrl != null && (restoredUrl.startsWith("http://") || restoredUrl.startsWith("https://"))) {
                // Sin recomponer activeUrl, toda navegacion interna se abriria
                // en el navegador externo porque la frontera de origen quedaria vacia.
                activeUrl = restoredUrl;
                refreshPillLabel();
                markRetrying();
            } else {
                boot();
            }
        } else {
            boot();
        }

        if (getIntent() != null && getIntent().getBooleanExtra("trigger_update", false)) {
            ui.postDelayed(this::downloadAndInstallApk, 800);
        }

        setupDynamicShortcuts();
        handleIncomingIntent(getIntent());

        ui.postDelayed(disconnectionWatchdog, 30_000L);
        ui.postDelayed(deviceCheckPoll, 15_000L);
        checkGitHubReleases();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("trigger_update", false)) {
            ui.postDelayed(this::downloadAndInstallApk, 600);
        }
        handleIncomingIntent(intent);
    }

    private void setupDynamicShortcuts() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return;
        try {
            ShortcutManager sm = getSystemService(ShortcutManager.class);
            if (sm == null) return;

            Intent newChatIntent = new Intent(this, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("shortcut_action", "new_chat");

            Intent telemetryIntent = new Intent(this, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("shortcut_action", "telemetry");

            Intent networkIntent = new Intent(this, MainActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .putExtra("shortcut_action", "network");

            ShortcutInfo sc1 = new ShortcutInfo.Builder(this, "sc_new_chat")
                    .setShortLabel("Nuevo chat")
                    .setLongLabel("Nuevo chat en Harness")
                    .setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher))
                    .setIntent(newChatIntent)
                    .build();

            ShortcutInfo sc2 = new ShortcutInfo.Builder(this, "sc_telemetry")
                    .setShortLabel("Telemetria PC")
                    .setLongLabel("Monitoreo de hardware")
                    .setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher))
                    .setIntent(telemetryIntent)
                    .build();

            ShortcutInfo sc3 = new ShortcutInfo.Builder(this, "sc_network")
                    .setShortLabel("Estado de red")
                    .setLongLabel("Diagnostico y rutas")
                    .setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher))
                    .setIntent(networkIntent)
                    .build();

            List<ShortcutInfo> list = new ArrayList<>();
            list.add(sc1);
            list.add(sc2);
            list.add(sc3);
            sm.setDynamicShortcuts(list);
        } catch (Throwable ignored) {}
    }

    // ---------------------------------------------------------------- utilidades

    int themeMode() {
        return prefs != null ? prefs.getInt("theme_mode", 0) : 0;
    }

    boolean isDark() {
        int m = themeMode();
        if (m == 1) return true;
        if (m == 2) return false;
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    private int dp(float value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    private int color(int darkValue, int lightValue) {
        return isDark() ? darkValue : lightValue;
    }

    private int surface() {
        return color(Color.parseColor("#161B22"), Color.parseColor("#FFFFFF"));
    }

    private int raised() {
        return color(Color.parseColor("#21262D"), Color.parseColor("#F6F8FA"));
    }

    private int outline() {
        return color(Color.parseColor("#30363D"), Color.parseColor("#D0D7DE"));
    }

    private int ink() {
        return color(Color.parseColor("#E6EDF3"), Color.parseColor("#1F2328"));
    }

    private int inkDim() {
        return color(Color.parseColor("#8B949E"), Color.parseColor("#656D76"));
    }

    /** Acento DeepSeek oficial: azul DeepSeek sobre oscuro, azul intenso sobre claro. */
    private int accentInk() {
        return color(Color.parseColor("#58A6FF"), Color.parseColor("#0969DA"));
    }

    private int accentPrimary() {
        return color(Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA"));
    }

    private GradientDrawable rounded(int fill, int stroke, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setColor(fill);
        if (stroke != Color.TRANSPARENT) drawable.setStroke(dp(1), stroke);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    // ------------------------------------------------------------- infraestructura

    private void buildProgressBar() {
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(2), Gravity.TOP);
        progressBar.setLayoutParams(params);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        root.addView(progressBar);
    }

    private void buildBanner() {
        banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.HORIZONTAL);
        banner.setGravity(Gravity.CENTER_VERTICAL);
        banner.setPadding(dp(14), dp(9), dp(14), dp(9));
        banner.setBackground(rounded(
                color(Color.parseColor("#1E1A11"), Color.parseColor("#FEF6E7")),
                color(Color.parseColor("#B45309"), Color.parseColor("#D97706")),
                9f));

        bannerText = new TextView(this);
        bannerText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        bannerText.setTextColor(color(Color.parseColor("#FCD34D"), Color.parseColor("#92400E")));
        bannerText.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        banner.addView(bannerText);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        params.setMargins(dp(10), dp(10), dp(10), 0);
        banner.setLayoutParams(params);
        banner.setVisibility(View.GONE);
        banner.setAlpha(0f);
        root.addView(banner);
    }

    private void showBanner(String message) {
        bannerText.setText(message);
        banner.setContentDescription(message);
        banner.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        if (banner.getVisibility() != View.VISIBLE) {
            banner.setVisibility(View.VISIBLE);
            banner.animate().alpha(1f).setDuration(180).start();
            banner.announceForAccessibility(message);
        }
    }

    private void hideBanner() {
        if (banner.getVisibility() != View.VISIBLE) return;
        banner.animate().alpha(0f).setDuration(160).withEndAction(() -> banner.setVisibility(View.GONE)).start();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setSavePassword(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setDefaultTextEncodingName("UTF-8");

        try {
            settings.setSafeBrowsingEnabled(true);
        } catch (Throwable ignored) {
        }

        WebView.setWebContentsDebuggingEnabled(false);

        android.webkit.CookieManager cookieManager = android.webkit.CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new CompanionBridge(this), "AndroidCompanion");

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null) return;
            if (url.toLowerCase().contains(".apk") && url.toLowerCase().contains("dsh-companion")) {
                downloadAndInstallApk();
                return;
            }

            try {
                String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
                if (contentDisposition != null && contentDisposition.contains("filename=")) {
                    filename = contentDisposition.replaceFirst("(?i).*filename=[\"']?([^\"';]+).*", "$1");
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                if (mimetype != null && !mimetype.isEmpty()) request.setMimeType(mimetype);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                request.addRequestHeader("User-Agent", userAgent);
                request.setDescription("Descargando " + filename);
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);

                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) {
                    dm.enqueue(request);
                    Toast.makeText(this, "Descargando: " + filename, Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(i);
                } catch (Exception ignored) {
                    Toast.makeText(this, "Error al descargar: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;

                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, REQUEST_FILE);
                } catch (ActivityNotFoundException missing) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("*/*");
                    startActivityForResult(Intent.createChooser(fallback, "Seleccionar archivo"), REQUEST_FILE);
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Conceder el micrÃ³fono sin mirar el origen permitirÃ­a que
                // cualquier pÃ¡gina o marco llegado al WebView escuche y suba audio.
                if (request == null || !isSameBunker(request.getOrigin())) {
                    if (request != null) request.deny();
                    return;
                }

                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        } else {
                            if (audioRequest != null) audioRequest.deny();
                            audioRequest = request;
                            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_AUDIO);
                        }
                        return;
                    }
                }
                request.deny();
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (audioRequest == request) audioRequest = null;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || !request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if (scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                    if (isSameBunker(uri)) return false;
                    openExternally(uri);
                    return true;
                }
                if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme)) {
                    openExternally(uri);
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pageLoading = true;
                mainFrameFailed = false;
                applyThemeToWeb();
                applyEnterBehaviorToWeb();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoading = false;
                // onPageFinished se invoca tambiÃ©n sobre la pÃ¡gina de error y
                // despuÃ©s de onReceivedError: sin esta guarda se anularÃ­a el
                // reintento reciÃ©n programado y el punto se pondrÃ­a en verde.
                if (mainFrameFailed) return;
                if (url == null) return;
                Uri parsed = Uri.parse(url);
                if (!isSameBunker(parsed)) return;

                // La pantalla de espera es del mismo origen que la app: si se
                // marcara "en linea" el indicador mentiria mientras se aprueba.
                CharSequence title = view.getTitle();
                if (title != null && (title.toString().toLowerCase().contains("esperando")
                        || title.toString().toLowerCase().contains("pendiente"))) {
                    markRetrying();
                    showBanner("Esperando aprobación en la computadora.");
                    scheduleReconnect(1500);
                    return;
                }

                markOnline();
                checkAndDispatchPendingAction();
                applyThemeToWeb();
                applyEnterBehaviorToWeb();
                injectSharedTextIfReady();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request == null || !request.isForMainFrame()) return;
                if (!isTransientNetworkError(error)) return;
                pageLoading = false;
                mainFrameFailed = true;
                markFailed();
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                            android.webkit.WebResourceResponse response) {
                if (request == null || !request.isForMainFrame()) return;
                if (response == null || response.getStatusCode() < 500) return;
                pageLoading = false;
                mainFrameFailed = true;
                markFailed();
            }

            @Override
            public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler,
                                                  String host, String realm) {
                PcEntry pc = getActivePc();
                String key = (pc != null && pc.accessKey != null && !pc.accessKey.trim().isEmpty())
                        ? pc.accessKey.trim()
                        : prefs.getString(KEY_ACCESS_KEY, "");
                if (key == null || key.trim().isEmpty()) {
                    handler.cancel();
                    promptAccessKey();
                    return;
                }
                handler.proceed("dsh", key.trim());
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
            }
        });
    }

    /**
     * Solo los fallos de red justifican reintentar. Un aborto por navegaciÃ³n o
     * un esquema no soportado son decisiones, no averÃ­as.
     */
    private boolean isTransientNetworkError(WebResourceError error) {
        if (error == null) return false;
        switch (error.getErrorCode()) {
            case -3:
                return false;
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_REDIRECT_LOOP:
                return true;
            default:
                return false;
        }
    }

    /**
     * Frontera de origen: esquema, host y puerto efectivos. Comparar solo el
     * host abrirÃ­a cualquier otro servicio ofrecido por la misma mÃ¡quina.
     */
    private boolean isSameBunker(Uri uri) {
        if (activeUrl.isEmpty() || uri == null) return false;
        return sameOrigin(uri, Uri.parse(activeUrl));
    }

    private boolean sameOrigin(Uri left, Uri right) {
        if (left == null || right == null) return false;
        String leftScheme = left.getScheme();
        String rightScheme = right.getScheme();
        if (leftScheme == null || rightScheme == null || !leftScheme.equalsIgnoreCase(rightScheme)) return false;
        String leftHost = left.getHost();
        String rightHost = right.getHost();
        if (leftHost == null || rightHost == null || !leftHost.equalsIgnoreCase(rightHost)) return false;
        return effectivePort(left) == effectivePort(right);
    }

    private int effectivePort(Uri uri) {
        int port = uri.getPort();
        if (port != -1) return port;
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    /** Completa el esquema y el puerto del bÃºnker cuando el usuario los omite. */
    private String normalizeUrl(String raw) {
        String url = raw == null ? "" : raw.trim();
        if (url.isEmpty()) return url;
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://" + url;

        Uri parsed = Uri.parse(url);
        if (parsed.getHost() == null) return url;
        if (parsed.getPort() == -1 && "http".equalsIgnoreCase(parsed.getScheme())) {
            String tail = parsed.getEncodedPath() == null ? "/" : parsed.getEncodedPath();
            return "http://" + parsed.getHost() + ":" + PORT + tail;
        }
        return url;
    }

    private void openExternally(Uri uri) {
        if (uri == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(Intent.createChooser(intent, "Abrir enlace"));
        } catch (ActivityNotFoundException missing) {
            Toast.makeText(this, "No hay ninguna aplicacion para abrir este enlace", Toast.LENGTH_SHORT).show();
        }
    }

    private void watchNetwork() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return;

            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    ui.post(() -> resetAndReconnect());
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                    if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                        ui.post(() -> resetAndReconnect());
                    }
                }
            };
            manager.registerDefaultNetworkCallback(networkCallback);
        } catch (Throwable ignored) {
        }
    }

    private void resetAndReconnect() {
        if (state == STATE_ONLINE || pageLoading || isFinishing() || webView == null) return;
        attempts = 0;
        scheduleReconnect(300);
    }

    // ------------------------------------------------------------------ estado

    private void markOnline() {
        state = STATE_ONLINE;
        attempts = 0;
        reconnecting = false;
        ui.removeCallbacks(reconnectTick);
        recordHeartbeat();
        paintDot(Color.parseColor("#10B981"));
        hideBanner();
        updatePillDescription();
        collapseSoon();
    }

    private void markRetrying() {
        state = STATE_RETRYING;
        paintDot(Color.parseColor("#F59E0B"));
        updatePillDescription();
    }

    private void markFailed() {
        markRetrying();
        String diagnosticMsg = diagnoseConnectionFailure();
        showBanner(diagnosticMsg);
        scheduleReconnect(0);
    }

    private String diagnoseConnectionFailure() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            Network net = cm.getActiveNetwork();
            if (net == null) return "Sin conexion a internet en el celular.";
            NetworkCapabilities cap = cm.getNetworkCapabilities(net);
            if (cap == null || !cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                return "Sin conexion a internet en el celular.";
            }
        }

        boolean hasVpnInterface = false;
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;
                String name = iface.getName().toLowerCase();
                if (name.contains("tun") || name.contains("zt") || name.contains("tailscale") || name.contains("vpn")) {
                    hasVpnInterface = true;
                    break;
                }
            }
        } catch (Throwable ignored) {}

        if (!hasVpnInterface) {
            return "Red privada inactiva en el telefono. Abre ZeroTier o Tailscale.";
        }

        return "Computadora no responde. Revisa que la PC este encendida y conectada a la VPN.";
    }

    private void scheduleReconnect(long delayMs) {
        if (reconnecting || isFinishing() || webView == null) return;

        reconnecting = true;
        attempts += 1;
        long backoff = Math.max(delayMs, Math.min(BASE_BACKOFF_MS * attempts, MAX_BACKOFF_MS));
        long jitter = (long) (Math.random() * 400);
        ui.removeCallbacks(reconnectTick);
        ui.postDelayed(reconnectTick, backoff + jitter);
    }

    private void runReconnect() {
        reconnecting = false;
        if (state == STATE_ONLINE || isFinishing() || webView == null) return;
        if (pageLoading) return;

        int slot = prefs.getInt(KEY_ACTIVE, 1);
        String saved = urlForSlot(slot);
        if (saved != null && !saved.trim().isEmpty()) {
            activeUrl = saved.trim();
        }

        if (activeUrl.isEmpty()) {
            discover(true);
            return;
        }

        startLoad(activeUrl);
    }

    /** Punto Ãºnico de navegaciÃ³n: marca la carga para que los eventos se distingan. */
    private void startLoad(String url) {
        if (webView == null) return;
        pageLoading = true;
        mainFrameFailed = false;
        webView.loadUrl(url);
    }

    // ------------------------------------------------------------- pill flotante

    private void buildPill() {
        pill = new LinearLayout(this);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER);
        // 48 dp de Ã¡rea tÃ¡ctil: el mÃ­nimo recomendado para un objetivo aislado.
        pill.setMinimumWidth(dp(48));
        pill.setMinimumHeight(dp(48));
        pill.setClickable(true);
        pill.setFocusable(true);
        pill.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);

        pillDot = new View(this);
        LinearLayout.LayoutParams dotParams = new LinearLayout.LayoutParams(dp(10), dp(10));
        dotParams.setMarginEnd(dp(7));
        pillDot.setLayoutParams(dotParams);
        pillDot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        paintDot(Color.parseColor("#F59E0B"));

        pillLabel = new TextView(this);
        pillLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        pillLabel.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        pillLabel.setSingleLine(true);
        pillLabel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

        pill.addView(pillDot);
        pill.addView(pillLabel);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.END);
        float storedFraction = prefs.getFloat(KEY_PILL_Y, 0.35f);
        params.topMargin = (int) (getResources().getDisplayMetrics().heightPixels * storedFraction);
        params.setMarginEnd(dp(10));
        pill.setLayoutParams(params);
        pill.setElevation(dp(8));

        // El clic accesible (TalkBack, ENTER, D-pad) entra por aquÃ­.
        pill.setOnClickListener(v -> openHub());

        pill.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        touchStartX = event.getRawX();
                        touchStartY = event.getRawY();
                        dragOffsetY = view.getY() - event.getRawY();
                        dragging = false;
                        ui.removeCallbacks(collapsePill);
                        expandPill();
                        return true;

                    case MotionEvent.ACTION_MOVE: {
                        float dx = Math.abs(event.getRawX() - touchStartX);
                        float dy = Math.abs(event.getRawY() - touchStartY);
                        if (!dragging && (dx > dp(6) || dy > dp(6))) dragging = true;

                        if (dragging) {
                            int limit = getResources().getDisplayMetrics().heightPixels
                                    - view.getHeight() - dp(48);
                            float next = event.getRawY() + dragOffsetY;
                            view.setY(Math.max(dp(44), Math.min(next, limit)));
                        }
                        return true;
                    }

                    case MotionEvent.ACTION_UP:
                        if (!dragging) {
                            // performClick respeta el contrato de accesibilidad y
                            // dispara el mismo manejador que TalkBack.
                            view.performClick();
                        } else {
                            float fraction = view.getY() / Math.max(1, getResources().getDisplayMetrics().heightPixels);
                            prefs.edit().putFloat(KEY_PILL_Y, Math.min(0.95f, Math.max(0.02f, fraction))).apply();
                            collapseSoon();
                        }
                        return true;

                    case MotionEvent.ACTION_CANCEL:
                        collapseSoon();
                        return true;
                }
                return false;
            }
        });

        pill.setOnLongClickListener(v -> {
            if (webView != null) webView.reload();
            Toast.makeText(this, "Recargando", Toast.LENGTH_SHORT).show();
            return true;
        });

        root.addView(pill);
        setPillExpanded(!prefs.getBoolean(KEY_PILL_EXPANDED_ONCE, false), false);
        collapseSoon();
    }

    private void paintDot(int fill) {
        if (pillDot == null) return;
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(fill);
        pillDot.setBackground(drawable);
    }

    private void setPillExpanded(boolean expanded, boolean animate) {
        if (pill == null) return;

        pillLabel.setVisibility(expanded ? View.VISIBLE : View.GONE);
        pill.setPadding(expanded ? dp(12) : dp(14), dp(8), expanded ? dp(14) : dp(14), dp(8));
        pill.setBackground(rounded(color(Color.parseColor("#161B22"), Color.parseColor("#FFFFFF")),
                expanded ? accentPrimary() : outline(),
                expanded ? 14f : 999f));
        pill.animate().cancel();
        pill.animate().alpha(expanded ? 1f : 0.94f).setDuration(animate ? 200 : 0).start();
        pillLabel.setTextColor(ink());
        updatePillDescription();

        if (expanded) {
            prefs.edit().putBoolean(KEY_PILL_EXPANDED_ONCE, true).apply();
        }
    }

    /**
     * Descripcion para lectores de pantalla: la pildora colapsada no muestra
     * texto, asi que sin esto TalkBack solo anunciaria un elemento sin nombre.
     */
    private void updatePillDescription() {
        if (pill == null) return;
        String stateText;
        switch (state) {
            case STATE_ONLINE:
                stateText = "conectado";
                break;
            case STATE_RETRYING:
                stateText = "reconectando";
                break;
            default:
                stateText = "sin conexion";
                break;
        }
        pill.setContentDescription("Conexion con " + activeLabel() + ": " + stateText
                + ". Doble toque para abrir las opciones de conexion.");
    }

    private void expandPill() {
        setPillExpanded(true, true);
    }

    private void collapseSoon() {
        ui.removeCallbacks(collapsePill);
        ui.postDelayed(collapsePill, 3200);
    }

    /**
     * El puente exige clave de acceso. Si el equipo respondiÃ³ 401 y no hay clave
     * guardada, se abre el editor en lugar de dejar la pantalla en blanco.
     */
    private void promptAccessKey() {
        if (isFinishing() || webView == null) return;
        showBanner("Este equipo pide clave de acceso. Escribela en la configuracion.");
        ui.postDelayed(this::openAddressEditor, 350);
    }

    private String activeLabel() {
        PcEntry pc = getActivePc();
        if (pc != null && !pc.name.isEmpty()) {
            return pc.name.length() > 14 ? pc.name.substring(0, 14) + "..." : pc.name;
        }
        return "PC 1";
    }

    private void refreshPillLabel() {
        if (pillLabel != null) pillLabel.setText(activeLabel());
    }

    // ------------------------------------------------------------ conexion base

    private String urlForSlot(int slot) {
        PcEntry pc = getActivePc();
        return pc != null ? pc.url : prefs.getString(KEY_URL_1, "http://10.173.252.87:57420");
    }

    private void boot() {
        PcEntry pc = getActivePc();
        String url = pc != null ? pc.url : "";
        if (url == null || url.trim().isEmpty()) {
            url = prefs.getString(KEY_URL_1, "http://10.173.252.87:57420");
        }
        if (url == null || url.trim().isEmpty()) {
            showBanner("Configura la direccion de la computadora");
            openAddPcDialog();
            return;
        }
        connectTo(url);
    }

    private void connectTo(String url) {
        String normalized = normalizeUrl(url);
        if (normalized.isEmpty()) return;
        activeUrl = normalized;
        refreshPillLabel();
        markRetrying();
        startLoad(normalized);
    }

    private void discover(boolean silent) {
        markRetrying();
        if (!silent) showBanner("Buscando computadoras en la red privada...");

        scanCancelled.set(true);
        if (scanFuture != null) scanFuture.cancel(true);
        scanCancelled.set(false);

        scanFuture = scanExecutor.submit(() -> {
            List<String> found = probeCandidates(candidates(), scanCancelled);
            ui.post(() -> onDiscoveryFinished(found));
        });
    }

    private void onDiscoveryFinished(List<String> found) {
        if (isFinishing() || isDestroyed() || webView == null || found == null) return;

        if (found.isEmpty()) {
            showBanner("No se encontro ninguna computadora activa.");
            openHub();
            return;
        }

        SharedPreferences.Editor editor = prefs.edit();
        if (urlForSlot(1).trim().isEmpty()) {
            editor.putString(KEY_URL_1, found.get(0));
            editor.putString(KEY_NAME_1, describe("Bunker 1", found.get(0)));
        }
        if (found.size() > 1 && urlForSlot(2).trim().isEmpty()) {
            editor.putString(KEY_URL_2, found.get(1));
            editor.putString(KEY_NAME_2, describe("Bunker 2", found.get(1)));
        }
        if (urlForSlot(prefs.getInt(KEY_ACTIVE, 1)).trim().isEmpty()) editor.putInt(KEY_ACTIVE, 1);
        editor.apply();

        hideBanner();
        connectTo(found.get(0));
        Toast.makeText(MainActivity.this, "Conectado a " + found.get(0), Toast.LENGTH_SHORT).show();
    }

    private String describe(String prefix, String url) {
        String host = Uri.parse(url).getHost();
        if (host == null) return prefix;
        int lastDot = host.lastIndexOf('.');
        return lastDot == -1 ? prefix + " " + host : prefix + " " + host.substring(lastDot + 1);
    }

    private Set<String> candidates() {
        Set<String> hosts = new LinkedHashSet<>();

        addHost(hosts, urlForSlot(1));
        addHost(hosts, urlForSlot(2));

        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;

                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    String host = addresses.nextElement().getHostAddress();
                    if (host == null || host.indexOf(':') >= 0) continue;
                    String[] parts = host.split("\\.");
                    if (parts.length != 4) continue;
                    if (host.startsWith("127.") || host.startsWith("169.254.")) continue;

                    String prefix = parts[0] + "." + parts[1] + "." + parts[2] + ".";
                    for (int last = 1; last <= 254; last++) {
                        hosts.add(prefix + last);
                    }
                }
            }
        } catch (Exception ignored) {
        }

        hosts.add("127.0.0.1");
        return hosts;
    }

    private List<String> probeCandidates(Set<String> hosts, AtomicBoolean cancelled) {
        List<String> found = new ArrayList<>();
        ExecutorService pool = Executors.newFixedThreadPool(32);
        ExecutorCompletionService<String> completion = new ExecutorCompletionService<>(pool);

        for (final String host : hosts) {
            completion.submit(() ->
                    probe("http://" + host + ":" + PORT + "/dsh-companion/status") ? host : null);
        }

        for (int index = 0; index < hosts.size(); index++) {
            if (cancelled != null && cancelled.get()) break;
            try {
                Future<String> result = completion.poll(700, TimeUnit.MILLISECONDS);
                if (result == null) continue;
                String host = result.get();
                if (host != null && !found.contains("http://" + host + ":" + PORT)) {
                    found.add("http://" + host + ":" + PORT);
                    if (found.size() >= 2) break;
                }
            } catch (Exception ignored) {
            }
        }

        pool.shutdownNow();
        return cancelled != null && cancelled.get() ? java.util.Collections.emptyList() : found;
    }

    private void addHost(Set<String> hosts, String url) {
        if (url == null || url.trim().isEmpty()) return;
        try {
            String host = Uri.parse(url).getHost();
            if (host != null && !host.isEmpty()) hosts.add(host);
        } catch (Exception ignored) {
        }
    }

    private boolean probe(String statusUrl) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(statusUrl).openConnection();
            connection.setConnectTimeout(450);
            connection.setReadTimeout(450);
            connection.setRequestMethod("GET");
            connection.setUseCaches(false);

            String key = prefs.getString(KEY_ACCESS_KEY, "");
            if (key != null && !key.trim().isEmpty()) {
                String credentials = "dsh:" + key.trim();
                String encoded = android.util.Base64.encodeToString(
                        credentials.getBytes("UTF-8"), android.util.Base64.NO_WRAP);
                connection.setRequestProperty("Authorization", "Basic " + encoded);
            }

            int code = connection.getResponseCode();

            // El puente empareja la primera vez: guarda la credencial en el mismo
            // almacen de cookies que usa el WebView para no volver a pedir nada.
            String setCookie = connection.getHeaderField("Set-Cookie");
            if (setCookie != null && !setCookie.isEmpty()) {
                try {
                    android.webkit.CookieManager.getInstance().setCookie(statusUrl, setCookie);
                } catch (Throwable ignored) {
                }
            }

            return code == 200;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    // ------------------------------------------------------------------- panel

    private void openHub() {
        checkGitHubReleases();
        final AlertDialog dialog = new AlertDialog.Builder(this).create();
        dialog.setCanceledOnTouchOutside(true);
        sheetDialog = dialog;

        LinearLayout sheet = buildSheet();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        scroll.addView(sheet);

        dialog.setView(scroll, 0, 0, 0, 0);
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window == null) return;
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            int widthDp = getResources().getConfiguration().screenWidthDp;
            if (widthDp >= 600) {
                window.setLayout(dp(540), ViewGroup.LayoutParams.WRAP_CONTENT);
                window.setGravity(Gravity.CENTER);
            } else {
                window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                window.setGravity(Gravity.BOTTOM);
            }
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.dimAmount = 0.55f;
            window.setAttributes(attributes);
        });
        dialog.show();
    }

    private LinearLayout buildSheet() {
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(18), dp(12), dp(18), dp(24));

        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.RECTANGLE);
        background.setColor(surface());
        background.setStroke(dp(1), outline());
        background.setCornerRadii(new float[]{
                dp(20), dp(20), dp(20), dp(20), 0, 0, 0, 0
        });
        sheet.setBackground(background);

        View handle = new View(this);
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(36), dp(4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.bottomMargin = dp(14);
        handle.setLayoutParams(handleParams);
        handle.setBackground(rounded(color(Color.parseColor("#30363D"), Color.parseColor("#D0D7DE")), Color.TRANSPARENT, 2f));
        sheet.addView(handle);

        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        headerRow.setPadding(0, 0, 0, dp(10));

        LinearLayout headerText = new LinearLayout(this);
        headerText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams htParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        headerText.setLayoutParams(htParams);

        TextView title = new TextView(this);
        title.setText("DSH Companion");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setTextColor(ink());
        headerText.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Control de transporte â€¢ Red privada ZeroTier / Tailscale");
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        subtitle.setTextColor(inkDim());
        subtitle.setPadding(0, dp(2), 0, 0);
        headerText.addView(subtitle);

        headerRow.addView(headerText);

        Button btnSettings = actionCompact("Ajustes", false, () -> {
            dismissHub();
            openSettingsDialog();
        });
        btnSettings.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        headerRow.addView(btnSettings);

        sheet.addView(headerRow);

        sheet.addView(sectionHeader("CONEXIONES"));
        List<PcEntry> pcList = getPcList();
        String activeId = getActivePcId(pcList);

        for (PcEntry pc : pcList) {
            sheet.addView(buildPcCard(pc, pc.id.equals(activeId)));
        }

        Button addPcBtn = actionCompact("+  Agregar PC", false, () -> {
            dismissHub();
            openAddPcDialog();
        });
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ap.topMargin = dp(2);
        ap.bottomMargin = dp(4);
        addPcBtn.setLayoutParams(ap);
        sheet.addView(addPcBtn);

        LinearLayout connActions = new LinearLayout(this);
        connActions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams connParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        connParams.topMargin = dp(2);
        connParams.bottomMargin = dp(4);
        connActions.setLayoutParams(connParams);

        Button btnDiscover = actionCompact("Explorar red", true, () -> {
            dismissHub();
            discover(false);
        });
        Button btnConfig = actionCompact("Configurar rutas", false, this::onConfigRoutesClicked);

        LinearLayout.LayoutParams b1Params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        b1Params.setMarginEnd(dp(6));
        btnDiscover.setLayoutParams(b1Params);

        LinearLayout.LayoutParams b2Params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        b2Params.setMarginStart(dp(6));
        btnConfig.setLayoutParams(b2Params);

        connActions.addView(btnDiscover);
        connActions.addView(btnConfig);
        sheet.addView(connActions);

        sheet.addView(sectionHeader("SISTEMA"));
        View telem = buildTelemetryCard();
        if (telem != null) sheet.addView(telem);
        sheet.addView(buildKeepAwakeCard());

        int localCode = getInstalledVersionCode();
        String localVer = getInstalledVersionName();
        int serverCode = prefs.getInt("server_apk_code", 0);
        String serverVer = prefs.getString("server_apk_version", "");

        String ghLatestVer = prefs.getString("github_latest_version", "");
        String ghLatestUrl = prefs.getString("github_latest_url", "");

        boolean isUpdateAvailable = false;
        String updateTargetVer = "";
        String updateTargetUrl = "";

        if (isVersionNewer(ghLatestVer, localVer) && !ghLatestUrl.isEmpty()) {
            isUpdateAvailable = true;
            updateTargetVer = ghLatestVer;
            updateTargetUrl = ghLatestUrl;
        } else if (serverCode > localCode && !serverVer.isEmpty()) {
            isUpdateAvailable = true;
            updateTargetVer = serverVer;
            updateTargetUrl = "";
        }

        if (isUpdateAvailable) {
            final String finalVer = updateTargetVer;
            final String finalUrl = updateTargetUrl;
            sheet.addView(action("Instalar actualizaciÃ³n (v" + finalVer + ")", 3, () -> {
                dismissHub();
                downloadAndInstallApk(finalUrl.isEmpty() ? null : finalUrl, "DSH-Companion.apk", "Actualizando a v" + finalVer + "...");
            }));
        } else {
            Button btnUpToDate = action("Sistema al dÃ­a (v" + localVer + ")", 4, () -> {
                Toast.makeText(this, "La aplicaciÃ³n estÃ¡ en la versiÃ³n mÃ¡s reciente (v" + localVer + ")", Toast.LENGTH_SHORT).show();
            });
            btnUpToDate.setOnLongClickListener(v -> {
                AlertDialog dialog = new AlertDialog.Builder(this)
                        .setTitle("Reinstalar v" + localVer)
                        .setMessage("Â¿Deseas descargar y reinstalar el archivo APK actual?")
                        .setPositiveButton("Reinstalar", (d, w) -> {
                            dismissHub();
                            downloadAndInstallApk();
                        })
                        .setNegativeButton("Cancelar", null)
                        .create();
                styleDialog(dialog);
                dialog.show();
                return true;
            });
            sheet.addView(btnUpToDate);
        }

        String ghPrevVer = prefs.getString("github_previous_version", "");
        String ghPrevUrl = prefs.getString("github_previous_url", "");
        String srvPrevVer = prefs.getString("server_prev_apk_version", "3.9.2");

        String rollbackVer = !ghPrevVer.isEmpty() ? ghPrevVer : srvPrevVer;
        String rollbackUrl = !ghPrevUrl.isEmpty() ? ghPrevUrl : "";

        if (!rollbackVer.isEmpty() && !rollbackVer.equals(localVer)) {
            final String finalRollbackVer = rollbackVer;
            final String finalRollbackUrl = rollbackUrl;
            sheet.addView(action("Revertir a versiÃ³n previa (v" + finalRollbackVer + ")", 2, () -> {
                dismissHub();
                confirmRollback(finalRollbackVer, finalRollbackUrl);
            }));
        }

        sheet.addView(sectionHeader("HERRAMIENTAS"));

        LinearLayout toolActions = new LinearLayout(this);
        toolActions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams toolParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        toolParams.topMargin = dp(2);
        toolActions.setLayoutParams(toolParams);

        Button btnShare = actionCompact("Compartir", false, this::shareActiveChat);
        Button btnImport = actionCompact("Importar", false, this::openImportChatPicker);

        LinearLayout.LayoutParams t1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        t1.setMarginEnd(dp(6));
        btnShare.setLayoutParams(t1);

        LinearLayout.LayoutParams t2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        t2.setMarginStart(dp(6));
        btnImport.setLayoutParams(t2);

        toolActions.addView(btnShare);
        toolActions.addView(btnImport);
        sheet.addView(toolActions);

        LinearLayout toolActions2 = new LinearLayout(this);
        toolActions2.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams toolParams2 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        toolParams2.topMargin = dp(4);
        toolActions2.setLayoutParams(toolParams2);

        Button btnReload = actionCompact("Recargar", false, () -> {
            dismissHub();
            webView.reload();
        });
        Button btnClear = actionCompact("Limpiar cachÃ©", false, () -> {
            dismissHub();
            clearCacheAndReload();
        });

        LinearLayout.LayoutParams r1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        r1.setMarginEnd(dp(6));
        btnReload.setLayoutParams(r1);

        LinearLayout.LayoutParams r2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        r2.setMarginStart(dp(6));
        btnClear.setLayoutParams(r2);

        toolActions2.addView(btnReload);
        toolActions2.addView(btnClear);
        sheet.addView(toolActions2);

        return sheet;
    }

    private View buildTelemetryCard() {
        int cpuPercent = prefs.getInt("stat_cpu_percent", -1);
        if (cpuPercent < 0) return null;

        int tempC = prefs.getInt("stat_cpu_temp", 0);
        float ramUsed = prefs.getFloat("stat_ram_used", 0);
        float ramTotal = prefs.getFloat("stat_ram_total", 0);
        int ramPercent = prefs.getInt("stat_ram_percent", 0);
        float diskFree = prefs.getFloat("stat_disk_free", 0);
        String uptime = prefs.getString("stat_uptime", "");

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(11), dp(14), dp(11));
        card.setBackground(rounded(raised(), outline(), 8f));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);

        TextView label = new TextView(this);
        label.setText("TELEMETRÃA PC 1" + (uptime.isEmpty() ? "" : " Â· " + uptime));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
        label.setLetterSpacing(0.06f);
        label.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        label.setTextColor(accentInk());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        label.setLayoutParams(lp);
        top.addView(label);

        if (tempC > 0) {
            TextView tempBadge = new TextView(this);
            tempBadge.setText(tempC + "Â°C");
            tempBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
            tempBadge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            tempBadge.setTextColor(tempC > 80 ? Color.parseColor("#F87171") : accentInk());
            top.addView(tempBadge);
        }
        card.addView(top);

        TextView row1 = new TextView(this);
        String cpuText = "CPU: " + cpuPercent + "%" + (tempC > 0 ? " (" + tempC + "Â°C)" : "");
        String ramText = "RAM: " + String.format(Locale.US, "%.1f", ramUsed) + "/" + String.format(Locale.US, "%.1f", ramTotal) + " GB (" + ramPercent + "%)";
        row1.setText(cpuText + "  Â·  " + ramText);
        row1.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        row1.setTypeface(android.graphics.Typeface.MONOSPACE);
        row1.setTextColor(ink());
        row1.setPadding(0, dp(3), 0, 0);
        card.addView(row1);

        if (diskFree > 0) {
            TextView row2 = new TextView(this);
            row2.setText("Disco C: " + String.format(Locale.US, "%.0f", diskFree) + " GB libres");
            row2.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
            row2.setTypeface(android.graphics.Typeface.MONOSPACE);
            row2.setTextColor(inkDim());
            row2.setPadding(0, dp(2), 0, 0);
            card.addView(row2);
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(8);
        card.setLayoutParams(params);
        return card;
    }

    private static final int REQUEST_IMPORT_CHAT = 442;

    private void shareActiveChat() {
        dismissHub();
        if (webView == null) return;

        webView.evaluateJavascript(
                "(function(){ return (window.__DSH_EXTRACT_CHAT_TEXT__ ? window.__DSH_EXTRACT_CHAT_TEXT__() : ''); })()",
                val -> {
                    String extracted = "";
                    if (val != null && !val.equals("null") && !val.equals("\"\"")) {
                        try {
                            String unquoted = val.replaceAll("^\"|\"$", "").replace("\\n", "\n").replace("\\\"", "\"");
                            extracted = unquoted;
                        } catch (Exception e) {
                            extracted = val;
                        }
                    }

                    String title = webView.getTitle();
                    String textToShare;
                    if (!extracted.trim().isEmpty()) {
                        textToShare = (title != null && !title.isEmpty() ? "# " + title + "\n\n" : "") + extracted;
                    } else {
                        textToShare = (title != null && !title.isEmpty() ? title + "\n" : "") + activeUrl;
                    }

                    try {
                        Intent sendIntent = new Intent();
                        sendIntent.setAction(Intent.ACTION_SEND);
                        sendIntent.putExtra(Intent.EXTRA_TEXT, textToShare);
                        sendIntent.putExtra(Intent.EXTRA_SUBJECT, title != null ? title : "ConversaciÃ³n DSH");
                        sendIntent.setType("text/plain");
                        Intent shareIntent = Intent.createChooser(sendIntent, "Compartir conversaciÃ³n");
                        startActivity(shareIntent);
                    } catch (Exception e) {
                        Toast.makeText(this, "Error al compartir: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                }
        );
    }

    private void openImportChatPicker() {
        dismissHub();
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            String[] mimes = {"text/plain", "text/markdown", "application/json", "text/*"};
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
            startActivityForResult(intent, REQUEST_IMPORT_CHAT);
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo abrir el explorador de archivos: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void handleImportedChatUri(Uri uri) {
        if (uri == null) return;
        try {
            java.io.InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) return;
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[2048];
            int n;
            while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
            is.close();
            final String content = baos.toString("UTF-8").trim();

            if (content.isEmpty()) {
                Toast.makeText(this, "El archivo seleccionado estÃ¡ vacÃ­o", Toast.LENGTH_SHORT).show();
                return;
            }

            AlertDialog dialog = new AlertDialog.Builder(this)
                    .setTitle("Importar conversaciÃ³n")
                    .setMessage("Archivo cargado (" + content.length() + " caracteres).\nÂ¿Deseas insertar este contenido en el chat activo?")
                    .setPositiveButton("Insertar en chat", (d, w) -> {
                        String jsonSafe = org.json.JSONObject.quote(content);
                        String js = "if (window.__DSH_INSERT_INTO_COMPOSER__) window.__DSH_INSERT_INTO_COMPOSER__(" + jsonSafe + ");";
                        webView.evaluateJavascript(js, res -> {
                            Toast.makeText(this, "Texto insertado en el compositor", Toast.LENGTH_SHORT).show();
                        });
                    })
                    .setNegativeButton("Cancelar", null)
                    .create();
            styleDialog(dialog);
            dialog.show();
        } catch (Exception e) {
            Toast.makeText(this, "Error al leer el archivo: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    public void applyThemeToWeb() {
        if (webView == null) return;
        int m = themeMode();
        String modeStr = m == 1 ? "dark" : (m == 2 ? "light" : "system");
        boolean dark = isDark();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                if (m == 1) {
                    webView.getSettings().setForceDark(WebSettings.FORCE_DARK_ON);
                } else if (m == 2) {
                    webView.getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
                } else {
                    webView.getSettings().setForceDark(dark ? WebSettings.FORCE_DARK_ON : WebSettings.FORCE_DARK_OFF);
                }
            } catch (Throwable ignored) {}
        }

        String js = "(function(){ if (window.__DSH_SET_THEME__) { window.__DSH_SET_THEME__('" + modeStr + "', " + dark + "); } })();";
        webView.evaluateJavascript(js, null);
    }

    boolean isEnterNewlineEnabled() {
        return prefs != null ? prefs.getBoolean(KEY_ENTER_NEWLINE, true) : true;
    }

    public void applyEnterBehaviorToWeb() {
        if (webView == null) return;
        boolean newline = isEnterNewlineEnabled();
        String js = "(function(){ if (window.__DSH_SET_ENTER_BEHAVIOR__) { window.__DSH_SET_ENTER_BEHAVIOR__(" + newline + "); } })();";
        webView.evaluateJavascript(js, null);
    }

    public void reloadMainSession() {
        ui.post(() -> {
            if (webView != null) {
                hideBanner();
                markRetrying();
                webView.clearCache(true);
                String target = activeUrl.isEmpty() ? urlForSlot(1) : activeUrl;
                startLoad(target);
            }
        });
    }

    private void applySystemBarsTheme() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Window window = getWindow();
            if (window == null) return;
            boolean dark = isDark();
            int barColor = dark ? Color.parseColor("#0A0E17") : Color.parseColor("#FFFFFF");
            window.setStatusBarColor(barColor);
            window.setNavigationBarColor(barColor);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                View decor = window.getDecorView();
                int flags = decor.getSystemUiVisibility();
                if (!dark) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                } else {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                }
                decor.setSystemUiVisibility(flags);
            }
        }
    }

    private void styleDialog(AlertDialog dialog) {
        if (dialog == null) return;
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(surface()));
            }
            try {
                int titleId = getResources().getIdentifier("alertTitle", "id", "android");
                if (titleId > 0) {
                    TextView tv = dialog.findViewById(titleId);
                    if (tv != null) {
                        tv.setTextColor(ink());
                        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15.5f);
                        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                }
                int msgId = getResources().getIdentifier("message", "id", "android");
                if (msgId > 0) {
                    TextView msg = dialog.findViewById(msgId);
                    if (msg != null) {
                        msg.setTextColor(ink());
                    }
                }
                Button pos = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
                if (pos != null) {
                    pos.setTextColor(accentInk());
                    pos.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                }
                Button neg = dialog.getButton(AlertDialog.BUTTON_NEGATIVE);
                if (neg != null) {
                    neg.setTextColor(inkDim());
                    neg.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                }
                Button neu = dialog.getButton(AlertDialog.BUTTON_NEUTRAL);
                if (neu != null) {
                    neu.setTextColor(Color.parseColor("#EF4444"));
                    neu.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                }
            } catch (Throwable ignored) {}
        });
    }

    private void checkBiometricAuth() {
        if (!prefs.getBoolean("biometric_lock_enabled", false)) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;

        CancellationSignal signal = new CancellationSignal();
        BiometricPrompt prompt = new BiometricPrompt.Builder(this)
                .setTitle("Acceso a DSH Companion")
                .setSubtitle("Confirma tu identidad para acceder a la sesiÃ³n")
                .setNegativeButton("Cancelar", getMainExecutor(), (d, w) -> finish())
                .build();

        prompt.authenticate(signal, getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                super.onAuthenticationSucceeded(result);
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                super.onAuthenticationError(errorCode, errString);
                if (errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED || errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED) {
                    finish();
                } else {
                    Toast.makeText(MainActivity.this, "AutenticaciÃ³n requerida", Toast.LENGTH_SHORT).show();
                    finish();
                }
            }
        });
    }

    private void openSettingsDialog() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(18), dp(20), dp(16));
        form.setBackgroundColor(surface());

        form.addView(sectionHeader("TEMA VISUAL"));

        LinearLayout themeRow = new LinearLayout(this);
        themeRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams trParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        trParams.bottomMargin = dp(14);
        themeRow.setLayoutParams(trParams);

        int curTheme = prefs.getInt("theme_mode", 0);

        Button btnSys = actionCompact("Sistema", curTheme == 0, () -> {});
        Button btnDark = actionCompact("Oscuro", curTheme == 1, () -> {});
        Button btnLight = actionCompact("Claro", curTheme == 2, () -> {});

        LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p1.setMarginEnd(dp(4));
        btnSys.setLayoutParams(p1);

        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p2.setMarginStart(dp(2));
        p2.setMarginEnd(dp(2));
        btnDark.setLayoutParams(p2);

        LinearLayout.LayoutParams p3 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p3.setMarginStart(dp(4));
        btnLight.setLayoutParams(p3);

        themeRow.addView(btnSys);
        themeRow.addView(btnDark);
        themeRow.addView(btnLight);
        form.addView(themeRow);

        form.addView(sectionHeader("NOTIFICACIONES"));
        LinearLayout notifCard = new LinearLayout(this);
        notifCard.setOrientation(LinearLayout.HORIZONTAL);
        notifCard.setGravity(Gravity.CENTER_VERTICAL);
        notifCard.setPadding(dp(14), dp(10), dp(14), dp(10));
        notifCard.setBackground(rounded(raised(), outline(), 8f));

        LinearLayout notifText = new LinearLayout(this);
        notifText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams ntParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        notifText.setLayoutParams(ntParams);

        TextView notifTitle = new TextView(this);
        notifTitle.setText("Notificaciones del sistema");
        notifTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        notifTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        notifTitle.setTextColor(ink());
        notifText.addView(notifTitle);

        TextView notifDesc = new TextView(this);
        notifDesc.setText("Avisos de herramientas, pausas y estado");
        notifDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        notifDesc.setTextColor(inkDim());
        notifText.addView(notifDesc);
        notifCard.addView(notifText);

        Switch swNotif = new Switch(this);
        swNotif.setChecked(prefs.getBoolean("notifications_master_enabled", true));
        swNotif.setOnCheckedChangeListener((bv, checked) -> {
            prefs.edit().putBoolean("notifications_master_enabled", checked).apply();
        });
        notifCard.addView(swNotif);
        LinearLayout.LayoutParams ncParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ncParams.bottomMargin = dp(14);
        notifCard.setLayoutParams(ncParams);
        form.addView(notifCard);

        form.addView(sectionHeader("SEGURIDAD BIOMÃ‰TRICA"));
        LinearLayout bioCard = new LinearLayout(this);
        bioCard.setOrientation(LinearLayout.HORIZONTAL);
        bioCard.setGravity(Gravity.CENTER_VERTICAL);
        bioCard.setPadding(dp(14), dp(10), dp(14), dp(10));
        bioCard.setBackground(rounded(raised(), outline(), 8f));

        LinearLayout bioText = new LinearLayout(this);
        bioText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams btParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bioText.setLayoutParams(btParams);

        TextView bioTitle = new TextView(this);
        bioTitle.setText("Bloquear con huella digital");
        bioTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        bioTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bioTitle.setTextColor(ink());
        bioText.addView(bioTitle);

        TextView bioDesc = new TextView(this);
        bioDesc.setText("Pide confirmaciÃ³n biomÃ©trica al abrir la app");
        bioDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        bioDesc.setTextColor(inkDim());
        bioText.addView(bioDesc);
        bioCard.addView(bioText);

        Switch swBio = new Switch(this);
        swBio.setChecked(prefs.getBoolean("biometric_lock_enabled", false));
        swBio.setOnCheckedChangeListener((bv, checked) -> {
            prefs.edit().putBoolean("biometric_lock_enabled", checked).apply();
            if (checked) {
                Toast.makeText(this, "Bloqueo por huella activado", Toast.LENGTH_SHORT).show();
            }
        });
        bioCard.addView(swBio);
        LinearLayout.LayoutParams bcParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bcParams.bottomMargin = dp(8);
        bioCard.setLayoutParams(bcParams);
        form.addView(bioCard);

        LinearLayout bioCritCard = new LinearLayout(this);
        bioCritCard.setOrientation(LinearLayout.HORIZONTAL);
        bioCritCard.setGravity(Gravity.CENTER_VERTICAL);
        bioCritCard.setPadding(dp(14), dp(10), dp(14), dp(10));
        bioCritCard.setBackground(rounded(raised(), outline(), 8f));

        LinearLayout bioCritText = new LinearLayout(this);
        bioCritText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams bctParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bioCritText.setLayoutParams(bctParams);

        TextView bioCritTitle = new TextView(this);
        bioCritTitle.setText("Doble biometria en acciones criticas");
        bioCritTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        bioCritTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        bioCritTitle.setTextColor(ink());
        bioCritText.addView(bioCritTitle);

        TextView bioCritDesc = new TextView(this);
        bioCritDesc.setText("Pide huella para autorizar herramientas de riesgo en la PC");
        bioCritDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        bioCritDesc.setTextColor(inkDim());
        bioCritText.addView(bioCritDesc);
        bioCritCard.addView(bioCritText);

        Switch swBioCrit = new Switch(this);
        swBioCrit.setChecked(prefs.getBoolean("biometric_critical_actions_enabled", true));
        swBioCrit.setOnCheckedChangeListener((bv, checked) -> {
            prefs.edit().putBoolean("biometric_critical_actions_enabled", checked).apply();
            Toast.makeText(this, checked ? "Doble biometria activada" : "Doble biometria desactivada", Toast.LENGTH_SHORT).show();
        });
        bioCritCard.addView(swBioCrit);
        LinearLayout.LayoutParams bccParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bccParams.bottomMargin = dp(14);
        bioCritCard.setLayoutParams(bccParams);
        form.addView(bioCritCard);

        form.addView(sectionHeader("COMPOSITOR Y TECLADO"));
        LinearLayout enterCard = new LinearLayout(this);
        enterCard.setOrientation(LinearLayout.HORIZONTAL);
        enterCard.setGravity(Gravity.CENTER_VERTICAL);
        enterCard.setPadding(dp(14), dp(10), dp(14), dp(10));
        enterCard.setBackground(rounded(raised(), outline(), 8f));

        LinearLayout enterText = new LinearLayout(this);
        enterText.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams etParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        enterText.setLayoutParams(etParams);

        TextView enterTitle = new TextView(this);
        enterTitle.setText("Salto de lÃ­nea con Enter (â†µ)");
        enterTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        enterTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        enterTitle.setTextColor(ink());
        enterText.addView(enterTitle);

        TextView enterDesc = new TextView(this);
        enterDesc.setText("Enter inserta salto de lÃ­nea. Desactiva para enviar con Enter.");
        enterDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        enterDesc.setTextColor(inkDim());
        enterText.addView(enterDesc);
        enterCard.addView(enterText);

        Switch swEnter = new Switch(this);
        swEnter.setChecked(isEnterNewlineEnabled());
        swEnter.setOnCheckedChangeListener((bv, checked) -> {
            prefs.edit().putBoolean(KEY_ENTER_NEWLINE, checked).apply();
            applyEnterBehaviorToWeb();
            Toast.makeText(this, checked ? "Enter inserta salto de lÃ­nea (â†µ)" : "Enter envÃ­a el mensaje", Toast.LENGTH_SHORT).show();
        });
        enterCard.addView(swEnter);
        LinearLayout.LayoutParams ecParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ecParams.bottomMargin = dp(14);
        enterCard.setLayoutParams(ecParams);
        form.addView(enterCard);

        form.addView(sectionHeader("MODO PANICO / EMERGENCIA"));
        LinearLayout killCard = new LinearLayout(this);
        killCard.setOrientation(LinearLayout.VERTICAL);
        killCard.setPadding(dp(14), dp(12), dp(14), dp(12));
        killCard.setBackground(rounded(raised(), outline(), 8f));

        TextView killTitle = new TextView(this);
        killTitle.setText("Kill Switch (Revocar accesos)");
        killTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        killTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        killTitle.setTextColor(Color.parseColor("#EF4444"));
        killCard.addView(killTitle);

        TextView killDesc = new TextView(this);
        killDesc.setText("Revoca de inmediato todos los dispositivos emparejados en la PC y cierra la sesion local.");
        killDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        killDesc.setTextColor(inkDim());
        killDesc.setPadding(0, dp(2), 0, dp(10));
        killCard.addView(killDesc);

        final AlertDialog settingsDialogRef[] = new AlertDialog[1];
        Button btnKill = actionCompact("Activar Kill Switch", false, () -> {
            if (settingsDialogRef[0] != null) settingsDialogRef[0].dismiss();
            confirmKillSwitch();
        });
        btnKill.setTextColor(Color.parseColor("#EF4444"));
        killCard.addView(btnKill);

        LinearLayout.LayoutParams kcParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        kcParams.bottomMargin = dp(14);
        killCard.setLayoutParams(kcParams);
        form.addView(killCard);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(form);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Ajustes")
                .setView(scroll)
                .setPositiveButton("Listo", null)
                .create();
        settingsDialogRef[0] = dialog;

        btnSys.setOnClickListener(v -> {
            prefs.edit().putInt("theme_mode", 0).apply();
            dialog.dismiss();
            recreate();
        });
        btnDark.setOnClickListener(v -> {
            prefs.edit().putInt("theme_mode", 1).apply();
            dialog.dismiss();
            recreate();
        });
        btnLight.setOnClickListener(v -> {
            prefs.edit().putInt("theme_mode", 2).apply();
            dialog.dismiss();
            recreate();
        });

        styleDialog(dialog);
        dialog.show();
    }

    private void confirmKillSwitch() {
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Kill Switch de Emergencia")
                .setMessage("¿Deseas revocar de inmediato todos los dispositivos autorizados en la computadora y cerrar la sesion?")
                .setPositiveButton("Revocar todo ahora", (d, w) -> executeKillSwitch())
                .setNegativeButton("Cancelar", null)
                .create();
        styleDialog(dialog);
        dialog.show();
        try {
            Button pos = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            if (pos != null) {
                pos.setTextColor(Color.parseColor("#EF4444"));
                pos.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            }
        } catch (Throwable ignored) {}
    }

    private void executeKillSwitch() {
        vibrateHaptic("alert");
        String base = activeUrl != null ? activeUrl : urlForSlot(1);
        String target = base.replaceAll("/+$", "") + "/dsh-companion/kill-switch";

        new Thread(() -> {
            try {
                URL u = new URL(target);
                HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);
                String cookie = CookieManager.getInstance().getCookie(target);
                if (cookie != null) conn.setRequestProperty("Cookie", cookie);
                PcEntry pc = getActivePc();
                if (pc != null && pc.accessKey != null && !pc.accessKey.trim().isEmpty()) {
                    String auth = "dsh:" + pc.accessKey.trim();
                    String b64 = Base64.encodeToString(auth.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
                    conn.setRequestProperty("Authorization", "Basic " + b64);
                }
                conn.getResponseCode();
                conn.disconnect();
            } catch (Throwable ignored) {}

            ui.post(() -> {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                Toast.makeText(this, "Kill Switch ejecutado: accesos revocados", Toast.LENGTH_LONG).show();
                if (webView != null) webView.loadUrl("about:blank");
                boot();
            });
        }).start();
    }

    private View buildKeepAwakeCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(14), dp(10), dp(14), dp(10));
        card.setBackground(rounded(raised(), outline(), 8f));

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams tParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        textCol.setLayoutParams(tParams);

        TextView title = new TextView(this);
        title.setText("Prevenir suspensiÃ³n");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setTextColor(ink());
        textCol.addView(title);

        TextView desc = new TextView(this);
        desc.setText("Evita que el sistema suspenda el WebSocket");
        desc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);
        desc.setTextColor(inkDim());
        desc.setPadding(0, dp(1), 0, 0);
        textCol.addView(desc);

        card.addView(textCol);

        Switch keepAwake = new Switch(this);
        keepAwake.setChecked(prefs.getBoolean(KEY_KEEP_SCREEN, true));
        keepAwake.setOnCheckedChangeListener((buttonView, checked) -> {
            prefs.edit().putBoolean(KEY_KEEP_SCREEN, checked).apply();
            if (checked) {
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        card.addView(keepAwake);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(4);
        card.setLayoutParams(params);
        return card;
    }

    private void confirmRollback(String targetVer, String targetUrl) {
        String base = activeUrl.isEmpty() ? "http://" + prefs.getString(KEY_URL_1, "10.173.252.87:57420") : activeUrl;
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        String fallbackUrl = base.replaceAll("/+$", "") + "/DSH-Companion-previous.apk";
        String resolvedUrl = (targetUrl != null && !targetUrl.isEmpty()) ? targetUrl : fallbackUrl;

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Revertir a versiÃ³n v" + targetVer)
                .setMessage("Se descargarÃ¡ el instalador de la versiÃ³n previa (v" + targetVer + ").\n\n"
                        + "Aviso tÃ©cnico de Android: Si el sistema rechaza la instalaciÃ³n directa por ser una versiÃ³n anterior, "
                        + "desinstala primero la versiÃ³n actual. Tus direcciones y claves guardadas se conservan.")
                .setPositiveButton("Descargar v" + targetVer, (d, which) -> {
                    downloadAndInstallApk(resolvedUrl, "DSH-Companion-v" + targetVer + ".apk", "Descargando versiÃ³n previa (v" + targetVer + ")...");
                })
                .setNegativeButton("Cancelar", null)
                .create();
        styleDialog(dialog);
        dialog.show();
    }

    private void checkGitHubReleases() {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("https://api.github.com/repos/TintaYNodos/dsh-mobile-companion/releases?per_page=2");
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(5000);
                conn.setRequestProperty("User-Agent", "DSH-Companion-Android");
                conn.setRequestProperty("Accept", "application/vnd.github.v3+json");

                if (conn.getResponseCode() == 200) {
                    java.io.InputStream is = conn.getInputStream();
                    java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[1024];
                    int n;
                    while ((n = is.read(buf)) != -1) baos.write(buf, 0, n);
                    String json = baos.toString("UTF-8");
                    is.close();

                    org.json.JSONArray releases = new org.json.JSONArray(json);
                    if (releases.length() > 0) {
                        org.json.JSONObject latest = releases.getJSONObject(0);
                        String latestTag = latest.optString("tag_name", "").replaceAll("^v", "");
                        String latestUrl = findApkAssetUrl(latest);

                        prefs.edit()
                                .putString("github_latest_version", latestTag)
                                .putString("github_latest_url", latestUrl)
                                .apply();

                        if (releases.length() > 1) {
                            org.json.JSONObject prev = releases.getJSONObject(1);
                            String prevTag = prev.optString("tag_name", "").replaceAll("^v", "");
                            String prevUrl = findApkAssetUrl(prev);

                            prefs.edit()
                                    .putString("github_previous_version", prevTag)
                                    .putString("github_previous_url", prevUrl)
                                    .apply();
                        }
                    }
                }
            } catch (Throwable ignored) {
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private String findApkAssetUrl(org.json.JSONObject release) {
        if (!release.has("assets")) return "";
        try {
            org.json.JSONArray assets = release.getJSONArray("assets");
            for (int i = 0; i < assets.length(); i++) {
                org.json.JSONObject asset = assets.getJSONObject(i);
                String name = asset.optString("name", "");
                if (name.endsWith(".apk")) {
                    return asset.optString("browser_download_url", "");
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    private boolean isVersionNewer(String remote, String local) {
        if (remote == null || remote.trim().isEmpty()) return false;
        try {
            String[] rParts = remote.replaceAll("[^0-9.]", "").split("\\.");
            String[] lParts = local.replaceAll("[^0-9.]", "").split("\\.");
            int max = Math.max(rParts.length, lParts.length);
            for (int i = 0; i < max; i++) {
                int r = i < rParts.length ? Integer.parseInt(rParts[i]) : 0;
                int l = i < lParts.length ? Integer.parseInt(lParts[i]) : 0;
                if (r > l) return true;
                if (r < l) return false;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public void downloadAndInstallApk() {
        downloadAndInstallApk(null, null, null);
    }

    public void downloadAndInstallApk(String customUrl, String customFilename, String titleText) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            if (!getPackageManager().canRequestPackageInstalls()) {
                Toast.makeText(this, "Permite a DSH Companion instalar actualizaciones", Toast.LENGTH_LONG).show();
                try {
                    Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                    startActivityForResult(permIntent, REQUEST_INSTALL_PERMISSION);
                } catch (Throwable t) {
                    try {
                        Intent permIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        startActivityForResult(permIntent, REQUEST_INSTALL_PERMISSION);
                    } catch (Throwable ignored) {}
                }
                return;
            }
        }

        String base = activeUrl.isEmpty() ? "http://" + prefs.getString(KEY_URL_1, "10.173.252.87:57420") : activeUrl;
        if (!base.startsWith("http://") && !base.startsWith("https://")) base = "http://" + base;
        final String apkUrl = (customUrl != null && !customUrl.isEmpty())
                ? customUrl
                : base.replaceAll("/+$", "") + "/DSH-Companion.apk";
        final String fileName = (customFilename != null && !customFilename.isEmpty())
                ? customFilename
                : "DSH-Companion.apk";

        final AlertDialog progressDialog = new AlertDialog.Builder(this).create();
        progressDialog.setCancelable(false);
        progressDialog.setCanceledOnTouchOutside(false);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(20), dp(18), dp(20), dp(18));
        layout.setBackground(rounded(surface(), outline(), 12f));

        TextView txtTitle = new TextView(this);
        txtTitle.setText(titleText != null ? titleText : "ActualizaciÃ³n de binario");
        txtTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
        txtTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        txtTitle.setTextColor(ink());
        layout.addView(txtTitle);

        final TextView txtStatus = new TextView(this);
        txtStatus.setText("Descargando " + fileName + "...");
        txtStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        txtStatus.setTextColor(inkDim());
        txtStatus.setPadding(0, dp(4), 0, dp(12));
        layout.addView(txtStatus);

        final ProgressBar pBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pBar.setMax(100);
        pBar.setProgress(0);
        pBar.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(6)));
        layout.addView(pBar);

        progressDialog.setView(layout, 0, 0, 0, 0);
        progressDialog.setOnShowListener(d -> {
            Window window = progressDialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            }
        });
        progressDialog.show();

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String downloadUrl = apkUrl;
                URL url = new URL(downloadUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(20000);
                conn.setInstanceFollowRedirects(true);
                if (!downloadUrl.contains("github.com") && !downloadUrl.contains("githubusercontent.com")) {
                    String cookie = android.webkit.CookieManager.getInstance().getCookie(downloadUrl);
                    if (cookie != null) conn.setRequestProperty("Cookie", cookie);
                }

                int respCode = conn.getResponseCode();
                if (respCode == HttpURLConnection.HTTP_MOVED_PERM || respCode == HttpURLConnection.HTTP_MOVED_TEMP || respCode == 307 || respCode == 308) {
                    String redirectUrl = conn.getHeaderField("Location");
                    if (redirectUrl != null && !redirectUrl.isEmpty()) {
                        conn.disconnect();
                        url = new URL(redirectUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(10000);
                        conn.setReadTimeout(20000);
                    }
                }

                int fileLength = conn.getContentLength();
                java.io.InputStream input = conn.getInputStream();

                File cacheDir = getExternalCacheDir();
                if (cacheDir == null) cacheDir = getCacheDir();
                File targetFile = new File(cacheDir, fileName);

                java.io.OutputStream output = new java.io.FileOutputStream(targetFile);

                byte[] data = new byte[4096];
                long total = 0;
                int count;
                while ((count = input.read(data)) != -1) {
                    total += count;
                    if (fileLength > 0) {
                        final int percent = (int) (total * 100 / fileLength);
                        final long kb = total / 1024;
                        ui.post(() -> {
                            pBar.setProgress(percent);
                            txtStatus.setText("Descargando: " + percent + "% (" + kb + " KB)");
                        });
                    }
                    output.write(data, 0, count);
                }

                output.flush();
                output.close();
                input.close();

                ui.post(() -> {
                    progressDialog.dismiss();
                    installDownloadedApk(targetFile);
                });
            } catch (Exception e) {
                ui.post(() -> {
                    progressDialog.dismiss();
                    Toast.makeText(MainActivity.this, "Error al descargar: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void installDownloadedApk(File apkFile) {
        if (apkFile == null || !apkFile.exists()) return;
        try {
            Uri contentUri = ApkFileProvider.getUriForApk(apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo abrir el instalador: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void dismissHub() {
        if (sheetDialog != null) {
            sheetDialog.dismiss();
            sheetDialog = null;
        }
    }

    public static class PcEntry {
        public String id;
        public String name;
        public String url;
        public String accessKey;

        public PcEntry(String id, String name, String url, String accessKey) {
            this.id = id;
            this.name = name;
            this.url = url;
            this.accessKey = accessKey;
        }

        public org.json.JSONObject toJson() {
            org.json.JSONObject obj = new org.json.JSONObject();
            try {
                obj.put("id", id);
                obj.put("name", name);
                obj.put("url", url);
                obj.put("accessKey", accessKey);
            } catch (Exception ignored) {}
            return obj;
        }

        public static PcEntry fromJson(org.json.JSONObject obj) {
            if (obj == null) return null;
            return new PcEntry(
                    obj.optString("id", String.valueOf(System.currentTimeMillis())),
                    obj.optString("name", "PC"),
                    obj.optString("url", ""),
                    obj.optString("accessKey", "")
            );
        }
    }

    private List<PcEntry> getPcList() {
        List<PcEntry> list = new ArrayList<>();
        String raw = prefs.getString("pc_registry_json", "");
        if (!raw.isEmpty()) {
            try {
                org.json.JSONArray arr = new org.json.JSONArray(raw);
                for (int i = 0; i < arr.length(); i++) {
                    PcEntry e = PcEntry.fromJson(arr.getJSONObject(i));
                    if (e != null && !e.url.isEmpty()) list.add(e);
                }
            } catch (Exception ignored) {}
        }

        if (list.isEmpty()) {
            String u1 = prefs.getString(KEY_URL_1, "http://10.173.252.87:57420");
            String n1 = prefs.getString(KEY_NAME_1, "PC 1");
            String key = prefs.getString(KEY_ACCESS_KEY, "");
            if (!u1.isEmpty()) {
                list.add(new PcEntry("pc_1", n1.isEmpty() ? "PC 1" : n1, u1, key));
            }
            String u2 = prefs.getString(KEY_URL_2, "");
            String n2 = prefs.getString(KEY_NAME_2, "PC 2");
            if (!u2.isEmpty()) {
                list.add(new PcEntry("pc_2", n2.isEmpty() ? "PC 2" : n2, u2, key));
            }
            savePcList(list);
        }
        return list;
    }

    private void savePcList(List<PcEntry> list) {
        org.json.JSONArray arr = new org.json.JSONArray();
        for (PcEntry e : list) arr.put(e.toJson());
        prefs.edit().putString("pc_registry_json", arr.toString()).apply();
    }

    private String getActivePcId(List<PcEntry> list) {
        String active = prefs.getString("active_pc_id", "");
        if (!active.isEmpty()) {
            for (PcEntry e : list) {
                if (e.id.equals(active)) return active;
            }
        }
        return list.isEmpty() ? "" : list.get(0).id;
    }

    private void setActivePcId(String id) {
        prefs.edit().putString("active_pc_id", id).apply();
    }

    private PcEntry getActivePc() {
        List<PcEntry> list = getPcList();
        String activeId = getActivePcId(list);
        for (PcEntry e : list) {
            if (e.id.equals(activeId)) return e;
        }
        return list.isEmpty() ? null : list.get(0);
    }

    private View buildPcCard(PcEntry pc, boolean active) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(11), dp(14), dp(11));

        int cardBg = active
                ? color(Color.parseColor("#161F30"), Color.parseColor("#F0F6FF"))
                : raised();
        int cardStroke = active
                ? color(Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA"))
                : outline();
        card.setBackground(rounded(cardBg, cardStroke, 8f));

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView head = new TextView(this);
        head.setText(pc.name);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13.5f);
        head.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        head.setTextColor(active ? ink() : inkDim());
        LinearLayout.LayoutParams headParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        head.setLayoutParams(headParams);
        topRow.addView(head);

        TextView badge = new TextView(this);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f);
        badge.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        badge.setPadding(dp(6), dp(2), dp(6), dp(2));
        if (active) {
            badge.setText("Activo");
            badge.setTextColor(color(Color.parseColor("#58A6FF"), Color.parseColor("#0969DA")));
            badge.setBackground(rounded(
                    color(Color.parseColor("#1C2D4A"), Color.parseColor("#DDF4FF")),
                    Color.TRANSPARENT, 4f));
        } else {
            badge.setText("En espera");
            badge.setTextColor(inkDim());
            badge.setBackground(rounded(
                    color(Color.parseColor("#21262D"), Color.parseColor("#EAEFF5")),
                    Color.TRANSPARENT, 4f));
        }
        topRow.addView(badge);
        card.addView(topRow);

        String displayAddress = pc.url.replaceFirst("^https?://", "").replaceAll("/+$", "");
        TextView detail = new TextView(this);
        detail.setText(displayAddress);
        detail.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
        detail.setTypeface(android.graphics.Typeface.MONOSPACE);
        detail.setTextColor(active ? color(Color.parseColor("#79C0FF"), Color.parseColor("#0969DA")) : inkDim());
        detail.setPadding(0, dp(4), 0, 0);
        card.addView(detail);

        card.setOnClickListener(v -> {
            setActivePcId(pc.id);
            connectTo(pc.url);
            dismissHub();
        });

        card.setOnLongClickListener(v -> {
            dismissHub();
            openEditPcDialog(pc);
            return true;
        });

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(6);
        card.setLayoutParams(params);
        return card;
    }

    private View spacer(int heightDp) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, dp(heightDp)));
        return view;
    }

    private Button actionCompact(String label, boolean primary, Runnable onClick) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        button.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        if (primary) {
            button.setTextColor(Color.WHITE);
            button.setBackground(rounded(accentPrimary(), Color.TRANSPARENT, 8f));
        } else {
            button.setTextColor(ink());
            button.setBackground(rounded(raised(), outline(), 8f));
        }
        button.setPadding(dp(12), dp(10), dp(12), dp(10));
        button.setOnClickListener(v -> onClick.run());
        return button;
    }

    private Button action(String label, int style, Runnable onClick) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        button.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        if (style == 1) { // Primary DeepSeek Blue
            button.setTextColor(Color.WHITE);
            button.setBackground(rounded(
                    accentPrimary(),
                    Color.TRANSPARENT, 8f));
        } else if (style == 3) { // Special / Update APK
            button.setTextColor(accentInk());
            button.setBackground(rounded(
                    color(Color.parseColor("#131D2E"), Color.parseColor("#F0F6FF")),
                    color(Color.parseColor("#1F6FEB"), Color.parseColor("#0969DA")), 8f));
        } else if (style == 4) { // Up to date / Sistema al dÃ­a
            button.setTextColor(color(Color.parseColor("#3FB950"), Color.parseColor("#1A7F37")));
            button.setBackground(rounded(
                    color(Color.parseColor("#0D1D16"), Color.parseColor("#EAFBEA")),
                    color(Color.parseColor("#238636"), Color.parseColor("#2DA44E")), 8f));
        } else { // Secondary Surface Card
            button.setTextColor(ink());
            button.setBackground(rounded(
                    raised(),
                    outline(), 8f));
        }
        button.setPadding(dp(14), dp(11), dp(14), dp(11));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(6);
        button.setLayoutParams(params);

        button.setOnClickListener(v -> onClick.run());
        return button;
    }

    private String getInstalledVersionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "3.9.2";
        }
    }

    private int getInstalledVersionCode() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return 13;
        }
    }

    private void clearCacheAndReload() {
        try {
            android.webkit.WebViewDatabase.getInstance(this).clearHttpAuthUsernamePassword();
            android.webkit.CookieManager.getInstance().removeAllCookies(null);
            android.webkit.WebStorage.getInstance().deleteAllData();
        } catch (Throwable ignored) {
        }
        webView.clearCache(true);
        webView.clearHistory();
        webView.reload();
        Toast.makeText(this, "Cache limpiada", Toast.LENGTH_SHORT).show();
    }

    private void onConfigRoutesClicked() {
        dismissHub();
        List<PcEntry> list = getPcList();
        if (list.isEmpty()) {
            openAddPcDialog();
        } else if (list.size() == 1) {
            openEditPcDialog(list.get(0));
        } else {
            String[] names = new String[list.size()];
            for (int i = 0; i < list.size(); i++) {
                PcEntry pc = list.get(i);
                names[i] = pc.name + " (" + pc.url.replaceFirst("^https?://", "").replaceAll("/+$", "") + ")";
            }

            AlertDialog dialog = new AlertDialog.Builder(this)
                    .setTitle("Seleccionar PC para editar")
                    .setItems(names, (d, which) -> {
                        openEditPcDialog(list.get(which));
                    })
                    .setNegativeButton("Cancelar", null)
                    .create();
            styleDialog(dialog);
            dialog.show();
        }
    }

    private void openAddressEditor() {
        onConfigRoutesClicked();
    }

    private void openAddPcDialog() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(18), dp(20), dp(8));
        form.setBackgroundColor(surface());

        int nextNum = getPcList().size() + 1;
        final EditText nameInput = field("Nombre de la PC (ej. Laptop)", "PC " + nextNum);
        final EditText urlInput = field("DirecciÃ³n IP (ej. http://10.x.x.x:57420)", "");
        final EditText accessInput = field("Clave de acceso (opcional)", "");
        accessInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);

        form.addView(sectionLabel("NUEVA COMPUTADORA"));
        form.addView(nameInput);
        form.addView(urlInput);
        form.addView(sectionLabel("SEGURIDAD"));
        form.addView(accessInput);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(form);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Agregar nueva PC")
                .setView(scroll)
                .setPositiveButton("Guardar", null)
                .setNegativeButton("Cancelar", null)
                .create();

        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) window.setBackgroundDrawable(new ColorDrawable(surface()));
            try {
                int titleId = getResources().getIdentifier("alertTitle", "id", "android");
                if (titleId > 0) {
                    TextView tv = dialog.findViewById(titleId);
                    if (tv != null) {
                        tv.setTextColor(ink());
                        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15.5f);
                        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                }
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(accentInk());
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(inkDim());
            } catch (Throwable ignored) {}

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String targetUrl = urlInput.getText().toString().trim();
                String targetName = nameInput.getText().toString().trim();
                String targetKey = accessInput.getText().toString().trim();

                if (targetUrl.isEmpty()) {
                    Toast.makeText(this, "Ingresa la direcciÃ³n IP o URL", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                    targetUrl = "http://" + targetUrl;
                }
                if (targetName.isEmpty()) targetName = "PC " + nextNum;

                List<PcEntry> list = getPcList();
                String newId = "pc_" + System.currentTimeMillis();
                PcEntry newEntry = new PcEntry(newId, targetName, targetUrl, targetKey);
                list.add(newEntry);
                savePcList(list);

                setActivePcId(newId);
                dialog.dismiss();
                connectTo(targetUrl);
                refreshPillLabel();
                Toast.makeText(this, "PC agregada: " + targetName, Toast.LENGTH_SHORT).show();
            });
        });

        dialog.show();
    }

    private void openEditPcDialog(PcEntry pc) {
        if (pc == null) return;
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(18), dp(20), dp(8));
        form.setBackgroundColor(surface());

        final EditText nameInput = field("Nombre de la PC", pc.name);
        final EditText urlInput = field("DirecciÃ³n IP (ej. http://10.x.x.x:57420)", pc.url);
        final EditText accessInput = field("Clave de acceso (opcional)", pc.accessKey != null ? pc.accessKey : "");
        accessInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);

        form.addView(sectionLabel("CONFIGURACIÃ“N DE " + pc.name.toUpperCase()));
        form.addView(nameInput);
        form.addView(urlInput);
        form.addView(sectionLabel("SEGURIDAD"));
        form.addView(accessInput);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(form);

        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("Editar " + pc.name)
                .setView(scroll)
                .setPositiveButton("Guardar", null)
                .setNegativeButton("Cancelar", null);

        List<PcEntry> list = getPcList();
        if (list.size() > 1) {
            builder.setNeutralButton("Eliminar PC", (d, w) -> {
                list.removeIf(item -> item.id.equals(pc.id));
                savePcList(list);
                if (getActivePcId(list).equals(pc.id) && !list.isEmpty()) {
                    setActivePcId(list.get(0).id);
                    connectTo(list.get(0).url);
                }
                refreshPillLabel();
                Toast.makeText(this, "PC eliminada", Toast.LENGTH_SHORT).show();
            });
        }

        AlertDialog dialog = builder.create();
        dialog.setOnShowListener(d -> {
            Window window = dialog.getWindow();
            if (window != null) window.setBackgroundDrawable(new ColorDrawable(surface()));
            try {
                int titleId = getResources().getIdentifier("alertTitle", "id", "android");
                if (titleId > 0) {
                    TextView tv = dialog.findViewById(titleId);
                    if (tv != null) {
                        tv.setTextColor(ink());
                        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15.5f);
                        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
                    }
                }
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(accentInk());
                dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(inkDim());
                if (dialog.getButton(AlertDialog.BUTTON_NEUTRAL) != null) {
                    dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setTextColor(Color.parseColor("#EF4444"));
                }
            } catch (Throwable ignored) {}

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String targetUrl = urlInput.getText().toString().trim();
                String targetName = nameInput.getText().toString().trim();
                String targetKey = accessInput.getText().toString().trim();

                if (targetUrl.isEmpty()) {
                    Toast.makeText(this, "Ingresa la direcciÃ³n IP o URL", Toast.LENGTH_SHORT).show();
                    return;
                }
                if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
                    targetUrl = "http://" + targetUrl;
                }
                if (targetName.isEmpty()) targetName = pc.name;

                pc.name = targetName;
                pc.url = targetUrl;
                pc.accessKey = targetKey;

                for (int i = 0; i < list.size(); i++) {
                    if (list.get(i).id.equals(pc.id)) {
                        list.set(i, pc);
                        break;
                    }
                }
                savePcList(list);

                if (getActivePcId(list).equals(pc.id)) {
                    connectTo(targetUrl);
                }
                refreshPillLabel();
                dialog.dismiss();
                Toast.makeText(this, "ConfiguraciÃ³n guardada", Toast.LENGTH_SHORT).show();
            });
        });

        dialog.show();
    }

    private TextView sectionHeader(String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f);
        label.setLetterSpacing(0.08f);
        label.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        label.setTextColor(accentInk());
        label.setPadding(0, dp(12), 0, dp(5));
        return label;
    }

    private TextView sectionLabel(String text) {
        return sectionHeader(text);
    }

    private EditText field(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setSingleLine(true);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        input.setTextColor(ink());
        input.setHintTextColor(color(Color.parseColor("#484F58"), Color.parseColor("#8C959F")));
        input.setBackground(rounded(raised(), outline(), 8f));
        input.setPadding(dp(12), dp(11), dp(12), dp(11));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = dp(8);
        input.setLayoutParams(params);
        return input;
    }

    // ------------------------------------------------------------- ciclo de vida

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_IMPORT_CHAT && resultCode == RESULT_OK && data != null && data.getData() != null) {
            handleImportedChatUri(data.getData());
            return;
        }
        if (requestCode == REQUEST_INSTALL_PERMISSION) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                if (getPackageManager().canRequestPackageInstalls()) {
                    downloadAndInstallApk();
                }
            }
            return;
        }
        if (requestCode != REQUEST_FILE || fileCallback == null) return;

        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];
                for (int index = 0; index < count; index++) {
                    result[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }

        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_AUDIO || audioRequest == null) return;

        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            audioRequest.deny();
        }
        audioRequest = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    public static boolean shouldShowNotification(Context context) {
        if (context == null) return true;
        try {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (!p.getBoolean("notifications_master_enabled", true)) return false;

            android.app.KeyguardManager km = (android.app.KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            boolean isLocked = (km != null && km.isKeyguardLocked());
            return isLocked || !sIsAppVisible;
        } catch (Throwable ignored) {
            return !sIsAppVisible;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        checkBiometricAuth();
        sIsAppVisible = true;
        if (webView != null) webView.onResume();
        if (state != STATE_ONLINE && !activeUrl.isEmpty() && !pageLoading) {
            attempts = 0;
            scheduleReconnect(600);
        } else if (state == STATE_ONLINE) {
            checkAndDispatchPendingAction();
        }
    }

    @Override
    protected void onPause() {
        sIsAppVisible = false;
        // En segundo plano no se reintenta: gastarÃ­a baterÃ­a y radio sin usuario.
        ui.removeCallbacks(reconnectTick);
        reconnecting = false;
        if (webView != null) webView.onPause();
        super.onPause();
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
        ui.removeCallbacksAndMessages(null);

        scanCancelled.set(true);
        if (scanFuture != null) {
            scanFuture.cancel(true);
            scanFuture = null;
        }
        scanExecutor.shutdownNow();

        if (audioRequest != null) {
            audioRequest.deny();
            audioRequest = null;
        }
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        if (addressDialog != null) {
            addressDialog.dismiss();
            addressDialog = null;
        }
        sheetDialog = null;

        try {
            if (networkCallback != null) {
                ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (manager != null) manager.unregisterNetworkCallback(networkCallback);
                networkCallback = null;
            }
        } catch (Throwable ignored) {
        }

        if (sInstance == this) sInstance = null;
        ui.removeCallbacks(disconnectionWatchdog);
        ui.removeCallbacks(deviceCheckPoll);

        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.clearHistory();
            webView.removeAllViews();
            root.removeView(webView);
            webView.destroy();
            webView = null;
        }
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
}
