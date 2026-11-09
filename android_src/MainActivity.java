package com.tintaynodos.dshcompanion;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

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

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;
    private ValueCallback<Uri[]> fileUploadCallback;
    private PermissionRequest audioPermissionRequest;
    private SharedPreferences prefs;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        // Keep Screen On opcional para no cortar streaming en prompts largos
        boolean keepScreen = prefs.getBoolean(KEY_KEEP_SCREEN, true);
        if (keepScreen) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        webView = findViewById(R.id.webView);
        swipeRefresh = findViewById(R.id.swipeRefresh);

        // Solo permitir recarga con swipe cuando el webview este en el tope
        swipeRefresh.setOnChildScrollUpCallback((parent, child) -> webView.getScrollY() > 0);
        swipeRefresh.setOnRefreshListener(() -> {
            webView.reload();
            swipeRefresh.setRefreshing(false);
        });

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        // Hardening de seguridad contra fugas de archivos locales
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // WebChromeClient blindado
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (fileUploadCallback != null) {
                    fileUploadCallback.onReceiveValue(null);
                }
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
                // Rechazo defensivo: deniega cualquier otro permiso no auditado
                request.deny();
            }
        });

        // WebViewClient con validacion de esquemas seguros
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false; // Permite navegacion web legitima
                }
                return true; // Bloquea esquemas peligrosos como javascript:, file:, data:
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadActiveBunker();
        }

        View btnSwitch = findViewById(R.id.btnSwitchBunker);
        if (btnSwitch != null) {
            btnSwitch.setOnClickListener(v -> showBunkerSelectorDialog());
        }
    }

    private void loadActiveBunker() {
        int slot = prefs.getInt(KEY_ACTIVE_SLOT, 1);
        String url = slot == 1 
            ? prefs.getString(KEY_BUNKER_URL_1, "http://10.173.252.87:57420")
            : prefs.getString(KEY_BUNKER_URL_2, "http://10.173.252.92:57420");
        webView.loadUrl(url);
    }

    public void showBunkerSelectorDialog() {
        String name1 = prefs.getString(KEY_BUNKER_NAME_1, "PC 1 - Bunker Principal");
        String url1 = prefs.getString(KEY_BUNKER_URL_1, "http://10.173.252.87:57420");
        String name2 = prefs.getString(KEY_BUNKER_NAME_2, "PC 2 - Bunker Secundario");
        String url2 = prefs.getString(KEY_BUNKER_URL_2, "http://10.173.252.92:57420");
        int activeSlot = prefs.getInt(KEY_ACTIVE_SLOT, 1);

        String[] options = new String[]{
                (activeSlot == 1 ? "● " : "○ ") + name1 + " (" + url1 + ")",
                (activeSlot == 2 ? "● " : "○ ") + name2 + " (" + url2 + ")",
                "Configurar nombres e IPs de las computadoras"
        };

        new AlertDialog.Builder(this)
                .setTitle("Seleccionar Computadora Activa")
                .setItems(options, (dialog, which) -> {
                    if (which == 0) {
                        prefs.edit().putInt(KEY_ACTIVE_SLOT, 1).apply();
                        loadActiveBunker();
                        Toast.makeText(this, "Conectando a: " + name1, Toast.LENGTH_SHORT).show();
                    } else if (which == 1) {
                        prefs.edit().putInt(KEY_ACTIVE_SLOT, 2).apply();
                        loadActiveBunker();
                        Toast.makeText(this, "Conectando a: " + name2, Toast.LENGTH_SHORT).show();
                    } else {
                        showEditBunkersDialog();
                    }
                })
                .setNegativeButton("Cerrar", null)
                .show();
    }

    private void showEditBunkersDialog() {
        LayoutInflater inflater = LayoutInflater.from(this);
        View view = inflater.inflate(R.layout.dialog_edit_bunkers, null);
        EditText editName1 = view.findViewById(R.id.editName1);
        EditText editUrl1 = view.findViewById(R.id.editUrl1);
        EditText editName2 = view.findViewById(R.id.editName2);
        EditText editUrl2 = view.findViewById(R.id.editUrl2);

        editName1.setText(prefs.getString(KEY_BUNKER_NAME_1, "PC 1 - Bunker Principal"));
        editUrl1.setText(prefs.getString(KEY_BUNKER_URL_1, "http://10.173.252.87:57420"));
        editName2.setText(prefs.getString(KEY_BUNKER_NAME_2, "PC 2 - Bunker Secundario"));
        editUrl2.setText(prefs.getString(KEY_BUNKER_URL_2, "http://10.173.252.92:57420"));

        new AlertDialog.Builder(this)
                .setTitle("Configurar Computadoras")
                .setView(view)
                .setPositiveButton("Guardar", (dialog, which) -> {
                    prefs.edit()
                            .putString(KEY_BUNKER_NAME_1, editName1.getText().toString().trim())
                            .putString(KEY_BUNKER_URL_1, editUrl1.getText().toString().trim())
                            .putString(KEY_BUNKER_NAME_2, editName2.getText().toString().trim())
                            .putString(KEY_BUNKER_URL_2, editUrl2.getText().toString().trim())
                            .apply();
                    loadActiveBunker();
                    Toast.makeText(this, "Computadoras guardadas exitosamente", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancelar", null)
                .show();
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
                if (audioPermissionRequest != null) {
                    audioPermissionRequest.deny();
                }
                Toast.makeText(this, "Permiso de microfono denegado para dictado por voz", Toast.LENGTH_SHORT).show();
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
