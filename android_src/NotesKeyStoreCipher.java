/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.security.KeyStore;
import java.security.GeneralSecurityException;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Cifrador de `notes.json` con una clave AES-256-GCM del AndroidKeyStore.
 *
 * Mismo patrón que {@link KeyStoreVault} pero con alias propio
 * `dsh_companion_notes_key`: la clave de las notas no se mezcla con la del
 * almacén de credenciales. La clave nunca sale del keystore respaldado por
 * hardware; aquí solo se piden operaciones de cifrado/descifrado.
 *
 * Si el keystore falla (dispositivo sin keystore funcional, clave invalidada por
 * un cambio de bloqueo), {@link NotesFile} escribe el JSON plano como respaldo
 * para no perder notas y reintenta la migración en la siguiente lectura.
 */
final class NotesKeyStoreCipher implements NotesCipher {

    private static final String PROVIDER = "AndroidKeyStore";
    /** Alias propio de las notas, distinto del alias del almacén de credenciales. */
    static final String KEY_ALIAS = "dsh_companion_notes_key";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int KEY_BITS = 256;

    @Override
    public byte[] encrypt(byte[] plaintext) throws Exception {
        if (plaintext == null) throw new GeneralSecurityException("Sin datos que cifrar");
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_BYTES) {
            throw new GeneralSecurityException("IV inesperado del AndroidKeyStore");
        }
        byte[] encrypted = cipher.doFinal(plaintext);
        byte[] sealed = new byte[IV_BYTES + encrypted.length];
        System.arraycopy(iv, 0, sealed, 0, IV_BYTES);
        System.arraycopy(encrypted, 0, sealed, IV_BYTES, encrypted.length);
        return sealed;
    }

    @Override
    public byte[] decrypt(byte[] sealed) throws Exception {
        if (sealed == null || sealed.length <= IV_BYTES) {
            throw new GeneralSecurityException("Datos cifrados incompletos");
        }
        byte[] iv = Arrays.copyOfRange(sealed, 0, IV_BYTES);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return cipher.doFinal(sealed, IV_BYTES, sealed.length - IV_BYTES);
    }

    /** Clave del keystore con el alias de notas; se crea en el primer uso. */
    private static SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.SecretKeyEntry entry =
                    (KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null);
            if (entry != null && entry.getSecretKey() != null) return entry.getSecretKey();
            // Entrada inservible (p. ej. tipo inesperado): se reemplaza.
            keyStore.deleteEntry(KEY_ALIAS);
        }

        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
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
}
