/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.util.Log;

import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * Archivo `notes.json`: lectura, descifrado, escritura atómica y respaldo del
 * contenido dañado.
 *
 * Formato nuevo (cifrado en reposo):
 * <pre>
 *   MAGIC ("DSHNOTES" + versión 1) + IV (12 bytes) + ciphertext (AES-256-GCM)
 * </pre>
 * El cifrador es una dependencia ({@link NotesCipher}): en el dispositivo
 * {@link NotesKeyStoreCipher} (clave del AndroidKeyStore) y en las pruebas un
 * cifrador inyectable en JVM. Si el archivo no empieza por {@link #MAGIC} se
 * interpreta como el JSON plano de versiones anteriores; {@link NotesStore}
 * lo migra a cifrado en la primera lectura.
 *
 * La escritura sigue siendo atómica (temporal + fsync + rename): si algo falla,
 * el archivo anterior queda intacto. Si el contenido no se puede descifrar o no
 * es JSON válido, {@link #backupCorrupt()} aparta el original como
 * `notes.json.corrupt` en vez de destruirlo.
 */
final class NotesFile {

    static final String FILE_NAME = "notes.json";
    static final String TEMP_FILE_NAME = "notes.json.tmp";
    static final String CORRUPT_FILE_NAME = "notes.json.corrupt";

    /** Cabecera de los archivos cifrados: "DSHNOTES" + versión 1. */
    static final byte[] MAGIC = {
            'D', 'S', 'H', 'N', 'O', 'T', 'E', 'S', 1
    };

    private static final String TAG = "DshNotes";

    private final File directory;
    private final File file;
    private final NotesCipher cipher;
    /** Si el cifrado falló, no se reintenta en cada lectura de esta instancia. */
    private boolean encryptionFailed;
    /** true si esta sesión leyó o guardó el archivo en texto plano. */
    private volatile boolean plaintextFallback;
    /** El aviso de cifrado caído se registra una sola vez por instancia. */
    private boolean warningLogged;

    NotesFile(File directory, NotesCipher cipher) {
        this.directory = directory;
        this.file = new File(directory, FILE_NAME);
        this.cipher = cipher;
    }

    boolean exists() {
        return file.isFile();
    }

    /** true si hay cifrador inyectado y todavía no ha fallado en esta instancia. */
    boolean cipherConfigured() {
        return cipher != null && !encryptionFailed;
    }

    /** true si esta sesión ha tenido que guardar o leer las notas en claro. */
    boolean isPlaintextFallback() {
        return plaintextFallback;
    }

    /** Contenido completo del archivo, tal cual está en disco. */
    byte[] readBytes() throws IOException {
        InputStream input = new FileInputStream(file);
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        } finally {
            try { input.close(); } catch (IOException ignored) { }
        }
    }

    /**
     * Texto JSON del archivo: descifra si lleva la cabecera mágica. Lanza una
     * excepción si está cifrado y no se puede descifrar (integridad/keystore).
     */
    String decode(byte[] data) throws Exception {
        if (!isEncrypted(data)) return new String(data, "UTF-8");
        if (cipher == null) throw new IOException("Archivo cifrado sin cifrador configurado");
        return new String(cipher.decrypt(payload(data)), "UTF-8");
    }

    /** true si el contenido empieza por la cabecera mágica de archivo cifrado. */
    static boolean isEncrypted(byte[] data) {
        if (data == null || data.length <= MAGIC.length) return false;
        for (int i = 0; i < MAGIC.length; i++) {
            if (data[i] != MAGIC[i]) return false;
        }
        return true;
    }

    /** Datos cifrados (IV + ciphertext) que siguen a la cabecera mágica. */
    static byte[] payload(byte[] data) {
        if (data == null || data.length <= MAGIC.length) return new byte[0];
        byte[] payload = new byte[data.length - MAGIC.length];
        System.arraycopy(data, MAGIC.length, payload, 0, payload.length);
        return payload;
    }

    /** Aparta el archivo dañado como notes.json.corrupt. */
    void backupCorrupt() {
        try {
            File backup = new File(directory, CORRUPT_FILE_NAME);
            if (backup.exists()) backup.delete();
            file.renameTo(backup);
        } catch (Throwable ignored) {
            // Si el respaldo falla, la próxima lectura lo reintenta.
        }
    }

    /**
     * Copia el `notes.json` plano anterior a `notes.json.corrupt` antes de
     * reescribirlo en claro, para no perder el rastro de la versión previa. Si
     * el archivo anterior ya estaba cifrado no se toca.
     */
    private void preservePlainPrevious() {
        try {
            if (!file.isFile()) return;
            byte[] previous = readBytes();
            if (previous.length == 0 || isEncrypted(previous)) return;
            File backup = new File(directory, CORRUPT_FILE_NAME);
            if (backup.exists()) backup.delete();
            FileOutputStream output = new FileOutputStream(backup);
            try {
                output.write(previous);
            } finally {
                try { output.close(); } catch (IOException ignored) { }
            }
        } catch (Throwable ignored) {
            // Mejor esfuerzo: sin respaldo posible, la escritura sigue.
        }
    }

    /** Registra una sola vez que el cifrado en reposo no está disponible. */
    private void warnPlaintextOnce() {
        if (warningLogged) return;
        warningLogged = true;
        try {
            Log.w(TAG, "cifrado de notas no disponible: notes.json se guarda en texto plano");
        } catch (Throwable ignored) {
            // En JVM sin Android no hay Log; el estado sí queda expuesto.
        }
    }

    /**
     * Escritura atómica del listado completo, cifrada si hay cifrador. Si el
     * cifrado falla se guarda el JSON plano (respaldo) para no perder notas; la
     * siguiente lectura detecta el plano y reintenta la migración.
     */
    boolean write(List<NotesStore.Note> notes) {
        try {
            if (!directory.isDirectory() && !directory.mkdirs()) return false;

            JSONArray array = new JSONArray();
            for (NotesStore.Note note : notes) array.put(NotesCodec.toJson(note));
            byte[] json = array.toString().getBytes("UTF-8");

            byte[] stored = json;
            if (cipher != null) {
                try {
                    stored = seal(json);
                } catch (Throwable fallback) {
                    // Sin keystore: se guarda plano para no perder notas, se
                    // conserva el plano anterior y se avisa una sola vez. La
                    // próxima instancia del almacén vuelve a intentar cifrar.
                    encryptionFailed = true;
                    plaintextFallback = true;
                    preservePlainPrevious();
                    warnPlaintextOnce();
                    stored = json;
                }
            }

            File temp = new File(directory, TEMP_FILE_NAME);
            FileOutputStream output = new FileOutputStream(temp);
            try {
                output.write(stored);
                output.flush();
                output.getFD().sync();
            } finally {
                try { output.close(); } catch (IOException ignored) { }
            }

            if (temp.renameTo(file)) return true;
            // Algunos sistemas de archivos no reemplazan un destino existente.
            if (file.exists() && !file.delete()) return false;
            return temp.renameTo(file);
        } catch (Exception failure) {
            return false;
        }
    }

    private byte[] seal(byte[] json) throws Exception {
        byte[] encrypted = cipher.encrypt(json);
        byte[] stored = new byte[MAGIC.length + encrypted.length];
        System.arraycopy(MAGIC, 0, stored, 0, MAGIC.length);
        System.arraycopy(encrypted, 0, stored, MAGIC.length, encrypted.length);
        return stored;
    }
}
