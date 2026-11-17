/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tablas declarativas de {@link NotesCatalog}: etiquetas en español de tipos y
 * estados, y traducción de los valores de versiones anteriores a los valores
 * canónicos (en inglés) que viajan al puente.
 *
 * Se separa del catálogo de perfiles para que ese archivo (que crece con cada
 * perfil nuevo) quede por debajo del límite de líneas del proyecto. Añadir una
 * etiqueta o una traducción es añadir un par a la tabla correspondiente.
 */
final class NotesLabels {

    private NotesLabels() {
    }

    /** Etiquetas de la interfaz para los tipos canónicos. */
    static final Map<String, String> TYPES = labels(
            NotesCatalog.TYPE_NOTE, "Nota",
            NotesCatalog.TYPE_CHARACTER, "Personaje",
            NotesCatalog.TYPE_SCENE, "Escena",
            NotesCatalog.TYPE_PLOT, "Trama",
            NotesCatalog.TYPE_DIALOGUE, "Diálogo",
            NotesCatalog.TYPE_CORRECTION, "Corrección",
            NotesCatalog.TYPE_RESEARCH, "Investigación",
            NotesCatalog.TYPE_IDEA, "Idea",
            NotesCatalog.TYPE_BUG, "Bug",
            NotesCatalog.TYPE_IMPROVEMENT, "Mejora",
            NotesCatalog.TYPE_REFACTOR, "Refactor",
            NotesCatalog.TYPE_TASK, "Tarea",
            NotesCatalog.TYPE_DECISION, "Decisión",
            NotesCatalog.TYPE_LESSON, "Lección",
            NotesCatalog.TYPE_ACTIVITY, "Actividad",
            NotesCatalog.TYPE_EXAM, "Examen",
            NotesCatalog.TYPE_RUBRIC, "Rúbrica",
            NotesCatalog.TYPE_OBSERVATION, "Observación",
            NotesCatalog.TYPE_MATERIAL, "Material",
            NotesCatalog.TYPE_TIP, "Pista",
            NotesCatalog.TYPE_INTERVIEW, "Entrevista",
            NotesCatalog.TYPE_ARTICLE, "Artículo",
            NotesCatalog.TYPE_SOURCE, "Fuente",
            NotesCatalog.TYPE_VERIFICATION, "Verificación",
            NotesCatalog.TYPE_DATA, "Dato",
            NotesCatalog.TYPE_DOCUMENT, "Documento",
            NotesCatalog.TYPE_PLEADING, "Escrito",
            NotesCatalog.TYPE_EVIDENCE, "Prueba",
            NotesCatalog.TYPE_DEADLINE, "Plazo",
            NotesCatalog.TYPE_HEARING, "Audiencia",
            NotesCatalog.TYPE_CONTRACT, "Contrato",
            NotesCatalog.TYPE_BRIEF, "Encargo",
            NotesCatalog.TYPE_CONCEPT, "Concepto",
            NotesCatalog.TYPE_WIREFRAME, "Wireframe",
            NotesCatalog.TYPE_MOCKUP, "Maqueta",
            NotesCatalog.TYPE_ASSET, "Recurso",
            NotesCatalog.TYPE_FEEDBACK, "Comentario");

    /** Etiquetas de la interfaz para los estados canónicos. */
    static final Map<String, String> STATUSES = labels(
            NotesCatalog.STATUS_IDEA, "Idea",
            NotesCatalog.STATUS_DRAFT, "Borrador",
            NotesCatalog.STATUS_REVIEW, "Revisión",
            NotesCatalog.STATUS_CLOSED, "Cerrado",
            NotesCatalog.STATUS_OPEN, "Abierto",
            NotesCatalog.STATUS_FIXED, "Arreglado",
            NotesCatalog.STATUS_VERIFIED, "Verificado",
            NotesCatalog.STATUS_DEBUNKED, "Desmentido",
            NotesCatalog.STATUS_READY, "Listo",
            NotesCatalog.STATUS_APPLIED, "Aplicado",
            NotesCatalog.STATUS_GRADED, "Calificado",
            NotesCatalog.STATUS_ARCHIVED, "Archivado",
            NotesCatalog.STATUS_IN_PROGRESS, "En curso",
            NotesCatalog.STATUS_PUBLISHED, "Publicado",
            NotesCatalog.STATUS_FILED, "Presentado",
            NotesCatalog.STATUS_APPROVED, "Aprobado",
            NotesCatalog.STATUS_DELIVERED, "Entregado");

    /** Perfiles de versiones anteriores que se traducen al id canónico. */
    static final Map<String, String> LEGACY_PROFILES = labels(
            "escritor", NotesCatalog.PROFILE_WRITER,
            "programador", NotesCatalog.PROFILE_PROGRAMMER,
            "docente", NotesCatalog.PROFILE_TEACHER,
            "periodista", NotesCatalog.PROFILE_JOURNALIST,
            "abogado", NotesCatalog.PROFILE_LEGAL,
            "juridico", NotesCatalog.PROFILE_LEGAL,
            "disenador", NotesCatalog.PROFILE_DESIGNER);

    /** Tipos de versiones anteriores (en español) a su valor canónico. */
    static final Map<String, String> LEGACY_TYPES = labels(
            "personaje", NotesCatalog.TYPE_CHARACTER,
            "escena", NotesCatalog.TYPE_SCENE,
            "trama", NotesCatalog.TYPE_PLOT,
            "dialogo", NotesCatalog.TYPE_DIALOGUE,
            "correccion", NotesCatalog.TYPE_CORRECTION,
            "investigacion", NotesCatalog.TYPE_RESEARCH,
            "mejora", NotesCatalog.TYPE_IMPROVEMENT,
            "tarea", NotesCatalog.TYPE_TASK,
            "decision", NotesCatalog.TYPE_DECISION,
            "nota", NotesCatalog.TYPE_NOTE,
            "entrevista", NotesCatalog.TYPE_INTERVIEW,
            "pista", NotesCatalog.TYPE_TIP,
            "articulo", NotesCatalog.TYPE_ARTICLE,
            "fuente", NotesCatalog.TYPE_SOURCE,
            "verificacion", NotesCatalog.TYPE_VERIFICATION,
            "dato", NotesCatalog.TYPE_DATA,
            "documento", NotesCatalog.TYPE_DOCUMENT,
            "idea", NotesCatalog.TYPE_IDEA);

    /** Estados de versiones anteriores (en español) a su valor canónico. */
    static final Map<String, String> LEGACY_STATUSES = labels(
            "borrador", NotesCatalog.STATUS_DRAFT,
            "revision", NotesCatalog.STATUS_REVIEW,
            "cerrado", NotesCatalog.STATUS_CLOSED,
            "abierto", NotesCatalog.STATUS_OPEN,
            "arreglado", NotesCatalog.STATUS_FIXED,
            "verificado", NotesCatalog.STATUS_VERIFIED,
            "en_curso", NotesCatalog.STATUS_IN_PROGRESS,
            "en curso", NotesCatalog.STATUS_IN_PROGRESS,
            "desmentido", NotesCatalog.STATUS_DEBUNKED,
            "publicado", NotesCatalog.STATUS_PUBLISHED,
            "archivado", NotesCatalog.STATUS_ARCHIVED);

    /** Prioridades de versiones anteriores a su valor canónico. */
    static final Map<String, String> LEGACY_PRIORITIES = labels(
            "baja", NotesCatalog.PRIORITY_LOW,
            "media", NotesCatalog.PRIORITY_MEDIUM,
            "alta", NotesCatalog.PRIORITY_HIGH);

    /** Mapa declarativo clave/valor a partir de pares alternos. */
    static Map<String, String> labels(String... pairs) {
        Map<String, String> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) map.put(pairs[i], pairs[i + 1]);
        return map;
    }
}
