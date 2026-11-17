/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

/**
 * Cifrador que siempre falla, para probar el respaldo de {@link NotesFile}: si
 * el AndroidKeyStore no está disponible, las notas se guardan en JSON plano y la
 * migración se reintenta en la siguiente lectura con un cifrador funcional.
 */
final class FailingNotesCipher implements NotesCipher {

    @Override
    public byte[] encrypt(byte[] plaintext) throws Exception {
        throw new IllegalStateException("keystore no disponible (prueba)");
    }

    @Override
    public byte[] decrypt(byte[] sealed) throws Exception {
        throw new IllegalStateException("keystore no disponible (prueba)");
    }
}
