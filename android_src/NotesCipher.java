/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Cifrador inyectable del archivo de notas (`notes.json`).
 *
 * Se usa como dependencia de {@link NotesFile}/{@link NotesStore} para que la
 * capa de datos se pueda probar en una JVM normal con un cifrador de prueba, sin
 * Android ni AndroidKeyStore. En el teléfono la implementación es
 * {@link NotesKeyStoreCipher} (AES-256-GCM con clave del AndroidKeyStore).
 *
 * Contrato del formato: {@link #encrypt(byte[])} devuelve `IV || ciphertext` con
 * el IV en los primeros {@link #IV_BYTES} bytes, y {@link #decrypt(byte[])}
 * recibe exactamente esa forma. El archivo le añade delante la cabecera mágica
 * (ver {@link NotesFile}).
 */
interface NotesCipher {

    /** Longitud del IV en bytes (GCM usa 12). */
    int IV_BYTES = 12;

    /** Cifra y devuelve `IV || ciphertext`. */
    byte[] encrypt(byte[] plaintext) throws Exception;

    /** Descifra `IV || ciphertext`; lanza si la integridad no se verifica. */
    byte[] decrypt(byte[] sealed) throws Exception;
}
