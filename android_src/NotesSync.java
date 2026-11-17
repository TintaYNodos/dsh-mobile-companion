/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Envía notas locales a la PC por el puente (`POST /dsh-companion/notes`).
 *
 * Se autentica con la cookie de dispositivo que ya usa el WebView: no hay
 * claves nuevas ni cabeceras propias. El envío va en un hilo secundario con
 * timeout de 10 s. El JSON de la nota incluye `id`, perfil, tipo, proyecto,
 * personaje/módulo, etiquetas, estado, prioridad y `dueDate`; el cuerpo puede ir
 * vacío (basta el título).
 *
 * Privacidad: las notas `localOnly` no se envían nunca; se cuentan como
 * omitidas. Si la PC no responde o rechaza la nota, se avisa con un mensaje que
 * distingue el motivo. Nunca se borra una nota local: como mucho se marca
 * `synced` cuando el puente confirma.
 */
final class NotesSync {

    private static final int TIMEOUT_MS = 10_000;
    private static final String NOTES_PATH = "/dsh-companion/notes";
    private static final int MAX_DETAIL = 140;

    private NotesSync() {
    }

    /** Resultado de un envío, con el motivo del fallo cuando lo hay. */
    enum Outcome {
        SENT,
        NO_PC,
        INCOMPLETE,
        AUTH,
        REJECTED,
        NETWORK,
        SERVER,
        LOCAL_ONLY,
        /** H-03: ya hay otro envío en vuelo; este toque no se ejecuta. */
        BUSY
    }

    /** Resumen de un envío (una nota o varias). */
    static final class Report {
        final int sent;
        final int total;
        final Outcome outcome;
        final String detail;
        /** Notas omitidas por ser solo del teléfono. */
        final int skipped;

        Report(int sent, int total, Outcome outcome, String detail) {
            this(sent, total, outcome, detail, 0);
        }

        Report(int sent, int total, Outcome outcome, String detail, int skipped) {
            this.sent = sent;
            this.total = total;
            this.outcome = outcome == null ? Outcome.SENT : outcome;
            this.detail = detail == null ? "" : detail;
            this.skipped = Math.max(0, skipped);
        }

        boolean allSent() {
            return total > 0 && sent == total;
        }
    }

    /** Aviso en el hilo principal cuando termina el envío. */
    interface Listener {
        void onFinished(Report report);
    }

    static void sendNote(Activity activity, NotesStore store, NotesStore.Note note, Listener listener) {
        if (note == null) return;
        sendNotes(activity, store, Collections.singletonList(note), listener);
    }

    /** «Enviar todas» excluye las ya enviadas: una nota no se POSTea dos veces. */
    static void sendAll(Activity activity, NotesStore store, List<NotesStore.Note> notes, Listener listener) {
        List<NotesStore.Note> pending = new ArrayList<>();
        if (notes != null) {
            for (NotesStore.Note note : notes) {
                if (note != null && !note.synced) pending.add(note);
            }
        }
        sendNotes(activity, store, pending, listener);
    }

    private static void sendNotes(Activity activity, NotesStore store,
                                  List<NotesStore.Note> notes, Listener listener) {
        if (activity == null || store == null || notes == null || notes.isEmpty()) return;

        List<NotesStore.Note> pending = new ArrayList<>();
        int localOnly = 0;
        for (NotesStore.Note note : notes) {
            if (note == null) continue;
            if (NotesStore.isLocalOnly(note)) {
                localOnly++;
            } else {
                pending.add(note);
            }
        }
        if (pending.isEmpty()) {
            finish(activity, listener, new Report(0, 0, Outcome.LOCAL_ONLY, "", localOnly));
            return;
        }

        String base = MainActivity.getActiveBunkerUrl(activity);
        String endpoint = endpointFor(base, NOTES_PATH);
        if (endpoint.isEmpty()) {
            finish(activity, listener, new Report(0, pending.size(), Outcome.NO_PC, "", localOnly));
            return;
        }

        // H-03: el candado se toma antes de crear el hilo. Un segundo toque no
        // se encola ni duplica la nota: se avisa y se deja la nota local.
        final List<NotesStore.Note> batch = new ArrayList<>(pending);
        final int skipped = localOnly;
        if (!NotesSendGuard.acquire()) {
            finish(activity, listener, new Report(0, batch.size(), Outcome.BUSY, "", skipped));
            return;
        }

        // CookieManager se consulta en el hilo de la interfaz, antes del worker.
        String cookie = cookieFor(base);
        final Handler main = new Handler(Looper.getMainLooper());
        // El worker recuerda el archivo que el puente asigna a cada nota enviada.
        final File files = filesDirectory(activity);
        final Context app = activity.getApplicationContext();
        Thread worker = new Thread(() -> {
            Report report;
            try {
                report = sendBatch(endpoint, cookie, store, batch, skipped, files, app);
            } catch (Throwable error) {
                report = new Report(0, batch.size(), Outcome.NETWORK, "", skipped);
            }
            // Pase lo que pase en el hilo, el candado y los botones se sueltan
            // en el principal (equivale al finally de toda la operación).
            final Report done = report;
            main.post(() -> {
                NotesSendGuard.release();
                finish(activity, listener, done);
            });
        }, "dsh-notes-sync");
        try {
            worker.setDaemon(true);
            worker.start();
        } catch (Throwable error) {
            // No se pudo lanzar el hilo: se suelta el candado igual que en el
            // finally del envío para no dejar los botones bloqueados.
            NotesSendGuard.release();
            finish(activity, listener, new Report(0, batch.size(), Outcome.NETWORK, "", skipped));
        }
    }

    /** Carpeta privada de la app; null si no está disponible (se sigue enviando). */
    private static File filesDirectory(Activity activity) {
        try {
            return activity.getFilesDir();
        } catch (Throwable missing) {
            return null;
        }
    }

    /** POST de cada nota del lote; lo llama el hilo de trabajo. */
    private static Report sendBatch(String endpoint, String cookie, NotesStore store,
                                    List<NotesStore.Note> batch, int skipped,
                                    File files, Context app) {
        int sent = 0;
        Outcome failure = null;
        String detail = "";
        for (NotesStore.Note note : batch) {
            PostResult result = post(endpoint, cookie, note, files, app);
            if (result.outcome == Outcome.SENT) {
                sent++;
                store.markSynced(note.id);
            } else if (failure == null) {
                failure = result.outcome;
                detail = result.detail;
            }
        }
        return new Report(sent, batch.size(), failure, detail, skipped);
    }

    private static void finish(Activity activity, Listener listener, Report report) {
        if (!activity.isFinishing()) {
            Toast.makeText(activity, messageFor(report), Toast.LENGTH_LONG).show();
        }
        if (listener != null) listener.onFinished(report);
    }

    /** Mensaje claro para el usuario según el motivo del fallo. */
    static String messageFor(Report report) {
        if (report == null) return "";
        String note = report.skipped == 1 ? "nota se queda" : "notas se quedan";
        if (report.allSent()) {
            String sent = report.total == 1 ? "Nota enviada a la PC" : report.sent + " notas enviadas a la PC";
            if (report.skipped > 0) {
                return sent + "; " + report.skipped + " " + note + " solo en el teléfono";
            }
            return sent;
        }
        if (report.sent > 0) {
            return report.sent + " de " + report.total
                    + " notas enviadas. Las demás se quedan en el teléfono";
        }
        switch (report.outcome) {
            case LOCAL_ONLY:
                return "Solo del teléfono: estas notas no se envían a la PC";
            case BUSY:
                return "Ya hay un envío de notas en curso; espera a que termine. La nota se queda en el teléfono";
            case NO_PC:
                return "No hay ninguna PC configurada; la nota se queda en el teléfono";
            case INCOMPLETE:
                return "La nota necesita un título antes de enviarse; se queda en el teléfono";
            case AUTH:
                return "La PC rechazó la sesión; vuelve a emparejar el teléfono. La nota se queda en el teléfono";
            case REJECTED:
                return report.detail.isEmpty()
                        ? "La PC rechazó la nota; se queda en el teléfono"
                        : "La PC rechazó la nota (" + report.detail + "); se queda en el teléfono";
            case SERVER:
                return report.detail.isEmpty()
                        ? "La PC respondió con un error; la nota se queda en el teléfono"
                        : "La PC respondió con un error (" + report.detail + "); la nota se queda en el teléfono";
            default:
                return "La PC no está disponible; la nota se queda en el teléfono";
        }
    }

    // ------------------------------------------------------------------
    // JSON y HTTP
    // ------------------------------------------------------------------

    /**
     * JSON completo que entiende el puente. La construcción vive en
     * {@link NotesPayload}; devuelve null si la nota es solo del teléfono.
     */
    static JSONObject payloadFor(NotesStore.Note note) throws JSONException {
        return NotesPayload.forNote(note);
    }

    /** URL del endpoint pedido a partir de la URL del búnker activo. */
    static String endpointFor(String base, String path) {
        if (base == null || base.trim().isEmpty()) return "";
        try {
            URL url = new URL(UrlTools.withScheme(base.trim()));
            String authority = url.getAuthority();
            if (authority == null || authority.isEmpty()) return "";
            return url.getProtocol() + "://" + authority + path;
        } catch (Exception malformed) {
            return "";
        }
    }

    private static String cookieFor(String base) {
        try {
            String target = base == null ? "" : UrlTools.withScheme(base.trim());
            if (target.isEmpty()) return "";
            String cookie = CookieManager.getInstance().getCookie(target);
            return cookie == null ? "" : cookie;
        } catch (Throwable ignored) {
            return "";
        }
    }

    private static final class PostResult {
        final Outcome outcome;
        final String detail;

        PostResult(Outcome outcome, String detail) {
            this.outcome = outcome;
            this.detail = detail == null ? "" : detail;
        }
    }

    /** POST síncrono: lo llama el hilo de trabajo, nunca el principal. */
    private static PostResult post(String endpoint, String cookie, NotesStore.Note note,
                                   File files, Context app) {
        // Solo el título es obligatorio; el cuerpo puede ir vacío (nota con
        // título y nada más). Se evita gastar la petición si falta el título.
        String title = note.title.trim();
        if (title.isEmpty()) {
            return new PostResult(Outcome.INCOMPLETE, "");
        }
        if (title.length() > NotesPayload.MAX_TITLE) {
            return new PostResult(Outcome.REJECTED, "el título supera " + NotesPayload.MAX_TITLE + " caracteres");
        }
        if (note.body.trim().length() > NotesPayload.MAX_BODY) {
            return new PostResult(Outcome.REJECTED, "el cuerpo supera " + NotesPayload.MAX_BODY + " caracteres");
        }

        HttpURLConnection connection = null;
        try {
            JSONObject payload = payloadFor(note);
            if (payload == null) return new PostResult(Outcome.LOCAL_ONLY, "");
            byte[] payloadBytes = payload.toString().getBytes("UTF-8");

            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setUseCaches(false);
            connection.setFixedLengthStreamingMode(payloadBytes.length);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            if (!cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);

            OutputStream output = connection.getOutputStream();
            try {
                output.write(payloadBytes);
            } finally {
                try { output.close(); } catch (Exception ignored) { }
            }

            int code = connection.getResponseCode();
            if (code == HttpURLConnection.HTTP_OK) {
                JSONObject response = new JSONObject(readAll(connection.getInputStream()));
                if (response.optBoolean("ok", false)) {
                    // El puente devuelve el archivo escrito: se recuerda para
                    // «Copiar para el chat» aunque la app se reinicie.
                    NotesChatCopy.remember(files, app, note.id, response.optString("file", ""));
                    return new PostResult(Outcome.SENT, "");
                }
                return new PostResult(Outcome.SERVER, "respuesta sin confirmación");
            }
            return classify(code, errorText(connection));
        } catch (Exception failure) {
            return new PostResult(Outcome.NETWORK, "");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** Traduce el código HTTP del puente a un motivo que el usuario entienda. */
    private static PostResult classify(int code, String error) {
        if (code == 401 || code == 403) return new PostResult(Outcome.AUTH, "");
        if (code == 400 || code == 413 || code == 415) {
            return new PostResult(Outcome.REJECTED, error);
        }
        return new PostResult(Outcome.SERVER, error.isEmpty() ? "HTTP " + code : error);
    }

    /** Texto de error del puente, recortado para que quepa en un aviso. */
    private static String errorText(HttpURLConnection connection) {
        try {
            InputStream input = connection.getErrorStream();
            if (input == null) return "";
            String raw = readAll(input);
            if (raw.trim().isEmpty()) return "";
            String message;
            try {
                message = new JSONObject(raw).optString("error", "");
            } catch (Exception notJson) {
                message = raw.trim();
            }
            message = message.trim().replace('\n', ' ');
            return message.length() > MAX_DETAIL ? message.substring(0, MAX_DETAIL) : message;
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String readAll(InputStream input) throws Exception {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return new String(output.toByteArray(), "UTF-8");
        } finally {
            try { input.close(); } catch (Exception ignored) { }
        }
    }
}
