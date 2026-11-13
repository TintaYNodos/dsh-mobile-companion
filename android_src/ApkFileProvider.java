/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * Proveedor de archivos local ligero para entregar el APK descargado
 * al instalador de paquetes de Android (Android 7 a 15) sin dependencias de AndroidX.
 */
public class ApkFileProvider extends ContentProvider {

    public static final String AUTHORITY = "com.tintaynodos.dshcompanion.fileprovider";

    public static Uri getUriForApk(File file) {
        return Uri.parse("content://" + AUTHORITY + "/" + file.getName());
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String filename = uri.getLastPathSegment();
        if (filename == null) throw new FileNotFoundException("Nombre de archivo invÃ¡lido");

        File file = resolveFile(filename);
        if (!file.exists()) {
            throw new FileNotFoundException("Archivo no encontrado: " + file.getAbsolutePath());
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        String filename = uri.getLastPathSegment();
        File file = resolveFile(filename != null ? filename : "DSH-Companion.apk");

        MatrixCursor cursor = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        cursor.addRow(new Object[]{file.getName(), file.length()});
        return cursor;
    }

    private File resolveFile(String filename) {
        File dir = getContext() != null ? getContext().getExternalCacheDir() : null;
        if (dir == null && getContext() != null) dir = getContext().getCacheDir();
        return new File(dir, filename);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
