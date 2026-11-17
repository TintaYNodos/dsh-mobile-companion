/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Cifrador de prueba para ejecutar la capa de datos de notas en una JVM normal,
 * sin Android ni AndroidKeyStore: AES-256-GCM con una clave fija.
 *
 * Es la dependencia inyectable de {@link NotesStore} en los tests de
 * {@link NotesStoreTest}/{@link NotesStoreExtras}; en el dispositivo el cifrador
 * real es {@link NotesKeyStoreCipher}. La clave fija hace que dos instancias del
 * test lean el mismo `notes.json`.
 */
final class NotesTestCipher implements NotesCipher {

    private static final byte[] KEY = keyMaterial();
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;

    @Override
    public byte[] encrypt(byte[] plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(KEY, "AES"));
        byte[] iv = cipher.getIV();
        byte[] encrypted = cipher.doFinal(plaintext);
        byte[] sealed = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, sealed, 0, iv.length);
        System.arraycopy(encrypted, 0, sealed, iv.length, encrypted.length);
        return sealed;
    }

    @Override
    public byte[] decrypt(byte[] sealed) throws Exception {
        byte[] iv = new byte[IV_BYTES];
        System.arraycopy(sealed, 0, iv, 0, IV_BYTES);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(KEY, "AES"),
                new GCMParameterSpec(TAG_BITS, iv));
        return cipher.doFinal(sealed, IV_BYTES, sealed.length - IV_BYTES);
    }

    /** Contenido del `notes.json` del directorio, descifrado si hace falta. */
    String readJson(File directory) throws Exception {
        byte[] data = Files.readAllBytes(new File(directory, NotesFile.FILE_NAME).toPath());
        if (!NotesFile.isEncrypted(data)) return new String(data, StandardCharsets.UTF_8);
        return new String(decrypt(NotesFile.payload(data)), StandardCharsets.UTF_8);
    }

    /** Bytes crudos del `notes.json` (para comprobar la cabecera mágica). */
    static byte[] raw(File directory) throws Exception {
        return Files.readAllBytes(new File(directory, NotesFile.FILE_NAME).toPath());
    }

    private static byte[] keyMaterial() {
        byte[] key = new byte[32];
        for (int i = 0; i < key.length; i++) key[i] = (byte) (i * 7 + 13);
        return key;
    }
}
