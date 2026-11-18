/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Copia cifrada del último chat para {@link OfflineChatActivity}: AES-256-GCM
 * con clave del AndroidKeyStore (fail-closed, nunca en claro), MAGIC + IV +
 * ciphertext, escritura atómica. Guarda el formato estructurado (messages[]) o,
 * para copias antiguas, texto plano; {@link #clear(Context)} la borra.
 */
final class OfflineChatStore {

    /** Tope de tamaño de la copia, el mismo que aplica el cliente web. */
    static final int MAX_TEXT = 20000;
    /** Por debajo de esto no merece la pena guardar copia (igual que el web). */
    static final int MIN_TEXT = 30;
    /** Título cuando el documento no tiene uno útil. */
    static final String DEFAULT_TITLE = "Conversacion reciente";
    static final String FILE_NAME = "offline_chat.enc";
    static final String TEMP_FILE_NAME = "offline_chat.enc.tmp";
    private static final String TAG = "DshOfflineChat";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "dsh_companion_offline_key";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;
    private static final int KEY_BITS = 256;
    /** Cabecera de los archivos cifrados: "DSHOFFL" + versión 1. */
    private static final byte[] MAGIC = {'D', 'S', 'H', 'O', 'F', 'F', 'L', 1};
    /** El aviso de "sin cifrado" se registra una sola vez por proceso. */
    private static boolean warningLogged;
    private OfflineChatStore() {}
    /** Guarda la copia de texto plano (formato antiguo). */
    static synchronized boolean save(Context context, String title, String text, String updatedAt) {
        if (context == null || !isEnabled(context)) return false;
        String body = clampText(OfflineChatFormat.sanitize(text));
        if (body.length() < MIN_TEXT || body.trim().isEmpty()) return false;
        String json = toJson(defaultTitle(title), body, timestamp(updatedAt));
        return json != null && persist(context, json);
    }

    /**
     * Guarda la copia ESTRUCTURADA: recorta por mensajes completos al tope de
     * {@link #MAX_TEXT}, con roles, horas y estructura. Sin mensajes válidos
     * cae al formato antiguo con el texto recibido.
     */
    static synchronized boolean saveStructured(Context context, String title, String text,
                                               String messagesJson, String updatedAt) {
        if (context == null || !isEnabled(context)) return false;
        List<OfflineChatFormat.Message> messages =
                OfflineChatFormat.clampMessages(OfflineChatFormat.parseMessages(messagesJson), MAX_TEXT);
        String body = messages.isEmpty()
                ? clampText(OfflineChatFormat.sanitize(text))
                : OfflineChatFormat.plainText(messages);
        if (body.length() < MIN_TEXT || body.trim().isEmpty()) return false;
        String json = messages.isEmpty()
                ? toJson(defaultTitle(title), body, timestamp(updatedAt))
                : OfflineChatFormat.toJson(defaultTitle(title), messages, timestamp(updatedAt));
        return json != null && persist(context, json);
    }

    /** Cifra con el keystore y escribe de forma atómica. Fail-closed. */
    private static boolean persist(Context context, String json) {
        byte[] stored;
        try {
            stored = seal(json.getBytes(StandardCharsets.UTF_8));
        } catch (Throwable unavailable) {
            markUnavailable(context, true);
            warnNoEncryptionOnce();
            return false;
        }
        File directory = directory(context);
        if (directory == null || !writeAtomic(directory, stored)) return false;
        markUnavailable(context, false);
        return true;
    }

    /** Lee y descifra la copia; el estado distingue vacía de ilegible. */
    static Load load(Context context) {
        if (context == null) return new Load(Load.STATUS_UNAVAILABLE, null);
        File directory = directory(context);
        File file = directory == null ? null : new File(directory, FILE_NAME);
        if (file == null || !file.isFile()) {
            return isMarkedUnavailable(context)
                    ? new Load(Load.STATUS_UNAVAILABLE, null)
                    : new Load(Load.STATUS_EMPTY, null);
        }
        String json;
        try {
            json = open(readAll(file));
        } catch (Throwable undecryptable) {
            // Clave invalidada, archivo dañado o sin cifrador: no hay copia.
            warnNoEncryptionOnce();
            return new Load(Load.STATUS_UNAVAILABLE, null);
        }
        Chat chat = fromJson(json);
        return chat == null
                ? new Load(Load.STATUS_UNAVAILABLE, null)
                : new Load(Load.STATUS_OK, chat);
    }

    /** Borra la copia nativa y su marca de estado. Nunca lanza. */
    static void clear(Context context) {
        if (context == null) return;
        try {
            File directory = directory(context);
            if (directory != null) {
                deleteQuietly(new File(directory, FILE_NAME));
                deleteQuietly(new File(directory, TEMP_FILE_NAME));
            }
        } catch (Throwable ignored) {
            // Mejor esfuerzo: si falla, se reintenta en la próxima.
        }
        markUnavailable(context, false);
    }

    /** true solo si el interruptor de la copia sin conexión está activo. */
    static boolean isEnabled(Context context) {
        if (context == null) return false;
        try { return prefs(context).getBoolean(PrefKeys.KEY_OFFLINE_COPY, false); }
        catch (Throwable ignored) { return false; }
    }

    // --- Lógica pura (probada fuera de Android en OfflineChatStoreTest) ---

    /**
     * Recorta por el final al tope de {@link #MAX_TEXT} sin partir un emoji.
     */
    static String clampText(String text) {
        if (text == null) return "";
        if (text.length() <= MAX_TEXT) return text;
        int start = text.length() - MAX_TEXT;
        if (Character.isLowSurrogate(text.charAt(start))) start++;
        return text.substring(start);
    }

    /** Título visible: el del documento o el de respaldo si viene vacío. */
    static String defaultTitle(String title) {
        if (title == null) return DEFAULT_TITLE;
        String trimmed = title.trim();
        return trimmed.isEmpty() ? DEFAULT_TITLE : trimmed;
    }

    /** Serializa la copia a JSON válido con las tres únicas claves que viajan. */
    static String toJson(String title, String text, String updatedAt) {
        try {
            JSONObject object = new JSONObject();
            object.put("title", defaultTitle(title));
            object.put("text", clampText(text));
            object.put("updatedAt", updatedAt == null ? "" : updatedAt.trim());
            return object.toString();
        } catch (Throwable invalid) {
            return null;
        }
    }

    /**
     * Reconstruye la copia desde el JSON: estructurado (messages[]) o texto
     * plano antiguo. Devuelve null si no queda contenido válido.
     */
    static Chat fromJson(String json) {
        if (json == null || json.trim().isEmpty()) return null;
        try {
            JSONObject object = new JSONObject(json);
            List<OfflineChatFormat.Message> messages = OfflineChatFormat.clampMessages(
                    OfflineChatFormat.readMessages(object.optJSONArray("messages")), MAX_TEXT);
            if (!messages.isEmpty()) {
                return new Chat(defaultTitle(object.optString("title", "")),
                        OfflineChatFormat.plainText(messages),
                        object.optString("updatedAt", "").trim(), messages);
            }
            String text = clampText(OfflineChatFormat.sanitize(object.optString("text", "")));
            if (text.trim().isEmpty()) return null;
            return new Chat(defaultTitle(object.optString("title", "")), text,
                    object.optString("updatedAt", "").trim());
        } catch (Throwable invalid) {
            return null;
        }
    }

    /** Marca temporal ISO-8601 del momento del guardado si no llegó una. */
    static String timestamp(String updatedAt) {
        String value = updatedAt == null ? "" : updatedAt.trim();
        if (!value.isEmpty() && value.length() <= 40) return value;
        try {
            return Instant.now().toString();
        } catch (Throwable ignored) {
            return "";
        }
    }

    // --- Cifrado con AndroidKeyStore ---

    /** Cifra y devuelve MAGIC + IV + ciphertext. Lanza si no hay keystore. */
    private static byte[] seal(byte[] plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_BYTES) {
            throw new GeneralSecurityException("IV inesperado del AndroidKeyStore");
        }
        byte[] encrypted = cipher.doFinal(plaintext);
        byte[] stored = new byte[MAGIC.length + IV_BYTES + encrypted.length];
        System.arraycopy(MAGIC, 0, stored, 0, MAGIC.length);
        System.arraycopy(iv, 0, stored, MAGIC.length, IV_BYTES);
        System.arraycopy(encrypted, 0, stored, MAGIC.length + IV_BYTES, encrypted.length);
        return stored;
    }

    /** Descifra MAGIC + IV + ciphertext. Lanza si el archivo no es válido. */
    private static String open(byte[] stored) throws Exception {
        if (!hasMagic(stored)) throw new GeneralSecurityException("Sin cabecera cifrada");
        int offset = MAGIC.length;
        byte[] iv = Arrays.copyOfRange(stored, offset, offset + IV_BYTES);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] plain = cipher.doFinal(stored, offset + IV_BYTES,
                stored.length - offset - IV_BYTES);
        return new String(plain, StandardCharsets.UTF_8);
    }

    private static boolean hasMagic(byte[] stored) {
        if (stored == null || stored.length <= MAGIC.length + IV_BYTES) return false;
        for (int i = 0; i < MAGIC.length; i++) {
            if (stored[i] != MAGIC[i]) return false;
        }
        return true;
    }

    /** Clave del keystore con el alias de la copia; se crea en el primer uso. */
    private static SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.SecretKeyEntry entry =
                    (KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null);
            if (entry != null && entry.getSecretKey() != null) return entry.getSecretKey();
            // Entrada inservible: se reemplaza para no quedarse sin cifrado.
            keyStore.deleteEntry(KEY_ALIAS);
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_BITS)
                .setRandomizedEncryptionRequired(true)
                .build();
        generator.init(spec);
        return generator.generateKey();
    }

    // --- Archivos y preferencias ---

    /** Escritura atómica: temporal + fsync + rename; el archivo previo no se toca. */
    private static boolean writeAtomic(File directory, byte[] stored) {
        if (!directory.isDirectory() && !directory.mkdirs()) return false;
        File temp = new File(directory, TEMP_FILE_NAME);
        try {
            try (FileOutputStream output = new FileOutputStream(temp)) {
                output.write(stored);
                output.flush();
                output.getFD().sync();
            }
            File target = new File(directory, FILE_NAME);
            if (temp.renameTo(target)) return true;
            // Algunos sistemas de archivos no reemplazan un destino existente.
            if (target.exists() && !target.delete()) return false;
            return temp.renameTo(target);
        } catch (Exception failure) {
            deleteQuietly(temp);
            return false;
        }
    }

    private static byte[] readAll(File file) throws IOException {
        try (InputStream input = new FileInputStream(file)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toByteArray();
        }
    }

    private static void deleteQuietly(File file) {
        try { if (file != null && file.exists()) file.delete(); }
        catch (Throwable ignored) {}
    }

    private static File directory(Context context) {
        try { return context.getFilesDir(); }
        catch (Throwable ignored) { return null; }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PrefKeys.PREFS, Context.MODE_PRIVATE);
    }

    private static boolean isMarkedUnavailable(Context context) {
        try {
            return prefs(context).getBoolean(PrefKeys.KEY_OFFLINE_CHAT_UNAVAILABLE, false);
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** Fija o limpia la marca de "sin cifrado" (nunca guarda contenido). */
    private static void markUnavailable(Context context, boolean unavailable) {
        try {
            prefs(context).edit()
                    .putBoolean(PrefKeys.KEY_OFFLINE_CHAT_UNAVAILABLE, unavailable)
                    .apply();
        } catch (Throwable ignored) {
            // Solo es una pista para la pantalla; no afecta a la copia.
        }
    }

    /** Avisa una sola vez que no hay cifrado disponible, sin contenido. */
    private static synchronized void warnNoEncryptionOnce() {
        if (warningLogged) return;
        warningLogged = true;
        try {
            Log.w(TAG, "copia nativa sin cifrado disponible: no se guarda en claro");
        } catch (Throwable ignored) {
            // En JVM sin Android no hay Log; el estado sí queda expuesto.
        }
    }

    // --- Modelo ---

    /** Copia descifrada lista para pintar: título, texto y fecha ISO. */
    static final class Chat {
        final String title;
        final String text;
        final String updatedAt;
        /** Vacía en una copia antigua de texto plano. */
        final List<OfflineChatFormat.Message> messages;

        Chat(String title, String text, String updatedAt) {
            this(title, text, updatedAt, Collections.emptyList());
        }

        Chat(String title, String text, String updatedAt,
             List<OfflineChatFormat.Message> messages) {
            this.title = title == null ? DEFAULT_TITLE : title;
            this.text = text == null ? "" : text;
            this.updatedAt = updatedAt == null ? "" : updatedAt;
            this.messages = messages == null ? Collections.emptyList() : messages;
        }
    }

    /** Resultado de {@link #load(Context)} sin excepciones hacia la interfaz. */
    static final class Load {
        static final int STATUS_OK = 0;
        static final int STATUS_EMPTY = 1;
        /** Archivo ilegible o keystore caído: no hay nada que mostrar. */
        static final int STATUS_UNAVAILABLE = 2;

        final int status;
        final Chat chat;

        Load(int status, Chat chat) {
            this.status = status;
            this.chat = chat;
        }
    }
}
