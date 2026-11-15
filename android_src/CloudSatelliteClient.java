/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/**
 * Cliente de streaming SSE para modo satélite de contingencia.
 * Se conecta a la API de DeepSeek mediante HttpsURLConnection nativo puro
 * con timeouts de 10s conexión y 15s lectura, transmitiendo tokens por eventos SSE.
 */
public class CloudSatelliteClient {

    private static final String DEFAULT_ENDPOINT = "https://api.deepseek.com/chat/completions";
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;

    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private HttpsURLConnection currentConnection;
    private Thread workerThread;

    public interface SatelliteListener {
        void onChunk(String text);
        void onComplete(String fullText);
        void onError(String error);
    }

    /**
     * Inicia una consulta en streaming SSE hacia DeepSeek en un hilo secundario.
     * @param apiKey Clave API descifrada de KeyStoreVault
     * @param payload Prompt de usuario o JSON completo de la petición
     * @param listener Callback de eventos de streaming
     */
    public synchronized void executeQuery(final String apiKey, final String payload, final SatelliteListener listener) {
        cancel();

        isRunning.set(true);
        workerThread = new Thread(() -> doStreamRequest(apiKey, payload, listener));
        workerThread.setName("DSH-SatelliteClient");
        workerThread.start();
    }

    /**
     * Cancela la consulta en curso y cierra la conexión HTTP activa.
     */
    public synchronized void cancel() {
        isRunning.set(false);
        if (currentConnection != null) {
            try {
                currentConnection.disconnect();
            } catch (Throwable ignored) {}
            currentConnection = null;
        }
        if (workerThread != null && workerThread.isAlive()) {
            workerThread.interrupt();
            workerThread = null;
        }
    }

    public boolean isActive() {
        return isRunning.get();
    }

    private void doStreamRequest(String apiKey, String payload, SatelliteListener listener) {
        StringBuilder fullResponse = new StringBuilder();
        try {
            String requestBody = buildRequestBody(payload);

            URL url = new URL(DEFAULT_ENDPOINT);
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            synchronized (this) {
                if (!isRunning.get()) {
                    conn.disconnect();
                    return;
                }
                currentConnection = conn;
            }

            conn.setRequestMethod("POST");
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "text/event-stream");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey.trim());
            conn.setDoOutput(true);

            byte[] outBytes = requestBody.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(outBytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(outBytes);
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (!isRunning.get()) return;

            if (responseCode != 200) {
                InputStream errStream = conn.getErrorStream();
                String errBody = "";
                if (errStream != null) {
                    try (BufferedReader errReader = new BufferedReader(new InputStreamReader(errStream, StandardCharsets.UTF_8))) {
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = errReader.readLine()) != null) sb.append(line);
                        errBody = sb.toString();
                    }
                }
                if (listener != null && isRunning.get()) {
                    listener.onError("DeepSeek API error HTTP " + responseCode + (errBody.isEmpty() ? "" : ": " + errBody));
                }
                return;
            }

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while (isRunning.get() && (line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith(":")) {
                        continue;
                    }

                    if (line.startsWith("data:")) {
                        String data = line.substring(5).trim();
                        if ("[DONE]".equals(data)) {
                            break;
                        }

                        try {
                            JSONObject json = new JSONObject(data);
                            JSONArray choices = json.optJSONArray("choices");
                            if (choices != null && choices.length() > 0) {
                                JSONObject choice = choices.getJSONObject(0);
                                JSONObject delta = choice.optJSONObject("delta");
                                if (delta != null) {
                                    String content = delta.optString("content", "");
                                    if (!content.isEmpty()) {
                                        fullResponse.append(content);
                                        if (listener != null && isRunning.get()) {
                                            listener.onChunk(content);
                                        }
                                    }
                                }
                            }
                        } catch (Exception ignored) {
                            // Fragmento no procesable como JSON de delta estándar
                        }
                    }
                }
            }

            if (listener != null && isRunning.get()) {
                listener.onComplete(fullResponse.toString());
            }

        } catch (Exception e) {
            if (isRunning.get() && listener != null) {
                String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                listener.onError("Error en modo satélite: " + msg);
            }
        } finally {
            isRunning.set(false);
            synchronized (this) {
                if (currentConnection != null) {
                    try {
                        currentConnection.disconnect();
                    } catch (Throwable ignored) {}
                    currentConnection = null;
                }
            }
        }
    }

    private String buildRequestBody(String payload) throws Exception {
        if (payload != null && payload.trim().startsWith("{")) {
            JSONObject customObj = new JSONObject(payload.trim());
            if (!customObj.has("stream")) {
                customObj.put("stream", true);
            }
            if (!customObj.has("model")) {
                customObj.put("model", "deepseek-chat");
            }
            return customObj.toString();
        }

        JSONObject root = new JSONObject();
        root.put("model", "deepseek-chat");
        root.put("stream", true);

        JSONArray messages = new JSONArray();
        JSONObject userMsg = new JSONObject();
        userMsg.put("role", "user");
        userMsg.put("content", payload != null ? payload : "");
        messages.put(userMsg);

        root.put("messages", messages);
        return root.toString();
    }
}
