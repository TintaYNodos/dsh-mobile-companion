/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import org.json.JSONObject;

import java.io.File;
import java.util.List;

import static com.tintaynodos.dshcompanion.NotesStoreTest.CIPHER;
import static com.tintaynodos.dshcompanion.NotesStoreTest.containsId;
import static com.tintaynodos.dshcompanion.NotesStoreTest.expect;
import static com.tintaynodos.dshcompanion.NotesStoreTest.read;
import static com.tintaynodos.dshcompanion.NotesStoreTest.sub;
import static com.tintaynodos.dshcompanion.NotesStoreTest.write;

/**
 * Comprobaciones del esquema nuevo de notas (perfiles, vencimiento, prioridad,
 * filtros, privacidad `localOnly`, payload con `id` y sin destino de chat, y
 * compartir con confirmación), separadas de {@link NotesStoreTest} para mantener
 * los archivos por debajo del límite de líneas del proyecto.
 *
 * La ejecuta `NotesStoreTest.main`; usa sus contadores y sus `expect` para que el
 * resultado sea una sola suite. El catálogo declarativo y la migración de
 * valores antiguos viven en {@link NotesStoreCatalogTest}.
 */
final class NotesStoreExtras {

    private NotesStoreExtras() {
    }

    static void run(File dir) throws Exception {
        profiles(dir);
        dueDateAndFilters(dir);
        searchOrdinals(dir);
        privacy(dir);
        fallbackSafety(dir);
        payload(dir);
        share();
    }

    // ------------------------------------------------------------------
    // Notas por perfil
    // ------------------------------------------------------------------

    private static void profiles(File dir) throws Exception {
        NotesStore store = new NotesStore(sub(dir, "profiles"), CIPHER);
        NotesStore.Draft teacher = new NotesStore.Draft(NotesCatalog.PROFILE_TEACHER);
        expect(NotesCatalog.TYPE_LESSON, teacher.type, "docente empieza en Lección");
        expect(NotesCatalog.STATUS_DRAFT, teacher.status, "docente empieza en Borrador");
        teacher.title = "Clase de álgebra";
        teacher.body = "Repaso de ecuaciones";
        teacher.project = "Matemáticas";
        teacher.subject = "3.º B";
        teacher.dueDate = "2026-11-20";
        teacher.type = NotesCatalog.TYPE_EXAM;
        teacher.status = NotesCatalog.STATUS_READY;
        teacher.priority = NotesCatalog.PRIORITY_HIGH;
        teacher.tags = NotesTags.parseTags("examen, repaso");
        NotesStore.Note teacherNote = store.add(teacher);
        expect(true, teacherNote != null, "nota de docente");
        expect(NotesCatalog.PROFILE_TEACHER, teacherNote.profile, "perfil docente");
        expect(NotesCatalog.TYPE_EXAM, teacherNote.type, "tipo examen");
        expect(NotesCatalog.STATUS_READY, teacherNote.status, "estado listo");
        expect("2026-11-20", teacherNote.dueDate, "vencimiento de la nota docente");
        expect("examen, repaso", teacherNote.tagsText(), "etiquetas de la nota docente");

        NotesStore.Draft journalist = new NotesStore.Draft(NotesCatalog.PROFILE_JOURNALIST);
        journalist.title = "Fuente del puerto";
        journalist.body = "Llamada pendiente";
        journalist.project = "Caso del puerto";
        journalist.subject = "Fuente anónima";
        journalist.type = NotesCatalog.TYPE_INTERVIEW;
        journalist.status = NotesCatalog.STATUS_IN_PROGRESS;
        NotesStore.Note journalistNote = store.add(journalist);
        expect(NotesCatalog.PROFILE_JOURNALIST, journalistNote.profile, "perfil periodista");
        expect(NotesCatalog.TYPE_INTERVIEW, journalistNote.type, "tipo entrevista");
        expect(NotesCatalog.STATUS_IN_PROGRESS, journalistNote.status, "estado en curso");
        expect("Caso o tema", NotesCatalog.projectLabel(journalistNote.profile), "rótulo Caso o tema");
        expect("Fuente", NotesCatalog.subjectLabel(journalistNote.profile), "rótulo Fuente");

        NotesStore.Draft legal = new NotesStore.Draft(NotesCatalog.PROFILE_LEGAL);
        legal.title = "Demanda 42";
        legal.project = "Expediente 42";
        legal.subject = "Cliente SA";
        legal.type = NotesCatalog.TYPE_PLEADING;
        legal.status = NotesCatalog.STATUS_FILED;
        NotesStore.Note legalNote = store.add(legal);
        expect(NotesCatalog.PROFILE_LEGAL, legalNote.profile, "perfil abogado");
        expect(NotesCatalog.TYPE_PLEADING, legalNote.type, "tipo escrito");
        expect(NotesCatalog.STATUS_FILED, legalNote.status, "estado presentado");
        expect("Expediente", NotesCatalog.projectLabel(legalNote.profile), "rótulo Expediente");
        expect("Cliente", NotesCatalog.subjectLabel(legalNote.profile), "rótulo Cliente");

        NotesStore.Draft designer = new NotesStore.Draft(NotesCatalog.PROFILE_DESIGNER);
        designer.title = "Pantalla de turnos";
        designer.project = "Cliente Norte";
        designer.subject = "App de turnos";
        designer.type = NotesCatalog.TYPE_WIREFRAME;
        designer.status = NotesCatalog.STATUS_APPROVED;
        NotesStore.Note designerNote = store.add(designer);
        expect(NotesCatalog.PROFILE_DESIGNER, designerNote.profile, "perfil diseñador");
        expect(NotesCatalog.TYPE_WIREFRAME, designerNote.type, "tipo wireframe");
        expect(NotesCatalog.STATUS_APPROVED, designerNote.status, "estado aprobado");
        expect("Cliente", NotesCatalog.projectLabel(designerNote.profile), "rótulo Cliente del diseño");
        expect("Proyecto", NotesCatalog.subjectLabel(designerNote.profile), "rótulo Proyecto del diseño");

        NotesStore.Draft writer = new NotesStore.Draft(NotesCatalog.PROFILE_WRITER);
        writer.title = "Ana en el puerto";
        writer.type = NotesCatalog.TYPE_CHARACTER;
        expect(NotesCatalog.TYPE_CHARACTER, store.add(writer).type, "tipo personaje del escritor");
        NotesStore.Draft programmer = new NotesStore.Draft(NotesCatalog.PROFILE_PROGRAMMER);
        programmer.title = "Fallo del puente";
        programmer.type = NotesCatalog.TYPE_BUG;
        expect(NotesCatalog.TYPE_BUG, store.add(programmer).type, "tipo bug del programador");
        NotesStore.Note generalNote = store.add("Suelta", "cuerpo");
        expect(NotesCatalog.PROFILE_GENERAL, generalNote.profile, "perfil general intacto");
        expect(NotesCatalog.TYPE_NOTE, generalNote.type, "tipo note del general");
        expect(7, store.list().size(), "siete notas, una por perfil");

        NotesStore reopened = new NotesStore(new File(dir, "profiles"), CIPHER);
        expect(7, reopened.list().size(), "los siete perfiles persisten");
        NotesStore.Note reloaded = reopened.get(teacherNote.id);
        expect(NotesCatalog.PROFILE_TEACHER, reloaded.profile, "el perfil docente persiste");
        expect(NotesCatalog.TYPE_EXAM, reloaded.type, "el tipo examen persiste");
        expect(NotesCatalog.STATUS_READY, reloaded.status, "el estado listo persiste");
        expect("2026-11-20", reloaded.dueDate, "el vencimiento persiste");
        JSONObject teacherPayload = NotesSync.payloadFor(teacherNote);
        expect("teacher", teacherPayload.optString("profile", ""), "el perfil viaja como teacher");
        expect("exam", teacherPayload.optString("type", ""), "el tipo viaja como exam");
        expect("ready", teacherPayload.optString("status", ""), "el estado viaja como ready");
        expect("journalist", NotesSync.payloadFor(journalistNote).optString("profile", ""),
                "el perfil viaja como journalist");
        expect("legal", NotesSync.payloadFor(legalNote).optString("profile", ""),
                "el perfil viaja como legal");
        expect("designer", NotesSync.payloadFor(designerNote).optString("profile", ""),
                "el perfil viaja como designer");
    }

    // ------------------------------------------------------------------
    // Vencimiento, prioridad, filtros y orden
    // ------------------------------------------------------------------

    private static void dueDateAndFilters(File dir) throws Exception {
        NotesStore store = new NotesStore(sub(dir, "due"), CIPHER);
        NotesStore.Note late = dated(store, "Tarde", "2026-12-31", NotesCatalog.PRIORITY_MEDIUM);
        dated(store, "Pronto", "2026-01-05", NotesCatalog.PRIORITY_MEDIUM);
        NotesStore.Note middle = dated(store, "Media", "2026-06-15", NotesCatalog.PRIORITY_MEDIUM);
        NotesStore.Note none = store.add("Sin fecha", "cuerpo");
        NotesStore.Draft urgent = new NotesStore.Draft();
        urgent.title = "Urgente";
        urgent.priority = NotesCatalog.PRIORITY_HIGH;
        NotesStore.Note high = store.add(urgent);
        expect(true, high != null, "nota de prioridad alta");
        expect("2026-12-31", late.dueDate, "la nota guarda el vencimiento");
        expect(true, late.hasDueDate(), "hasDueDate true con vencimiento");
        expect(false, none.hasDueDate(), "hasDueDate false sin vencimiento");

        NotesStore.Draft loose = new NotesStore.Draft();
        loose.title = "Fecha corta";
        loose.dueDate = "2026-1-5";
        NotesStore.Note looseNote = store.add(loose);
        expect("2026-01-05", looseNote.dueDate, "dateOr normaliza yyyy-M-d");
        NotesStore.Draft invalid = new NotesStore.Draft();
        invalid.title = "Fecha inválida";
        invalid.dueDate = "31/12/2026";
        expect("", store.add(invalid).dueDate, "dateOr descarta una fecha inválida");

        NotesFilter withDate = new NotesFilter();
        withDate.withDueDate = true;
        expect(4, store.list(withDate).size(), "filtro con fecha");
        NotesFilter byDue = new NotesFilter();
        byDue.sort = NotesFilter.SORT_DUE_DATE;
        List<NotesStore.Note> ordered = store.list(byDue);
        expect(7, ordered.size(), "el orden por vencimiento no pierde notas");
        expect("2026-01-05", ordered.get(0).dueDate, "el orden empieza por la fecha más próxima");
        expect("", ordered.get(ordered.size() - 1).dueDate, "las notas sin fecha van al final");
        expect(looseNote.id, ordered.get(0).id, "la primera nota del orden es la de fecha corta");

        NotesFilter highOnly = new NotesFilter();
        highOnly.priority = NotesCatalog.PRIORITY_HIGH;
        expect(1, store.list(highOnly).size(), "filtro por prioridad alta");
        NotesFilter lowOnly = new NotesFilter();
        lowOnly.priority = NotesCatalog.PRIORITY_LOW;
        expect(0, store.list(lowOnly).size(), "filtro por prioridad baja sin coincidencias");
        NotesFilter combined = new NotesFilter();
        combined.withDueDate = true;
        combined.priority = NotesCatalog.PRIORITY_MEDIUM;
        expect(4, store.list(combined).size(), "filtros combinados de fecha y prioridad");
        expect(false, highOnly.isEmpty(), "un filtro con criterios no está vacío");
        expect(true, new NotesFilter().isEmpty(), "el filtro por defecto está vacío");

        NotesStore.Draft clear = NotesStore.Draft.from(store.get(late.id));
        clear.dueDate = "";
        store.update(late.id, clear);
        expect(false, store.get(late.id).hasDueDate(), "update puede quitar el vencimiento");
        expect(3, store.list(withDate).size(), "el filtro con fecha baja tras quitar una fecha");
        expect(middle.id, store.get(middle.id).id, "la nota con fecha media sigue accesible");
    }

    private static NotesStore.Note dated(NotesStore store, String title, String dueDate,
                                         String priority) {
        NotesStore.Draft draft = new NotesStore.Draft();
        draft.title = title;
        draft.dueDate = dueDate;
        draft.priority = priority;
        return store.add(draft);
    }

    // ------------------------------------------------------------------
    // Búsqueda tolerante a ordinales (3b -> 3.ºB; n1 -> n°1)
    // ------------------------------------------------------------------

    private static void searchOrdinals(File dir) throws Exception {
        NotesStore store = new NotesStore(sub(dir, "ordinals"), CIPHER);
        NotesStore.Draft grade = new NotesStore.Draft(NotesCatalog.PROFILE_TEACHER);
        grade.title = "Lista de clase";
        grade.subject = "3.º B";
        expect(true, store.add(grade) != null, "nota con ordinal");
        NotesStore.Draft numbered = new NotesStore.Draft();
        numbered.title = "Apartado";
        numbered.body = "Ver n°1 del expediente";
        expect(true, store.add(numbered) != null, "nota con número");
        expect(1, store.search("3b").size(), "3b encuentra 3.ºB");
        expect(1, store.search("3B").size(), "3B encuentra 3.ºB");
        expect(1, store.search("3°b").size(), "3°b encuentra 3.ºB");
        expect(1, store.search("n1").size(), "n1 encuentra n°1");
        expect(1, store.search("N°1").size(), "N°1 encuentra n°1");
        expect(0, store.search("4c").size(), "búsqueda sin coincidencias de otro grupo");
        NotesFilter filter = new NotesFilter();
        filter.query = "3b";
        expect(1, store.list(filter).size(), "el filtro normaliza igual que la búsqueda");
    }

    // ------------------------------------------------------------------
    // Respaldo plano: estado expuesto y copia del archivo anterior
    // ------------------------------------------------------------------

    private static void fallbackSafety(File dir) throws Exception {
        File fdir = sub(dir, "fallback");
        NotesStore failing = new NotesStore(fdir, new FailingNotesCipher());
        expect(false, failing.isPlaintextFallback(), "sin fallo no hay respaldo plano");
        expect(true, failing.add("Primera", "plana") != null, "se guarda la primera nota plana");
        expect(true, failing.isPlaintextFallback(), "el fallo de cifrado queda expuesto");
        expect(true, failing.add("Segunda", "plana") != null, "se guarda la segunda nota plana");
        File corrupt = new File(fdir, NotesFile.CORRUPT_FILE_NAME);
        expect(true, corrupt.isFile(), "se conserva el plano anterior como corrupto");
        String backup = read(corrupt);
        expect(true, backup.contains("Primera"), "el respaldo guarda la versión anterior");
        expect(false, backup.contains("Segunda"), "el respaldo no incluye la versión nueva");
        expect(true, read(new File(fdir, NotesFile.FILE_NAME)).contains("Segunda"),
                "el archivo vivo tiene la versión nueva");
        expect(2, failing.list().size(), "las notas del respaldo plano se leen");
        NotesStore good = new NotesStore(fdir, CIPHER);
        expect(2, good.list().size(), "un cifrador bueno migra el archivo plano");
        expect(false, good.isPlaintextFallback(), "sin fallo no se marca el respaldo");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(fdir)),
                "el archivo vuelve a quedar cifrado");
    }

    // ------------------------------------------------------------------
    // Privacidad: localOnly y notas visibles
    // ------------------------------------------------------------------

    private static void privacy(File dir) throws Exception {
        File priv = sub(dir, "privacy");
        NotesStore store = new NotesStore(priv, CIPHER);
        NotesStore.Draft secret = new NotesStore.Draft();
        secret.title = "Secreto del consultorio";
        secret.body = "no sale del teléfono";
        secret.localOnly = true;
        NotesStore.Note secretNote = store.add(secret);
        expect(true, secretNote.localOnly, "la nota guarda localOnly");
        expect(true, NotesStore.isLocalOnly(secretNote), "isLocalOnly detecta la nota");
        expect(true, NotesSync.payloadFor(secretNote) == null, "una nota localOnly no genera payload");
        expect(true, containsId(store.visibleNotes(), secretNote.id),
                "visibleNotes incluye localOnly (la UI la marca)");
        expect(1, store.search("secreto").size(), "la búsqueda encuentra la nota localOnly");
        expect(true, CIPHER.readJson(priv).contains("\"localOnly\":true"), "el archivo guarda localOnly");
        NotesStore reopened = new NotesStore(priv, CIPHER);
        expect(true, reopened.get(secretNote.id).localOnly, "localOnly persiste entre instancias");
        NotesStore.Note normal = store.add("Normal", "cuerpo");
        expect(false, NotesStore.isLocalOnly(normal), "isLocalOnly false en nota normal");
        expect(NotesStore.LOCAL_ONLY_LABEL, NotesStore.localOnlyLabel(), "etiqueta de nota local");
        expect(true, NotesPayload.forNote(secretNote) == null,
                "NotesPayload descarta la nota localOnly");
        JSONObject normalPayload = NotesPayload.forNote(normal);
        expect(true, normalPayload != null, "una nota normal sí produce payload");
        expect(false, normalPayload.has("localOnly"), "el payload no expone la marca localOnly");

        File hidden = sub(dir, "hidden");
        write(new File(hidden, NotesFile.FILE_NAME),
                "[{\"id\":\"empty\",\"title\":\"\",\"body\":\"x\",\"createdAt\":1,\"updatedAt\":1},"
                        + "{\"id\":\"ok\",\"title\":\"Visible\",\"body\":\"\","
                        + "\"createdAt\":1,\"updatedAt\":2}]");
        NotesStore hiddenStore = new NotesStore(hidden, CIPHER);
        expect(2, hiddenStore.list().size(), "list incluye la entrada sin título");
        expect(1, hiddenStore.visibleNotes().size(), "visibleNotes oculta las entradas sin título");
        expect("ok", hiddenStore.visibleNotes().get(0).id, "visibleNotes devuelve la nota con título");
    }

    // ------------------------------------------------------------------
    // Payload del puente
    // ------------------------------------------------------------------

    private static void payload(File dir) throws Exception {
        NotesStore store = new NotesStore(sub(dir, "payload"), CIPHER);
        NotesStore.Draft draft = new NotesStore.Draft();
        draft.title = "Con id";
        draft.dueDate = "2026-12-31";
        NotesStore.Note note = store.add(draft);
        JSONObject payload = NotesSync.payloadFor(note);
        expect(note.id, payload.optString("id", ""), "el payload lleva el id");
        expect("2026-12-31", payload.optString("dueDate", ""), "el payload lleva dueDate");
        expect(false, payload.has("localOnly"), "el payload no incluye localOnly");
        expect(false, payload.toString().contains("chat"), "el payload no incluye destino de chat");
        expect("general", payload.optString("profile", ""), "el perfil general viaja como general");
        expect("note", payload.optString("type", ""), "el tipo note viaja canónico");
        expect("medium", payload.optString("priority", ""), "la prioridad media viaja como medium");
        expect("", payload.optString("body", ""), "el payload admite cuerpo vacío");

        NotesStore.Note edited = store.update(note.id, "Con id editado", "");
        expect(note.id, edited.id, "editar conserva el id");
        expect(note.id, NotesSync.payloadFor(edited).optString("id", ""),
                "el payload conserva el id tras editar");
        expect(true, store.markSynced(note.id), "markSynced sobre la nota del payload");
        expect(note.id, NotesSync.payloadFor(store.get(note.id)).optString("id", ""),
                "el payload conserva el id tras sincronizar");
        expect(true, store.get(note.id).synced, "markSynced conserva el id y marca la nota");
    }

    // ------------------------------------------------------------------
    // Compartir y privacidad
    // ------------------------------------------------------------------

    private static void share() {
        NotesStore.Draft draft = new NotesStore.Draft(NotesCatalog.PROFILE_WRITER);
        draft.title = "Ana";
        draft.body = "Cuerpo de la escena";
        draft.type = NotesCatalog.TYPE_CHARACTER;
        draft.project = "Novela";
        draft.subject = "Ana";
        draft.dueDate = "2026-12-31";
        draft.tags = NotesTags.parseTags("faro");
        NotesShare.Plan plan = NotesShare.plan(draft);
        expect(false, plan.requiresConfirmation, "una nota normal no pide confirmación");
        expect("Ana", plan.subject, "el asunto es el título");
        expect(true, plan.text.contains("Escritor"), "el texto lleva el perfil");
        expect(true, plan.text.contains("Personaje"), "el texto lleva el tipo");
        expect(true, plan.text.contains("Obra: Novela"), "el texto lleva el rótulo del proyecto");
        expect(true, plan.text.contains("Vence: 2026-12-31"), "el texto lleva el vencimiento");
        expect(true, plan.text.contains("Etiquetas: faro"), "el texto lleva las etiquetas");
        expect(plan.text, NotesShare.text(draft), "text() coincide con el plan");

        draft.localOnly = true;
        NotesShare.Plan localPlan = NotesShare.plan(draft);
        expect(true, localPlan.requiresConfirmation, "una nota localOnly pide confirmación");
        expect("", localPlan.text, "la nota localOnly se omite del texto por defecto");
        expect("", NotesShare.text(draft), "text() omite la nota localOnly");
        expect(true, NotesShare.text(draft, true).contains("Cuerpo de la escena"),
                "con confirmación el texto incluye el cuerpo");
        expect(false, NotesShare.text(draft, true).contains(NotesStore.LOCAL_ONLY_LABEL),
                "el texto compartido no filtra la marca localOnly");
        expect(true, NotesShare.requiresConfirmation(draft), "requiresConfirmation con localOnly");
        expect(false, NotesShare.requiresConfirmation(null), "requiresConfirmation tolera null");
        expect("", NotesShare.text(null), "text(null) devuelve vacío");
        expect("Nota", NotesShare.subject(new NotesStore.Draft()), "asunto por defecto Nota");
    }
}
