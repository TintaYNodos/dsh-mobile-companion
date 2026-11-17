/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Catálogo declarativo de perfiles de nota (general, writer, programmer,
 * teacher, journalist, legal, designer) con sus tipos y estados.
 *
 * Los valores canónicos viajan al puente en inglés (`writer`, `bug`, `draft`);
 * las etiquetas de la interfaz están en español y viven en {@link NotesLabels}.
 * Los archivos de versiones anteriores se leen sin perder nada: los perfiles
 * `escritor`/`programador` y los tipos `personaje`/`nota`/`bug` se traducen a los
 * valores canónicos con las tablas de {@link NotesLabels}.
 *
 * Extensible de forma declarativa: un perfil nuevo es una entrada más en
 * {@link #CATALOG}; etiquetas, tipos válidos, valores por defecto y validación
 * se deducen de la lista. Java puro: lo comparten {@link NotesStore} (datos),
 * {@link NotesPayload} (contrato del puente) y la interfaz.
 */
final class NotesCatalog {

    // Perfiles (valores canónicos del contrato; etiquetas en NotesLabels)
    static final String PROFILE_GENERAL = "general";
    static final String PROFILE_WRITER = "writer";
    static final String PROFILE_PROGRAMMER = "programmer";
    static final String PROFILE_TEACHER = "teacher";
    static final String PROFILE_JOURNALIST = "journalist";
    static final String PROFILE_LEGAL = "legal";
    static final String PROFILE_DESIGNER = "designer";

    // Tipos (valores canónicos del contrato)
    static final String TYPE_NOTE = "note";
    static final String TYPE_CHARACTER = "character";
    static final String TYPE_SCENE = "scene";
    static final String TYPE_PLOT = "plot";
    static final String TYPE_DIALOGUE = "dialogue";
    static final String TYPE_CORRECTION = "correction";
    static final String TYPE_RESEARCH = "research";
    static final String TYPE_IDEA = "idea";
    static final String TYPE_BUG = "bug";
    static final String TYPE_IMPROVEMENT = "improvement";
    static final String TYPE_REFACTOR = "refactor";
    static final String TYPE_TASK = "task";
    static final String TYPE_DECISION = "decision";
    static final String TYPE_LESSON = "lesson";
    static final String TYPE_ACTIVITY = "activity";
    static final String TYPE_EXAM = "exam";
    static final String TYPE_RUBRIC = "rubric";
    static final String TYPE_OBSERVATION = "observation";
    static final String TYPE_MATERIAL = "material";
    static final String TYPE_TIP = "tip";
    static final String TYPE_INTERVIEW = "interview";
    static final String TYPE_ARTICLE = "article";
    static final String TYPE_SOURCE = "source";
    static final String TYPE_VERIFICATION = "verification";
    static final String TYPE_DATA = "data";
    static final String TYPE_DOCUMENT = "document";
    static final String TYPE_PLEADING = "pleading";
    static final String TYPE_EVIDENCE = "evidence";
    static final String TYPE_DEADLINE = "deadline";
    static final String TYPE_HEARING = "hearing";
    static final String TYPE_CONTRACT = "contract";
    static final String TYPE_BRIEF = "brief";
    static final String TYPE_CONCEPT = "concept";
    static final String TYPE_WIREFRAME = "wireframe";
    static final String TYPE_MOCKUP = "mockup";
    static final String TYPE_ASSET = "asset";
    static final String TYPE_FEEDBACK = "feedback";

    // Estados (valores canónicos del contrato)
    static final String STATUS_IDEA = "idea";
    static final String STATUS_DRAFT = "draft";
    static final String STATUS_REVIEW = "review";
    static final String STATUS_CLOSED = "closed";
    static final String STATUS_OPEN = "open";
    static final String STATUS_FIXED = "fixed";
    static final String STATUS_VERIFIED = "verified";
    static final String STATUS_DEBUNKED = "debunked";
    static final String STATUS_READY = "ready";
    static final String STATUS_APPLIED = "applied";
    static final String STATUS_GRADED = "graded";
    static final String STATUS_ARCHIVED = "archived";
    static final String STATUS_IN_PROGRESS = "in_progress";
    static final String STATUS_PUBLISHED = "published";
    static final String STATUS_FILED = "filed";
    static final String STATUS_APPROVED = "approved";
    static final String STATUS_DELIVERED = "delivered";

    // Prioridades
    static final String PRIORITY_LOW = "low";
    static final String PRIORITY_MEDIUM = "medium";
    static final String PRIORITY_HIGH = "high";
    static final String[] PRIORITIES = {PRIORITY_LOW, PRIORITY_MEDIUM, PRIORITY_HIGH};

    /** Un perfil de área: id canónico, etiquetas y catálogos que ofrece. */
    static final class Profile {
        final String id;
        final String label;
        final String projectLabel;
        final String subjectLabel;
        final String[] types;
        final String[] statuses;

        Profile(String id, String label, String projectLabel, String subjectLabel,
                String[] types, String[] statuses) {
            this.id = id;
            this.label = label;
            this.projectLabel = projectLabel;
            this.subjectLabel = subjectLabel;
            this.types = types;
            this.statuses = statuses;
        }
    }

    private static final Profile GENERAL = new Profile(PROFILE_GENERAL, "General",
            "Proyecto", "Detalle", values(TYPE_NOTE), values());
    private static final Profile WRITER = new Profile(PROFILE_WRITER, "Escritor",
            "Obra", "Personaje",
            values(TYPE_CHARACTER, TYPE_SCENE, TYPE_PLOT, TYPE_DIALOGUE,
                    TYPE_CORRECTION, TYPE_RESEARCH, TYPE_IDEA),
            values(STATUS_IDEA, STATUS_DRAFT, STATUS_REVIEW, STATUS_CLOSED));
    private static final Profile PROGRAMMER = new Profile(PROFILE_PROGRAMMER, "Programador",
            "Proyecto", "Módulo o archivo",
            values(TYPE_BUG, TYPE_IMPROVEMENT, TYPE_REFACTOR, TYPE_TASK,
                    TYPE_DECISION, TYPE_IDEA),
            values(STATUS_OPEN, STATUS_FIXED, STATUS_VERIFIED));
    private static final Profile TEACHER = new Profile(PROFILE_TEACHER, "Docente",
            "Materia", "Grupo o alumno",
            values(TYPE_LESSON, TYPE_ACTIVITY, TYPE_EXAM, TYPE_RUBRIC,
                    TYPE_OBSERVATION, TYPE_MATERIAL),
            values(STATUS_DRAFT, STATUS_READY, STATUS_APPLIED, STATUS_GRADED, STATUS_ARCHIVED));
    private static final Profile JOURNALIST = new Profile(PROFILE_JOURNALIST, "Periodista",
            "Caso o tema", "Fuente",
            values(TYPE_TIP, TYPE_INTERVIEW, TYPE_ARTICLE, TYPE_RESEARCH, TYPE_CORRECTION,
                    TYPE_SOURCE, TYPE_VERIFICATION, TYPE_DATA, TYPE_DOCUMENT, TYPE_IDEA),
            values(STATUS_OPEN, STATUS_IN_PROGRESS, STATUS_VERIFIED, STATUS_DEBUNKED,
                    STATUS_PUBLISHED, STATUS_ARCHIVED));
    private static final Profile LEGAL = new Profile(PROFILE_LEGAL, "Jurídico",
            "Expediente", "Cliente",
            values(TYPE_PLEADING, TYPE_EVIDENCE, TYPE_DEADLINE, TYPE_HEARING,
                    TYPE_CONTRACT, TYPE_RESEARCH, TYPE_NOTE),
            values(STATUS_OPEN, STATUS_IN_PROGRESS, STATUS_REVIEW, STATUS_FILED, STATUS_CLOSED));
    private static final Profile DESIGNER = new Profile(PROFILE_DESIGNER, "Diseño",
            "Cliente", "Proyecto",
            values(TYPE_BRIEF, TYPE_CONCEPT, TYPE_WIREFRAME, TYPE_MOCKUP,
                    TYPE_ASSET, TYPE_FEEDBACK, TYPE_NOTE),
            values(STATUS_IDEA, STATUS_DRAFT, STATUS_REVIEW, STATUS_APPROVED, STATUS_DELIVERED));

    /** Lista declarativa: añadir un perfil es añadir una entrada aquí. */
    static final List<Profile> CATALOG = Collections.unmodifiableList(Arrays.asList(
            GENERAL, WRITER, PROGRAMMER, TEACHER, JOURNALIST, LEGAL, DESIGNER));

    /** Ids de perfil en el orden del catálogo, para los selectores de la interfaz. */
    static final String[] PROFILES = idsOf(CATALOG);

    private NotesCatalog() {
    }

    // ------------------------------------------------------------------
    // Consultas del catálogo
    // ------------------------------------------------------------------

    /** Perfil normalizado; cualquier valor ausente o raro cae en "general". */
    static String profileOr(String raw) {
        String value = lower(raw);
        String mapped = NotesLabels.LEGACY_PROFILES.getOrDefault(value, value);
        return find(mapped) == null ? PROFILE_GENERAL : mapped;
    }

    static String profileLabel(String profile) {
        Profile found = find(profileOr(profile));
        return found == null ? "General" : found.label;
    }

    /** Tipos del perfil (copia; el llamador puede mutarla sin tocar el catálogo). */
    static String[] typesFor(String profile) {
        Profile found = find(profileOr(profile));
        return (found == null ? GENERAL : found).types.clone();
    }

    /** Tipo válido para el perfil; si no encaja, el primero del perfil. */
    static String typeOr(String profile, String raw) {
        String value = canonical(NotesLabels.TYPES, NotesLabels.LEGACY_TYPES, raw);
        if (contains(typesFor(profile), value)) return value;
        return defaultType(profile);
    }

    static String defaultType(String profile) {
        return typesFor(profile)[0];
    }

    /** Todos los tipos sin repetir (filtro "Tipo" con perfil "Todos"). */
    static String[] allTypes() {
        List<String> types = new ArrayList<>();
        for (Profile profile : CATALOG) {
            for (String type : profile.types) addOnce(types, type);
        }
        return types.toArray(new String[0]);
    }

    static String typeLabel(String type) {
        String value = canonical(NotesLabels.TYPES, NotesLabels.LEGACY_TYPES, type);
        String label = NotesLabels.TYPES.get(value);
        return label == null ? "Nota" : label;
    }

    static String[] statusesFor(String profile) {
        Profile found = find(profileOr(profile));
        return (found == null ? GENERAL : found).statuses.clone();
    }

    /** Todos los estados sin repetir (filtro "Estado" con "Todos"). */
    static String[] allStatuses() {
        List<String> statuses = new ArrayList<>();
        for (Profile profile : CATALOG) {
            for (String status : profile.statuses) addOnce(statuses, status);
        }
        return statuses.toArray(new String[0]);
    }

    /** Estado válido para el perfil; vacío significa "sin estado". */
    static String statusOr(String profile, String raw) {
        String value = canonical(NotesLabels.STATUSES, NotesLabels.LEGACY_STATUSES, raw);
        return contains(statusesFor(profile), value) ? value : "";
    }

    static String defaultStatus(String profile) {
        String[] statuses = statusesFor(profile);
        return statuses.length == 0 ? "" : statuses[0];
    }

    static String statusLabel(String status) {
        String value = canonical(NotesLabels.STATUSES, NotesLabels.LEGACY_STATUSES, status);
        String label = NotesLabels.STATUSES.get(value);
        return label == null ? "" : label;
    }

    static String priorityOr(String raw) {
        String value = NotesLabels.LEGACY_PRIORITIES.getOrDefault(lower(raw), lower(raw));
        for (String priority : PRIORITIES) {
            if (priority.equals(value)) return priority;
        }
        return PRIORITY_MEDIUM;
    }

    static String priorityLabel(String priority) {
        switch (priorityOr(priority)) {
            case PRIORITY_LOW: return "Baja";
            case PRIORITY_HIGH: return "Alta";
            default: return "Media";
        }
    }

    /** Perfil tal como lo espera el puente (el id canónico, ya en inglés). */
    static String wireProfile(String profile) {
        return profileOr(profile);
    }

    /** Prioridad tal como la espera el puente: `low`, `medium` o `high`. */
    static String wirePriority(String priority) {
        return priorityOr(priority);
    }

    /** Rótulo del campo proyecto según el perfil. */
    static String projectLabel(String profile) {
        Profile found = find(profileOr(profile));
        return found == null ? GENERAL.projectLabel : found.projectLabel;
    }

    /** Rótulo del campo personaje/módulo/fuente/detalle según el perfil. */
    static String subjectLabel(String profile) {
        Profile found = find(profileOr(profile));
        return found == null ? GENERAL.subjectLabel : found.subjectLabel;
    }

    // ------------------------------------------------------------------
    // Internos
    // ------------------------------------------------------------------

    private static Profile find(String id) {
        String value = lower(id);
        for (Profile profile : CATALOG) {
            if (profile.id.equals(value)) return profile;
        }
        return null;
    }

    /** Resuelve un valor: etiqueta conocida, traducción antigua o "" si no vale. */
    private static String canonical(Map<String, String> known, Map<String, String> legacy,
                                    String raw) {
        String value = lower(raw);
        if (known.containsKey(value)) return value;
        return legacy.getOrDefault(value, "");
    }

    private static String[] idsOf(List<Profile> profiles) {
        String[] ids = new String[profiles.size()];
        for (int i = 0; i < profiles.size(); i++) ids[i] = profiles.get(i).id;
        return ids;
    }

    private static String[] values(String... values) {
        return values;
    }

    private static boolean contains(String[] values, String expected) {
        for (String value : values) {
            if (value.equals(expected)) return true;
        }
        return false;
    }

    private static void addOnce(List<String> values, String value) {
        if (!values.contains(value)) values.add(value);
    }

    /** Clave de búsqueda: minúsculas, sin acentos ni marcas (`Verificación`). */
    private static String lower(String raw) {
        return NotesText.normalizeForSearch(raw);
    }
}
