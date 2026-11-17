/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONArray;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * Notas locales guardadas en el directorio privado de la aplicación.
 *
 * El archivo `notes.json` está cifrado en reposo (AES-256-GCM; ver
 * {@link NotesFile}) y guarda `id`, `title`, `body`, `profile`, `type`,
 * `project`, `subject`, `tags`, `status`, `priority`, `dueDate`, `localOnly`,
 * `createdAt`, `updatedAt` y `synced`. No necesita red ni la PC.
 *
 * Los archivos planos de versiones anteriores se migran a cifrado; si no se
 * pueden descifrar o no son JSON, se conserva `notes.json.corrupt`. El título
 * es obligatorio y el cuerpo puede ir vacío. Idempotencia: el `id` no cambia al
 * editar y {@link #markSynced(String)} solo cambia `synced`.
 */
public final class NotesStore {

    /** Texto que la interfaz muestra en las notas que no salen del teléfono. */
    public static final String LOCAL_ONLY_LABEL = "Solo en el teléfono";

    private final NotesFile file;

    /** En el dispositivo: AES-256-GCM con clave del AndroidKeyStore. */
    public NotesStore(File directory) {
        this(directory, new NotesKeyStoreCipher());
    }

    /**
     * Almacén con cifrador explícito. `cipher == null` desactiva el cifrado
     * (solo útil para pruebas de compatibilidad con el formato plano antiguo).
     */
    public NotesStore(File directory, NotesCipher cipher) {
        this.file = new NotesFile(directory, cipher);
    }

    /** Notas ordenadas por última edición (la más reciente primero). */
    public synchronized List<Note> list() {
        return NotesQuery.sorted(load(), NotesFilter.SORT_UPDATED);
    }

    /**
     * Notas que cumplen los criterios, en el orden pedido por el filtro
     * (`SORT_UPDATED` por defecto, o `SORT_DUE_DATE` si se pidió vencimiento).
     */
    public synchronized List<Note> list(NotesFilter filter) {
        if (filter == null) return list();
        List<Note> notes = NotesQuery.sorted(load(), filter.sort);
        return filter.apply(notes);
    }

    /**
     * Notas que la pantalla debe pintar: todas las guardadas con título (el
     * título es obligatorio y las entradas antiguas sin él no se muestran).
     * Las notas `localOnly` se incluyen: la interfaz las marca con
     * {@link #LOCAL_ONLY_LABEL}.
     */
    public synchronized List<Note> visibleNotes() {
        return NotesQuery.visible(load());
    }

    public synchronized Note get(String id) {
        if (id == null) return null;
        for (Note note : load()) {
            if (id.equals(note.id)) return note;
        }
        return null;
    }

    /** Proyectos/obras/clientes distintos ya usados, ordenados para el filtro. */
    public synchronized List<String> projects() {
        return NotesQuery.projects(load());
    }

    /** Crea una nota general con título obligatorio. */
    public synchronized Note add(String title, String body) {
        Draft draft = new Draft();
        draft.title = title;
        draft.body = body;
        return add(draft);
    }

    /**
     * Crea una nota completa con id único. Devuelve null si el título está
     * vacío (obligatorio) o si no se pudo escribir.
     */
    public synchronized Note add(Draft draft) {
        if (!hasTitle(draft)) return null;
        List<Note> notes = load();
        long now = System.currentTimeMillis();
        Note note = build(UUID.randomUUID().toString(), draft, now, now, false);
        notes.add(note);
        return file.write(notes) ? note : null;
    }

    /** Reemplaza título y cuerpo conservando el resto de campos. */
    public synchronized Note update(String id, String title, String body) {
        if (id == null || title == null || title.trim().isEmpty()) return null;
        List<Note> notes = load();
        for (int i = 0; i < notes.size(); i++) {
            Note current = notes.get(i);
            if (!current.id.equals(id)) continue;
            Draft draft = Draft.from(current);
            draft.title = title;
            draft.body = body;
            return applyDraft(notes, i, draft);
        }
        return null;
    }

    /**
     * Reemplaza los campos editables. Si algo cambia, `updatedAt` avanza y la nota
     * queda pendiente de enviar; guardar sin cambios conserva `synced`.
     */
    public synchronized Note update(String id, Draft draft) {
        if (id == null || !hasTitle(draft)) return null;
        List<Note> notes = load();
        for (int i = 0; i < notes.size(); i++) {
            if (!id.equals(notes.get(i).id)) continue;
            return applyDraft(notes, i, draft);
        }
        return null;
    }

    public synchronized boolean remove(String id) {
        if (id == null) return false;
        List<Note> notes = load();
        for (int i = 0; i < notes.size(); i++) {
            if (id.equals(notes.get(i).id)) {
                notes.remove(i);
                return file.write(notes);
            }
        }
        return false;
    }

    /** Marca la nota como enviada; idempotente, sin borrarla ni cambiar el id. */
    public synchronized boolean markSynced(String id) {
        if (id == null) return false;
        List<Note> notes = load();
        for (int i = 0; i < notes.size(); i++) {
            Note current = notes.get(i);
            if (!current.id.equals(id)) continue;
            if (current.synced) return true;
            notes.set(i, current.withSynced(true));
            return file.write(notes);
        }
        return false;
    }

    /**
     * Busca por título, cuerpo, etiquetas, personaje/módulo/fuente y proyecto,
     * sin distinguir mayúsculas ni acentos (`garcia` encuentra `García`).
     */
    public synchronized List<Note> search(String query) {
        List<Note> notes = NotesQuery.sorted(load(), NotesFilter.SORT_UPDATED);
        if (query == null || query.trim().isEmpty()) return notes;
        List<Note> matches = new ArrayList<>();
        for (Note note : notes) {
            if (NotesFilter.matchesQuery(note, query)) matches.add(note);
        }
        return matches;
    }

    /** true si la nota está marcada para no salir nunca del teléfono. */
    public static boolean isLocalOnly(Note note) {
        return note != null && note.localOnly;
    }

    /** Texto de estado para la interfaz ("Solo en el teléfono"). */
    public static String localOnlyLabel() {
        return LOCAL_ONLY_LABEL;
    }

    /**
     * true si en esta sesión el archivo se leyó o se guardó en texto plano
     * porque el cifrador falló (AndroidKeyStore no disponible). La interfaz
     * puede mostrar un aviso; el aviso de log se registra una sola vez.
     */
    public boolean isPlaintextFallback() {
        return file.isPlaintextFallback();
    }

    private Note applyDraft(List<Note> notes, int index, Draft draft) {
        Note current = notes.get(index);
        // Sin cambios no se reescribe ni reencola: conserva `updatedAt` y `synced`.
        Note candidate = build(current.id, draft, current.createdAt, current.updatedAt,
                current.synced);
        if (NotesPayload.sameContent(current, candidate)) return current;
        long now = Math.max(System.currentTimeMillis(), current.updatedAt + 1L);
        Note updated = build(current.id, draft, current.createdAt, now, false);
        notes.set(index, updated);
        return file.write(notes) ? updated : null;
    }

    private static boolean hasTitle(Draft draft) {
        return draft != null && draft.title != null && !draft.title.trim().isEmpty();
    }

    /** Normaliza el borrador y construye la nota inmutable que se guarda. */
    private static Note build(String id, Draft draft, long createdAt, long updatedAt,
                              boolean synced) {
        String profile = NotesCatalog.profileOr(draft.profile);
        return new Note(id, draft.title, draft.body, profile,
                NotesCatalog.typeOr(profile, draft.type),
                draft.project, draft.subject,
                NotesTags.cleanTags(draft.tags),
                NotesCatalog.statusOr(profile, draft.status),
                NotesCatalog.priorityOr(draft.priority),
                NotesText.dateOr(draft.dueDate),
                draft.localOnly,
                createdAt, updatedAt, synced);
    }

    private List<Note> load() {
        List<Note> notes = new ArrayList<>();
        if (!file.exists()) return notes;

        byte[] raw;
        try {
            raw = file.readBytes();
        } catch (IOException unreadable) {
            return notes;
        }
        if (raw.length == 0) return notes;
        boolean encrypted = NotesFile.isEncrypted(raw);
        // Sin cifrador (solo pruebas de compatibilidad) no se toca un archivo
        // cifrado: mejor lista vacía que respaldarlo como dañado.
        if (encrypted && !file.cipherConfigured()) return notes;

        JSONArray array;
        try {
            String json = file.decode(raw);
            if (json.trim().isEmpty()) return notes;
            array = new JSONArray(json);
        } catch (Exception corrupt) {
            // Cifrado que no se puede descifrar o JSON inválido: se conserva el
            // archivo dañado en notes.json.corrupt y se arranca con lista vacía.
            file.backupCorrupt();
            return notes;
        }

        for (int i = 0; i < array.length(); i++) {
            try {
                Note note = NotesCodec.parse(array.optJSONObject(i));
                if (note != null) notes.add(note);
            } catch (Throwable malformed) {
                // Una entrada con forma inesperada se salta; el resto del
                // archivo (y las demás notas) se conserva intacto.
            }
        }

        // Migración: el archivo plano antiguo se reescribe cifrado en cuanto se
        // pudo leer con normalidad.
        if (!encrypted && file.cipherConfigured() && !notes.isEmpty()) {
            file.write(notes);
        }
        return notes;
    }

    // ------------------------------------------------------------------
    // Modelo
    // ------------------------------------------------------------------

    /** Una nota local. Inmutable: cada edición crea una instancia nueva. */
    public static final class Note {
        public final String id;
        public final String title;
        public final String body;
        public final String profile;
        public final String type;
        public final String project;
        public final String subject;
        public final List<String> tags;
        public final String status;
        public final String priority;
        /** Vencimiento en `yyyy-MM-dd`, o "" si no tiene. */
        public final String dueDate;
        /** Si es true, la nota no se envía ni se comparte sin confirmación. */
        public final boolean localOnly;
        public final long createdAt;
        public final long updatedAt;
        public final boolean synced;

        Note(String id, String title, String body, String profile, String type, String project,
             String subject, List<String> tags, String status, String priority, String dueDate,
             boolean localOnly, long createdAt, long updatedAt, boolean synced) {
            this.id = safe(id);
            this.title = safe(title);
            this.body = safe(body);
            this.profile = NotesCatalog.profileOr(profile);
            this.type = NotesCatalog.typeOr(this.profile, type);
            this.project = safe(project);
            this.subject = safe(subject);
            this.tags = Collections.unmodifiableList(NotesTags.cleanTags(tags));
            this.status = NotesCatalog.statusOr(this.profile, status);
            this.priority = NotesCatalog.priorityOr(priority);
            this.dueDate = NotesText.dateOr(dueDate);
            this.localOnly = localOnly;
            this.createdAt = createdAt;
            this.updatedAt = updatedAt;
            this.synced = synced;
        }

        /** true si no tiene ni título ni cuerpo (nota recién creada y vacía). */
        public boolean isEmpty() {
            return title.trim().isEmpty() && body.trim().isEmpty();
        }

        /** true si tiene vencimiento. */
        public boolean hasDueDate() {
            return !dueDate.isEmpty();
        }

        /** Etiquetas como texto separado por comas, para editar o mostrar. */
        public String tagsText() {
            return NotesTags.tagsText(tags);
        }

        Note withSynced(boolean value) {
            return new Note(id, title, body, profile, type, project, subject, tags, status,
                    priority, dueDate, localOnly, createdAt, updatedAt, value);
        }
    }

    /** Campos editables de una nota, para crear o reemplazar sin perder datos. */
    public static final class Draft {
        public String profile;
        public String type;
        public String title = "";
        public String body = "";
        public String project = "";
        public String subject = "";
        public List<String> tags = new ArrayList<>();
        public String status;
        public String priority = NotesCatalog.PRIORITY_MEDIUM;
        /** Vencimiento `yyyy-MM-dd` ("" si no tiene). */
        public String dueDate = "";
        /** Si es true, la nota nunca sale del teléfono. */
        public boolean localOnly;

        public Draft() {
            this(NotesCatalog.PROFILE_GENERAL);
        }

        public Draft(String profile) {
            this.profile = NotesCatalog.profileOr(profile);
            this.type = NotesCatalog.defaultType(this.profile);
            this.status = NotesCatalog.defaultStatus(this.profile);
        }

        /** Borrador con todos los campos de una nota existente. */
        public static Draft from(Note note) {
            Draft draft = new Draft(note.profile);
            draft.type = note.type;
            draft.title = note.title;
            draft.body = note.body;
            draft.project = note.project;
            draft.subject = note.subject;
            draft.tags = new ArrayList<>(note.tags);
            draft.status = note.status;
            draft.priority = note.priority;
            draft.dueDate = note.dueDate;
            draft.localOnly = note.localOnly;
            return draft;
        }

        /** true si hay algo que merezca guardar (el título manda al guardar). */
        public boolean hasContent() {
            if (!title.trim().isEmpty() || !body.trim().isEmpty()) return true;
            if (!project.trim().isEmpty() || !subject.trim().isEmpty()) return true;
            if (!dueDate.trim().isEmpty()) return true;
            return tags != null && !tags.isEmpty();
        }

        /** Etiquetas como texto separado por comas, para el campo del editor. */
        public String tagsText() {
            return NotesTags.tagsText(tags);
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}
