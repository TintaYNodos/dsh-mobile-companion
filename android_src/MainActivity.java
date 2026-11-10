package com.tintaynodos.dshcompanion;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Bundle;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
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
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int AUDIO_PERMISSION_REQUEST_CODE = 2002;
    private static final String PREFS_NAME = "DshCompanionPrefs";
    private static final String KEY_BUNKER_URL_1 = "bunker_url_1";
    private static final String KEY_BUNKER_NAME_1 = "bunker_name_1";
    private static final String KEY_BUNKER_URL_2 = "bunker_url_2";
    private static final String KEY_BUNKER_NAME_2 = "bunker_name_2";
    private static final String KEY_ACTIVE_SLOT = "active_slot";
    private static final String KEY_KEEP_SCREEN = "keep_screen_on";
    private static final String KEY_BUTTON_Y = "button_pos_y";

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private FrameLayout floatTabContainer;
    private TextView floatTabLabel;
    private ValueCallback<Uri[]> fileUploadCallback;
    private PermissionRequest audioPermissionRequest;
    private SharedPreferences prefs;

    // Variables de arrastre
    private float dY = 0f;
    private boolean isDragging = false;
    private long touchStartTime = 0;

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        boolean keepScreen = prefs.getBoolean(KEY_KEEP_SCREEN, true);
        if (keepScreen) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        floatTabContainer = findViewById(R.id.floatTabContainer);
        floatTabLabel = findViewById(R.id.floatTabLabel);

        swipeRefresh.setOnChildScrollUpCallback((parent, child) -> webView.getScrollY() > 0);
        swipeRefresh.setOnRefreshListener(() -> {
            webView.reload();
            swipeRefresh.setRefreshing(false);
        });

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) fileUploadCallback.onReceiveValue(null);
                fileUploadCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                } catch (ActivityNotFoundException e) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("*/*");
                    startActivityForResult(Intent.createChooser(fallback, "Seleccionar archivo"), FILE_CHOOSER_REQUEST_CODE);
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                for (String res : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                == PackageManager.PERMISSION_GRANTED) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        } else {
                            audioPermissionRequest = request;
                            ActivityCompat.requestPermissions(MainActivity.this,
                                    new String[]{Manifest.permission.RECORD_AUDIO},
                                    AUDIO_PERMISSION_REQUEST_CODE);
                        }
                        return;
                    }
                }
                request.deny();
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
            }
        });

        setupDraggableTab();
        updateTabLabel();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            // Si no hay IP guardada, lanzar auto-descubrimiento en ZeroTier
            String url1 = prefs.getString(KEY_BUNKER_URL_1, "");
            if (url1.isEmpty()) {
                autoDiscoverBunkers(true);
            } else {
                loadActiveBunker();
            }
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private void setupDraggableTab() {
        float savedY = prefs.getFloat(KEY_BUTTON_Y, -1f);
        if (savedY > 0) {
            floatTabContainer.setY(savedY);
        }

        floatTabContainer.setOnTouchListener((v, event) -> {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    dY = v.getY() - event.getRawY();
                    touchStartTime = System.currentTimeMillis();
                    isDragging = false;
                    v.setAlpha(1.0f);
                    return true;

                case MotionEvent.ACTION_MOVE:
                    float newY = event.getRawY() + dY;
                    int parentHeight = ((View) v.getParent()).getHeight();
                    if (newY >= 60 && newY <= (parentHeight - v.getHeight() - 60)) {
                        v.setY(newY);
                        if (Math.abs(event.getRawY() + dY - v.getY()) > 10) {
                            isDragging = true;
                        }
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    v.setAlpha(0.75f);
                    prefs.edit().putFloat(KEY_BUTTON_Y, v.getY()).apply();
                    if (!isDragging && (System.currentTimeMillis() - touchStartTime < 350)) {
                        v.performClick();
                        showDshControlModal();
                    }
                    return true;
            }
            return false;
        });
    }

    private void updateTabLabel() {
        int slot = prefs.getInt(KEY_ACTIVE_SLOT, 1);
        String name = slot == 1 
            ? prefs.getString(KEY_BUNKER_NAME_1, "Búnker 1") 
            : prefs.getString(KEY_BUNKER_NAME_2, "Búnker 2");
        if (name.length() > 10) name = name.substring(0, 8) + "..";
        floatTabLabel.setText(name);
    }

    private void loadActiveBunker() {
        int slot = prefs.getInt(KEY_ACTIVE_SLOT, 1);
        String url = slot == 1 
            ? prefs.getString(KEY_BUNKER_URL_1, "http://10.173.252.87:57420")
            : prefs.getString(KEY_BUNKER_URL_2, "http://10.173.252.92:57420");
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        updateTabLabel();
        webView.loadUrl(url);
    }

    // Modal con Diseno DSH Búnker (Temas y Estilo Fiel a DeepSeek Harness)
    private void showDshControlModal() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_dsh_bunker);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            dialog.getWindow().setGravity(Gravity.CENTER);
        }

        TextView txtTitle = dialog.findViewById(R.id.txtDshTitle);
        Button btnSlot1 = dialog.findViewById(R.id.btnSlot1);
        Button btnSlot2 = dialog.findViewById(R.id.btnSlot2);
        Button btnAutoScan = dialog.findViewById(R.id.btnAutoScan);
        Button btnEditManual = dialog.findViewById(R.id.btnEditManual);
        Button btnClose = dialog.findViewById(R.id.btnCloseDsh);

        String name1 = prefs.getString(KEY_BUNKER_NAME_1, "PC 1 - Búnker Principal");
        String url1 = prefs.getString(KEY_BUNKER_URL_1, "http://10.173.252.87:57420");
        String name2 = prefs.getString(KEY_BUNKER_NAME_2, "PC 2 - Búnker Secundario");
        String url2 = prefs.getString(KEY_BUNKER_URL_2, "http://10.173.252.92:57420");
        int activeSlot = prefs.getInt(KEY_ACTIVE_SLOT, 1);

        btnSlot1.setText((activeSlot == 1 ? "●  " : "○  ") + name1 + "\n" + url1);
        btnSlot2.setText((activeSlot == 2 ? "●  " : "○  ") + name2 + "\n" + url2);

        btnSlot1.setOnClickListener(v -> {
            prefs.edit().putInt(KEY_ACTIVE_SLOT, 1).apply();
            loadActiveBunker();
            dialog.dismiss();
        });

        btnSlot2.setOnClickListener(v -> {
            prefs.edit().putInt(KEY_ACTIVE_SLOT, 2).apply();
            loadActiveBunker();
            dialog.dismiss();
        });

        btnAutoScan.setOnClickListener(v -> {
            dialog.dismiss();
            autoDiscoverBunkers(false);
        });

        btnEditManual.setOnClickListener(v -> {
            dialog.dismiss();
            showEditManualDialog();
        });

        btnClose.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    private void showEditManualDialog() {
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_edit_bunkers);
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }

        EditText editName1 = dialog.findViewById(R.id.editName1);
        EditText editUrl1 = dialog.findViewById(R.id.editUrl1);
        EditText editName2 = dialog.findViewById(R.id.editName2);
        EditText editUrl2 = dialog.findViewById(R.id.editUrl2);
        Button btnSave = dialog.findViewById(R.id.btnSaveBunkers);
        Button btnCancel = dialog.findViewById(R.id.btnCancelBunkers);

        editName1.setText(prefs.getString(KEY_BUNKER_NAME_1, "Búnker Principal"));
        editUrl1.setText(prefs.getString(KEY_BUNKER_URL_1, "10.173.252.87:57420"));
        editName2.setText(prefs.getString(KEY_BUNKER_NAME_2, "Búnker Secundario"));
        editUrl2.setText(prefs.getString(KEY_BUNKER_URL_2, "10.173.252.92:57420"));

        btnSave.setOnClickListener(v -> {
            prefs.edit()
                    .putString(KEY_BUNKER_NAME_1, editName1.getText().toString().trim())
                    .putString(KEY_BUNKER_URL_1, editUrl1.getText().toString().trim())
                    .putString(KEY_BUNKER_NAME_2, editName2.getText().toString().trim())
                    .putString(KEY_BUNKER_URL_2, editUrl2.getText().toString().trim())
                    .apply();
            loadActiveBunker();
            dialog.dismiss();
            Toast.makeText(this, "Configuración guardada", Toast.LENGTH_SHORT).show();
        });

        btnCancel.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    // Auto-descubrimiento en ZeroTier / LAN
    private void autoDiscoverBunkers(boolean autoConnect) {
        Toast.makeText(this, "Escaneando Búnkers en ZeroTier...", Toast.LENGTH_SHORT).show();
        new AsyncTask<Void, Void, List<BunkerResult>>() {
            @Override
            protected List<BunkerResult> doInBackground(Void... voids) {
                List<BunkerResult> found = new ArrayList<>();
                // Probar IPs candidatas en la subred de ZeroTier actual
                String[] testIps = new String[]{"10.173.252.87", "10.173.252.92", "127.0.0.1", "10.173.252.240"};
                for (String ip : testIps) {
                    try {
                        URL url = new URL("http://" + ip + ":57420/dsh-companion/status");
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setConnectTimeout(800);
                        conn.setReadTimeout(800);
                        conn.setRequestMethod("GET");
                        if (conn.getResponseCode() == 200) {
                            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                            StringBuilder sb = new StringBuilder();
                            String line;
                            while ((line = reader.readLine()) != null) sb.append(line);
                            reader.close();
                            JSONObject json = new JSONObject(sb.toString());
                            String hostname = json.optString("hostname", ip);
                            found.add(new BunkerResult(hostname, "http://" + ip + ":57420"));
                        }
                    } catch (Exception ignored) {}
                }
                return found;
            }

            @Override
            protected void onPostExecute(List<BunkerResult> results) {
                if (results.isEmpty()) {
                    Toast.makeText(MainActivity.this, "No se detectaron búnkers en línea automáticamente. Ingresa la IP manualmente.", Toast.LENGTH_LONG).show();
                    showEditManualDialog();
                } else {
                    if (results.size() >= 1) {
                        prefs.edit()
                                .putString(KEY_BUNKER_NAME_1, results.get(0).name)
                                .putString(KEY_BUNKER_URL_1, results.get(0).url)
                                .apply();
                    }
                    if (results.size() >= 2) {
                        prefs.edit()
                                .putString(KEY_BUNKER_NAME_2, results.get(1).name)
                                .putString(KEY_BUNKER_URL_2, results.get(1).url)
                                .apply();
                    }
                    Toast.makeText(MainActivity.this, "Detectado: " + results.get(0).name, Toast.LENGTH_SHORT).show();
                    if (autoConnect) loadActiveBunker();
                }
            }
        }.execute();
    }

    private static class BunkerResult {
        String name;
        String url;
        BunkerResult(String name, String url) { this.name = name; this.url = url; }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == AUDIO_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (audioPermissionRequest != null) {
                    audioPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                }
            } else {
                if (audioPermissionRequest != null) audioPermissionRequest.deny();
                Toast.makeText(this, "Permiso de micrófono denegado para dictado por voz", Toast.LENGTH_SHORT).show();
            }
            audioPermissionRequest = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (fileUploadCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            fileUploadCallback.onReceiveValue(results);
            fileUploadCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
