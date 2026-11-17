/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Almacén criptográfico seguro respaldado por hardware (AndroidKeyStore).
 * Emplea cifrado simétrico AES-256 en modo GCM sin relleno para proteger las
 * credenciales que se guardan en SharedPreferences, como la clave de acceso de
 * cada equipo emparejado en `pc_registry_json`.
 */
public final class KeyStoreVault {

    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "dsh_companion_vault_key";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128; // bits

    /**
     * Marca de los valores cifrados. Se guarda junto al texto cifrado en
     * `pc_registry_json` para poder distinguirlos de las claves antiguas en
     * claro y migrarlas en la primera lectura.
     */
    public static final String ENCRYPTED_PREFIX = "vault:v1:";

    private KeyStoreVault() {}

    private static SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);

        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null);
            return entry.getSecretKey();
        }

        // Compatibilidad: versiones anteriores guardaron la clave del almacén con
        // otro alias. Si ya existe una clave simétrica de la app se reutiliza, para
        // no invalidar las credenciales que ya están cifradas en el registro de PCs.
        SecretKey existing = KeyStoreVault.findExistingSecretKey(keyStore);
        if (existing != null) return existing;

        KeyGenerator keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build();
        keyGen.init(spec);
        return keyGen.generateKey();
    }

    /** Primera clave simétrica del almacén de la app (esta app crea una sola). */
    private static SecretKey findExistingSecretKey(KeyStore keyStore) {
        try {
            java.util.Enumeration<String> aliases = keyStore.aliases();
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                java.security.Key key = keyStore.getKey(alias, null);
                if (key instanceof SecretKey) return (SecretKey) key;
            }
        } catch (Exception ignored) {
            // Sin clave reutilizable: se generará una nueva.
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Cifrado genérico para credenciales persistidas en SharedPreferences
    // (por ejemplo, la clave de acceso del búnker dentro de pc_registry_json).
    // ------------------------------------------------------------------

    /** Indica si un valor guardado ya está cifrado con este almacén. */
    public static boolean isEncryptedValue(String value) {
        return value != null && value.startsWith(ENCRYPTED_PREFIX);
    }

    /**
     * Cifra un valor para guardarlo en SharedPreferences.
     *
     * Formato: {@code vault:v1:<iv base64>:<texto cifrado base64>}. Si el
     * AndroidKeyStore no está disponible (dispositivo sin keystore funcional) se
     * devuelve el valor tal cual para no romper la conexión del usuario: la
     * migración se reintenta en la próxima lectura del registro.
     */
    public static synchronized String encryptForStorage(Context context, String plaintext) {
        if (plaintext == null) return "";
        String value = plaintext.trim();
        if (value.isEmpty() || context == null) return value;

        try {
            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);

            byte[] iv = cipher.getIV();
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));

            return ENCRYPTED_PREFIX
                    + Base64.encodeToString(iv, Base64.NO_WRAP)
                    + ":"
                    + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        } catch (Exception ignored) {
            return value;
        }
    }

    /**
     * Descifra un valor guardado. Si no está cifrado devuelve el valor tal cual
     * (el llamador decide migrarlo) y si la integridad falla devuelve "".
     */
    public static synchronized String decryptForStorage(Context context, String stored) {
        if (stored == null) return "";
        String value = stored.trim();
        if (!isEncryptedValue(value)) return value;

        try {
            String body = value.substring(ENCRYPTED_PREFIX.length());
            int separator = body.indexOf(':');
            if (separator <= 0) return "";

            byte[] iv = Base64.decode(body.substring(0, separator), Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(body.substring(separator + 1), Base64.NO_WRAP);

            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));

            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return "";
        }
    }
}
