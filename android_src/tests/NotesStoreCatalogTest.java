/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.io.File;
import java.util.Arrays;
import java.util.List;

import static com.tintaynodos.dshcompanion.NotesStoreTest.CIPHER;
import static com.tintaynodos.dshcompanion.NotesStoreTest.expect;
import static com.tintaynodos.dshcompanion.NotesStoreTest.sub;
import static com.tintaynodos.dshcompanion.NotesStoreTest.write;

/**
 * Comprobaciones del catálogo declarativo de perfiles y de la migración de los
 * valores antiguos en español.
 *
 * Separadas de {@link NotesStoreExtras} (que cubre notas, privacidad, payload y
 * compartir) para que ambos archivos queden por debajo del límite de líneas del
 * proyecto. La ejecuta `NotesStoreTest.main`; usa sus contadores y `expect`.
 */
final class NotesStoreCatalogTest {

    private NotesStoreCatalogTest() {
    }

    static void run(File dir) throws Exception {
        catalog();
        journalist();
        legacyTyped(dir);
        journalistMigration(dir);
        titleRules(dir);
    }

    // ------------------------------------------------------------------
    // Catálogo declarativo
    // ------------------------------------------------------------------

    private static void catalog() {
        expect(7, NotesCatalog.CATALOG.size(), "el catálogo declara siete perfiles");
        expect(7, NotesCatalog.PROFILES.length, "PROFILES deriva del catálogo");
        String[] ids = {NotesCatalog.PROFILE_GENERAL, NotesCatalog.PROFILE_WRITER,
                NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.PROFILE_TEACHER,
                NotesCatalog.PROFILE_JOURNALIST, NotesCatalog.PROFILE_LEGAL,
                NotesCatalog.PROFILE_DESIGNER};
        String[] labels = {"General", "Escritor", "Programador", "Docente", "Periodista",
                "Jurídico", "Diseño"};
        String[] projects = {"Proyecto", "Obra", "Proyecto", "Materia", "Caso o tema",
                "Expediente", "Cliente"};
        String[] subjects = {"Detalle", "Personaje", "Módulo o archivo", "Grupo o alumno",
                "Fuente", "Cliente", "Proyecto"};
        int[] statusCounts = {0, 4, 3, 5, 6, 5, 5};
        for (int i = 0; i < ids.length; i++) {
            expect(ids[i], NotesCatalog.PROFILES[i], "perfil en el orden del catálogo");
            expect(labels[i], NotesCatalog.profileLabel(ids[i]), "etiqueta de perfil");
            expect(projects[i], NotesCatalog.projectLabel(ids[i]), "rótulo de proyecto");
            expect(subjects[i], NotesCatalog.subjectLabel(ids[i]), "rótulo de sujeto");
            expect(true, NotesCatalog.typesFor(ids[i]).length > 0, "tipos del perfil " + ids[i]);
            expect(statusCounts[i], NotesCatalog.statusesFor(ids[i]).length,
                    "estados del perfil " + ids[i]);
        }
        expect(37, NotesCatalog.allTypes().length, "allTypes sin repetir");
        expect(17, NotesCatalog.allStatuses().length, "allStatuses sin repetir");
        expect("Lección", NotesCatalog.typeLabel(NotesCatalog.TYPE_LESSON), "etiqueta Lección");
        expect("Entrevista", NotesCatalog.typeLabel(NotesCatalog.TYPE_INTERVIEW), "etiqueta Entrevista");
        expect("Prueba", NotesCatalog.typeLabel(NotesCatalog.TYPE_EVIDENCE), "etiqueta Prueba");
        expect("Maqueta", NotesCatalog.typeLabel(NotesCatalog.TYPE_MOCKUP), "etiqueta Maqueta");
        expect("Wireframe", NotesCatalog.typeLabel(NotesCatalog.TYPE_WIREFRAME), "etiqueta Wireframe");
        expect("Listo", NotesCatalog.statusLabel(NotesCatalog.STATUS_READY), "etiqueta Listo");
        expect("Publicado", NotesCatalog.statusLabel(NotesCatalog.STATUS_PUBLISHED), "etiqueta Publicado");
        expect("Presentado", NotesCatalog.statusLabel(NotesCatalog.STATUS_FILED), "etiqueta Presentado");
        expect("Entregado", NotesCatalog.statusLabel(NotesCatalog.STATUS_DELIVERED), "etiqueta Entregado");
        expect("Nota", NotesCatalog.typeLabel("inventado"), "tipo desconocido cae en Nota");
        expect("", NotesCatalog.statusLabel("inventado"), "estado desconocido sin etiqueta");

        String[] legacyProfiles = {"escritor", NotesCatalog.PROFILE_WRITER,
                "programador", NotesCatalog.PROFILE_PROGRAMMER,
                "docente", NotesCatalog.PROFILE_TEACHER,
                "periodista", NotesCatalog.PROFILE_JOURNALIST,
                "abogado", NotesCatalog.PROFILE_LEGAL,
                "disenador", NotesCatalog.PROFILE_DESIGNER,
                "otro", NotesCatalog.PROFILE_GENERAL};
        for (int i = 0; i < legacyProfiles.length; i += 2) {
            expect(legacyProfiles[i + 1], NotesCatalog.profileOr(legacyProfiles[i]),
                    "perfil antiguo " + legacyProfiles[i]);
        }
        String[] legacyTypes = {"personaje", NotesCatalog.PROFILE_WRITER, NotesCatalog.TYPE_CHARACTER,
                "escena", NotesCatalog.PROFILE_WRITER, NotesCatalog.TYPE_SCENE,
                "trama", NotesCatalog.PROFILE_WRITER, NotesCatalog.TYPE_PLOT,
                "dialogo", NotesCatalog.PROFILE_WRITER, NotesCatalog.TYPE_DIALOGUE,
                "correccion", NotesCatalog.PROFILE_WRITER, NotesCatalog.TYPE_CORRECTION,
                "investigacion", NotesCatalog.PROFILE_WRITER, NotesCatalog.TYPE_RESEARCH,
                "mejora", NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.TYPE_IMPROVEMENT,
                "tarea", NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.TYPE_TASK,
                "decision", NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.TYPE_DECISION,
                "nota", NotesCatalog.PROFILE_GENERAL, NotesCatalog.TYPE_NOTE};
        for (int i = 0; i < legacyTypes.length; i += 3) {
            expect(legacyTypes[i + 2], NotesCatalog.typeOr(legacyTypes[i + 1], legacyTypes[i]),
                    "tipo antiguo " + legacyTypes[i]);
        }
        String[] legacyStatuses = {"borrador", NotesCatalog.PROFILE_WRITER, NotesCatalog.STATUS_DRAFT,
                "revision", NotesCatalog.PROFILE_WRITER, NotesCatalog.STATUS_REVIEW,
                "cerrado", NotesCatalog.PROFILE_WRITER, NotesCatalog.STATUS_CLOSED,
                "abierto", NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.STATUS_OPEN,
                "arreglado", NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.STATUS_FIXED,
                "verificado", NotesCatalog.PROFILE_PROGRAMMER, NotesCatalog.STATUS_VERIFIED};
        for (int i = 0; i < legacyStatuses.length; i += 3) {
            expect(legacyStatuses[i + 2],
                    NotesCatalog.statusOr(legacyStatuses[i + 1], legacyStatuses[i]),
                    "estado antiguo " + legacyStatuses[i]);
        }
        String[] legacyPriorities = {"baja", NotesCatalog.PRIORITY_LOW,
                "media", NotesCatalog.PRIORITY_MEDIUM, "alta", NotesCatalog.PRIORITY_HIGH,
                "HIGH", NotesCatalog.PRIORITY_HIGH, "urgente", NotesCatalog.PRIORITY_MEDIUM};
        for (int i = 0; i < legacyPriorities.length; i += 2) {
            expect(legacyPriorities[i + 1], NotesCatalog.priorityOr(legacyPriorities[i]),
                    "prioridad antigua " + legacyPriorities[i]);
        }
        expect("writer", NotesCatalog.wireProfile("escritor"), "wireProfile traduce el perfil antiguo");
        expect("teacher", NotesCatalog.wireProfile(NotesCatalog.PROFILE_TEACHER), "wireProfile docente");
        expect("high", NotesCatalog.wirePriority(NotesCatalog.PRIORITY_HIGH), "wirePriority alta");
        expect(NotesCatalog.PROFILE_GENERAL, NotesCatalog.profileOr(null), "profileOr tolera null");
        expect(NotesCatalog.TYPE_NOTE, NotesCatalog.typeOr(NotesCatalog.PROFILE_GENERAL, ""),
                "tipo vacío cae en el por defecto");
        expect("", NotesCatalog.defaultStatus(NotesCatalog.PROFILE_GENERAL), "general sin estado");
        expect("", NotesCatalog.statusOr(NotesCatalog.PROFILE_GENERAL, NotesCatalog.STATUS_DRAFT),
                "estado de otro perfil se limpia");
        expect("2026-01-05", NotesText.dateOr("2026-1-5"), "dateOr rellena con ceros");
        expect("", NotesText.dateOr("2026-02-29"), "dateOr rechaza día imposible");
        expect("2024-02-29", NotesText.dateOr("2024-02-29"), "dateOr acepta año bisiesto");
        expect("", NotesText.dateOr("31/12/2026"), "dateOr rechaza otro formato");
        expect("", NotesText.dateOr(null), "dateOr tolera null");
        expect("garcia", NotesText.normalizeForSearch("García"), "búsqueda sin acentos");
        expect("arbol", NotesText.normalizeForSearch("ÁRBOL"), "búsqueda sin mayúsculas");
        expect("", NotesText.normalizeForSearch(null), "normalizeForSearch tolera null");
        expect("3b", NotesText.normalizeForSearch("3°B"), "búsqueda: quita el grado");
        expect("3b", NotesText.normalizeForSearch("3.ºB"), "búsqueda: ordinal con punto");
        expect("3b", NotesText.normalizeForSearch("3ºB"), "búsqueda: ordinal pegado");
        expect("3b", NotesText.normalizeForSearch("3.º B"), "búsqueda: ordinal con espacio");
        expect("1", NotesText.normalizeForSearch("1.ª"), "búsqueda: ordinal femenino");
        expect("n1", NotesText.normalizeForSearch("N°1"), "búsqueda: número con grado");
        expect("guion", NotesText.normalizeForSearch("#guion"), "búsqueda: quita la almohadilla");
        expect("5", NotesText.normalizeForSearch("№ 5"), "búsqueda: quita el numeral");
        List<String> parsed = NotesTags.parseTags("  #guion , personaje,, GUION ");
        expect(2, parsed.size(), "parseTags deduplica y quita vacías");
        expect("guion", parsed.get(0), "parseTags quita el # inicial");
        expect("a, b", NotesTags.tagsText(Arrays.asList("a", "b")), "tagsText une con comas");
        expect("", NotesTags.tagsText(null), "tagsText tolera null");
        expect(10, NotesTags.parseTags("a,b,c,d,e,f,g,h,i,j,k,l").size(), "tope de 10 etiquetas");
    }

    // ------------------------------------------------------------------
    // Perfil Periodista: los tipos y estados pedidos
    // ------------------------------------------------------------------

    private static void journalist() {
        String[] types = {NotesCatalog.TYPE_TIP, NotesCatalog.TYPE_INTERVIEW,
                NotesCatalog.TYPE_ARTICLE, NotesCatalog.TYPE_RESEARCH,
                NotesCatalog.TYPE_CORRECTION, NotesCatalog.TYPE_SOURCE,
                NotesCatalog.TYPE_VERIFICATION, NotesCatalog.TYPE_DATA,
                NotesCatalog.TYPE_DOCUMENT, NotesCatalog.TYPE_IDEA};
        String[] actualTypes = NotesCatalog.typesFor(NotesCatalog.PROFILE_JOURNALIST);
        expect(types.length, actualTypes.length, "tipos del periodista");
        for (int i = 0; i < types.length; i++) {
            expect(types[i], actualTypes[i], "tipo de periodista " + types[i]);
        }
        String[] statuses = {NotesCatalog.STATUS_OPEN, NotesCatalog.STATUS_IN_PROGRESS,
                NotesCatalog.STATUS_VERIFIED, NotesCatalog.STATUS_DEBUNKED,
                NotesCatalog.STATUS_PUBLISHED, NotesCatalog.STATUS_ARCHIVED};
        String[] actualStatuses = NotesCatalog.statusesFor(NotesCatalog.PROFILE_JOURNALIST);
        expect(statuses.length, actualStatuses.length, "estados del periodista");
        for (int i = 0; i < statuses.length; i++) {
            expect(statuses[i], actualStatuses[i], "estado de periodista " + statuses[i]);
        }
        expect(NotesCatalog.TYPE_INTERVIEW, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "entrevista"), "entrevista canónica");
        expect(NotesCatalog.TYPE_SOURCE, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "fuente"), "fuente canónica");
        expect(NotesCatalog.TYPE_VERIFICATION, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "verificación"), "verificación canónica");
        expect(NotesCatalog.TYPE_DATA, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "dato"), "dato canónico");
        expect(NotesCatalog.TYPE_DOCUMENT, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "documento"), "documento canónico");
        expect(NotesCatalog.TYPE_IDEA, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "idea"), "idea canónica");
        expect(NotesCatalog.TYPE_ARTICLE, NotesCatalog.typeOr(NotesCatalog.PROFILE_JOURNALIST,
                "artículo"), "artículo antiguo");
        expect(NotesCatalog.STATUS_IN_PROGRESS, NotesCatalog.statusOr(NotesCatalog.PROFILE_JOURNALIST,
                "en_curso"), "en_curso canónico");
        expect(NotesCatalog.STATUS_VERIFIED, NotesCatalog.statusOr(NotesCatalog.PROFILE_JOURNALIST,
                "verificado"), "verificado en periodista");
        expect(NotesCatalog.STATUS_DEBUNKED, NotesCatalog.statusOr(NotesCatalog.PROFILE_JOURNALIST,
                "desmentido"), "desmentido en periodista");
        expect(NotesCatalog.STATUS_PUBLISHED, NotesCatalog.statusOr(NotesCatalog.PROFILE_JOURNALIST,
                "publicado"), "publicado en periodista");
        expect(NotesCatalog.STATUS_ARCHIVED, NotesCatalog.statusOr(NotesCatalog.PROFILE_JOURNALIST,
                "archivado"), "archivado en periodista");
        expect(NotesCatalog.STATUS_VERIFIED, NotesCatalog.statusOr(NotesCatalog.PROFILE_PROGRAMMER,
                "verificado"), "el programador conserva verificado");
        expect("", NotesCatalog.statusOr(NotesCatalog.PROFILE_PROGRAMMER, "desmentido"),
                "el programador no acepta desmentido");
        expect("", NotesCatalog.statusOr(NotesCatalog.PROFILE_PROGRAMMER, "en_curso"),
                "el programador no acepta en curso");
        expect("Fuente", NotesCatalog.typeLabel(NotesCatalog.TYPE_SOURCE), "etiqueta Fuente");
        expect("Verificación", NotesCatalog.typeLabel("verificacion"), "etiqueta Verificación");
        expect("Dato", NotesCatalog.typeLabel(NotesCatalog.TYPE_DATA), "etiqueta Dato");
        expect("Documento", NotesCatalog.typeLabel(NotesCatalog.TYPE_DOCUMENT), "etiqueta Documento");
        expect("Desmentido", NotesCatalog.statusLabel(NotesCatalog.STATUS_DEBUNKED),
                "etiqueta Desmentido");
        expect("Jurídico", NotesCatalog.profileLabel(NotesCatalog.PROFILE_LEGAL), "etiqueta Jurídico");
        expect("Diseño", NotesCatalog.profileLabel(NotesCatalog.PROFILE_DESIGNER), "etiqueta Diseño");
        expect("Diseño", NotesCatalog.profileLabel("diseñador"), "perfil antiguo con tilde");
    }

    // ------------------------------------------------------------------
    // Migración de los valores antiguos y reglas de título
    // ------------------------------------------------------------------

    private static void legacyTyped(File dir) throws Exception {
        File legacyDir = sub(dir, "legacy");
        write(new File(legacyDir, NotesFile.FILE_NAME),
                "[{\"id\":\"w1\",\"title\":\"Ana\",\"body\":\"b\",\"profile\":\"escritor\","
                        + "\"type\":\"personaje\",\"status\":\"borrador\",\"priority\":\"alta\","
                        + "\"createdAt\":100,\"updatedAt\":900},"
                        + "{\"id\":\"p1\",\"title\":\"Bug\",\"body\":\"b\",\"profile\":\"programador\","
                        + "\"type\":\"mejora\",\"status\":\"arreglado\",\"priority\":\"baja\","
                        + "\"createdAt\":200,\"updatedAt\":300},"
                        + "{\"id\":\"g1\",\"title\":\"Nota\",\"body\":\"b\",\"type\":\"nota\","
                        + "\"createdAt\":300,\"updatedAt\":200}]");
        NotesStore store = new NotesStore(legacyDir, CIPHER);
        expect(3, store.list().size(), "migración: tres notas antiguas");
        NotesStore.Note writer = store.get("w1");
        expect(NotesCatalog.PROFILE_WRITER, writer.profile, "migración: perfil escritor");
        expect(NotesCatalog.TYPE_CHARACTER, writer.type, "migración: tipo personaje");
        expect(NotesCatalog.STATUS_DRAFT, writer.status, "migración: estado borrador");
        expect(NotesCatalog.PRIORITY_HIGH, writer.priority, "migración: prioridad alta");
        NotesStore.Note programmer = store.get("p1");
        expect(NotesCatalog.PROFILE_PROGRAMMER, programmer.profile, "migración: perfil programador");
        expect(NotesCatalog.TYPE_IMPROVEMENT, programmer.type, "migración: tipo mejora");
        expect(NotesCatalog.STATUS_FIXED, programmer.status, "migración: estado arreglado");
        expect(NotesCatalog.PRIORITY_LOW, programmer.priority, "migración: prioridad baja");
        NotesStore.Note general = store.get("g1");
        expect(NotesCatalog.PROFILE_GENERAL, general.profile, "migración: perfil general");
        expect(NotesCatalog.TYPE_NOTE, general.type, "migración: tipo note");
        expect(NotesCatalog.PRIORITY_MEDIUM, general.priority, "migración: prioridad media");
        expect("w1", store.list().get(0).id, "orden por actualización: w1 primero");
        expect("p1", store.list().get(1).id, "orden por actualización: p1 segundo");
        expect("g1", store.list().get(2).id, "orden por actualización: g1 tercero");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(legacyDir)),
                "la migración deja el archivo cifrado");
        expect(false, new File(legacyDir, NotesFile.CORRUPT_FILE_NAME).exists(),
                "los valores antiguos no se marcan como corruptos");
        String migrated = CIPHER.readJson(legacyDir);
        expect(true, migrated.contains("\"profile\":\"writer\""), "el archivo migrado usa writer");
        expect(true, migrated.contains("\"type\":\"character\""), "el archivo migrado usa character");
        expect(true, migrated.contains("\"dueDate\":\"\""), "el archivo migrado guarda dueDate vacío");
        expect("Borrador", NotesCatalog.statusLabel(writer.status), "etiqueta del estado migrado");
    }

    private static void journalistMigration(File dir) throws Exception {
        File jdir = sub(dir, "journalist");
        write(new File(jdir, NotesFile.FILE_NAME),
                "[{\"id\":\"j1\",\"title\":\"Caso del puerto\",\"body\":\"b\","
                        + "\"profile\":\"periodista\",\"type\":\"fuente\",\"status\":\"en_curso\","
                        + "\"priority\":\"alta\",\"createdAt\":10,\"updatedAt\":30},"
                        + "{\"id\":\"j2\",\"title\":\"Dato falso\",\"body\":\"b\","
                        + "\"profile\":\"periodista\",\"type\":\"verificacion\","
                        + "\"status\":\"desmentido\",\"createdAt\":20,\"updatedAt\":40},"
                        + "{\"id\":\"j3\",\"title\":\"Documento\",\"body\":\"b\","
                        + "\"profile\":\"periodista\",\"type\":\"documento\","
                        + "\"status\":\"publicado\",\"createdAt\":30,\"updatedAt\":20},"
                        + "{\"id\":\"j4\",\"title\":\"Canónica\",\"body\":\"b\","
                        + "\"profile\":\"journalist\",\"type\":\"source\","
                        + "\"status\":\"debunked\",\"createdAt\":40,\"updatedAt\":10}]");
        NotesStore store = new NotesStore(jdir, CIPHER);
        expect(4, store.list().size(), "migración: cuatro notas de periodista");
        expect(NotesCatalog.TYPE_SOURCE, store.get("j4").type,
                "acepta el tipo canónico source");
        expect(NotesCatalog.STATUS_DEBUNKED, store.get("j4").status,
                "acepta el estado canónico debunked");
        NotesStore.Note source = store.get("j1");
        expect(NotesCatalog.PROFILE_JOURNALIST, source.profile, "migración: perfil periodista");
        expect(NotesCatalog.TYPE_SOURCE, source.type, "migración: tipo fuente");
        expect(NotesCatalog.STATUS_IN_PROGRESS, source.status, "migración: estado en curso");
        expect(NotesCatalog.TYPE_VERIFICATION, store.get("j2").type, "migración: tipo verificación");
        expect(NotesCatalog.STATUS_DEBUNKED, store.get("j2").status, "migración: estado desmentido");
        expect(NotesCatalog.TYPE_DOCUMENT, store.get("j3").type, "migración: tipo documento");
        expect(NotesCatalog.STATUS_PUBLISHED, store.get("j3").status, "migración: estado publicado");
        expect("Desmentido", NotesCatalog.statusLabel(store.get("j2").status),
                "etiqueta del estado migrado");
        expect("Fuente", NotesCatalog.typeLabel(source.type), "etiqueta del tipo migrado");
        expect(true, NotesFile.isEncrypted(NotesTestCipher.raw(jdir)),
                "la migración de periodista deja el archivo cifrado");
        String migrated = CIPHER.readJson(jdir);
        expect(true, migrated.contains("\"type\":\"source\""), "el archivo migrado usa source");
        expect(true, migrated.contains("\"type\":\"verification\""),
                "el archivo migrado usa verification");
        expect(true, migrated.contains("\"type\":\"document\""), "el archivo migrado usa document");
        expect(true, migrated.contains("\"status\":\"in_progress\""),
                "el archivo migrado usa in_progress");
        expect(true, migrated.contains("\"status\":\"debunked\""), "el archivo migrado usa debunked");
        expect(true, migrated.contains("\"status\":\"published\""),
                "el archivo migrado usa published");
        expect(false, new File(jdir, NotesFile.CORRUPT_FILE_NAME).exists(),
                "los valores nuevos no se marcan como corruptos");
    }

    private static void titleRules(File dir) throws Exception {
        NotesStore store = new NotesStore(sub(dir, "titles"), CIPHER);
        expect(true, store.add("   ", "cuerpo") == null, "no se guarda sin título");
        expect(true, store.add((String) null, "cuerpo") == null, "el título null no se guarda");
        expect(true, store.add(new NotesStore.Draft()) == null, "draft sin título no se guarda");
        NotesStore.Draft bodyOnly = new NotesStore.Draft();
        bodyOnly.body = "solo cuerpo";
        expect(true, store.add(bodyOnly) == null, "el cuerpo solo no basta para guardar");
        NotesStore.Note titleOnly = store.add("Solo título", "");
        expect(true, titleOnly != null, "título solo sí se guarda");
        expect("", titleOnly.body, "la nota solo con título no tiene cuerpo");
        expect(true, store.update(titleOnly.id, "", "x") == null, "update con título vacío falla");
        expect("Solo título", store.get(titleOnly.id).title, "el update fallido no pisa el título");
        NotesStore.Draft blank = NotesStore.Draft.from(store.get(titleOnly.id));
        blank.title = "   ";
        expect(true, store.update(titleOnly.id, blank) == null, "update completo sin título falla");
        NotesStore.Draft copied = NotesStore.Draft.from(store.get(titleOnly.id));
        copied.dueDate = "2026-12-31";
        copied.localOnly = true;
        expect("2026-12-31", copied.dueDate, "Draft.from conserva dueDate");
        expect(true, copied.localOnly, "Draft.from conserva localOnly");
    }
}
