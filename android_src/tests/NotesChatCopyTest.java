/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.io.File;

import static com.tintaynodos.dshcompanion.NotesStoreTest.expect;
import static com.tintaynodos.dshcompanion.NotesStoreTest.read;
import static com.tintaynodos.dshcompanion.NotesStoreTest.sub;

/**
 * Comprobaciones Java puras de «Copiar para el chat»: el texto exacto que se
 * deja en el portapapeles (título con comillas y acentos, archivo del puente),
 * la decisión enviada / no enviada / solo en el teléfono, la validación del
 * nombre de archivo y el índice id -> archivo (aquí con contexto nulo, que es
 * el respaldo sin cifrado).
 *
 * La ejecuta `NotesStoreTest.main` y usa sus contadores para que el resultado
 * sea una sola suite, sin un ejecutable más.
 */
final class NotesChatCopyTest {

    private static final String FILE = "2026-11-17-153000-informe-q3-cafe.md";

    private NotesChatCopyTest() {
    }

    static void run(File dir) throws Exception {
        reference();
        safeNames();
        steps();
        messages();
        index(sub(dir, "index"));
    }

    /** Texto copiado: una línea, exacta, con título y archivo del puente. */
    private static void reference() {
        String title = "Informe \"Q3\" — café";
        String expected = "Revisa la nota «" + title
                + "» @companion/synced_chats/notes/" + FILE;
        String text = NotesChatCopy.reference(title, FILE);
        expect(expected, text, "el texto copiado es exacto");
        expect(true, text.startsWith(NotesChatCopy.REFERENCE_HEAD),
                "el texto empieza con la orden para el agente");
        expect(true, text.contains(NotesChatCopy.REFERENCE_MIDDLE + FILE),
                "el texto lleva la ruta relativa y el archivo del puente");
        expect(true, !text.contains(":\\"), "el texto no lleva ruta absoluta de Windows");
        expect(true, !text.contains("\n") && !text.contains("\r"),
                "el texto copiado es una sola línea");
        expect(true, text.endsWith(".md"), "la referencia termina en el archivo .md");
        expect(true, !text.endsWith("\n"), "no hay salto de línea final");

        expect(NotesChatCopy.reference("  Título con espacios  ", FILE),
                "Revisa la nota «Título con espacios» @companion/synced_chats/notes/" + FILE,
                "el título se recorta sin tocar las palabras");
        expect(NotesChatCopy.reference("Con\nsalto\ty tabulador", FILE),
                "Revisa la nota «Con salto y tabulador» @companion/synced_chats/notes/" + FILE,
                "el título se aplana a una línea");
        expect(NotesChatCopy.reference("  Acentos: García, Muñoz  ", FILE),
                "Revisa la nota «Acentos: García, Muñoz» @companion/synced_chats/notes/" + FILE,
                "los acentos y las comillas se conservan");
        expect("", NotesChatCopy.reference("", FILE), "sin título no hay texto");
        expect("", NotesChatCopy.reference(null, FILE), "título nulo no hay texto");
        expect("", NotesChatCopy.reference("Título", ""), "sin archivo no hay texto");
    }

    /** Solo el nombre .md del directorio de notas puede entrar en la referencia. */
    private static void safeNames() {
        expect(FILE, NotesChatCopy.safeFile(FILE), "un archivo del puente es válido");
        expect("nota.md", NotesChatCopy.safeFile("  nota.md  "), "se recortan los espacios");
        expect("", NotesChatCopy.safeFile("../fuera.md"), "se rechaza la salida con ..");
        expect("", NotesChatCopy.safeFile("notes/otra.md"), "se rechaza una ruta con barra");
        expect("", NotesChatCopy.safeFile("notes\\otra.md"), "se rechaza una ruta con contrabarra");
        expect("", NotesChatCopy.safeFile("nota.txt"), "se rechaza lo que no es .md");
        expect("", NotesChatCopy.safeFile("nota"), "se rechaza un nombre sin extensión");
        expect("", NotesChatCopy.safeFile(".md"), "se rechaza solo la extensión");
        expect("", NotesChatCopy.safeFile("no\tta.md"), "se rechaza un carácter de control");
        expect("", NotesChatCopy.safeFile(null), "archivo nulo no es válido");
        expect("", NotesChatCopy.reference("Título", "../fuera.md"),
                "con archivo inválido no se copia nada");
    }

    /** Decisión: solo en el teléfono, sin título, pendiente y ya enviada. */
    private static void steps() {
        expect(true, NotesChatCopy.stepFor(true, true, "Título", FILE) == NotesChatCopy.Step.REFUSE_LOCAL_ONLY, "localOnly no se envía nunca aunque esté marcada como enviada");
        expect(true, NotesChatCopy.stepFor(true, false, "", "") == NotesChatCopy.Step.REFUSE_LOCAL_ONLY, "localOnly manda sobre el título vacío");
        expect(true, NotesChatCopy.stepFor(false, false, "Título", "") == NotesChatCopy.Step.SEND_THEN_COPY, "una nota sin enviar se envía primero");
        expect(true, NotesChatCopy.stepFor(false, false, "Título", "archivo-viejo.md") == NotesChatCopy.Step.SEND_THEN_COPY, "sin enviar se envía aunque haya un archivo recordado");
        expect(true, NotesChatCopy.stepFor(false, true, "Título", FILE) == NotesChatCopy.Step.COPY, "una nota ya enviada se copia directamente");
        expect(true, NotesChatCopy.stepFor(false, true, "Título", "") == NotesChatCopy.Step.REFUSE_NO_FILE, "enviada sin archivo conocido no se copia");
        expect(true, NotesChatCopy.stepFor(false, true, "Título", "../fuera.md") == NotesChatCopy.Step.REFUSE_NO_FILE, "enviada con archivo inválido no se copia");
        expect(true, NotesChatCopy.stepFor(false, false, "  ", FILE) == NotesChatCopy.Step.REFUSE_NO_TITLE, "sin título no se envía ni se copia");
    }

    /** Los avisos son los textos acordados y explican el caso. */
    private static void messages() {
        expect("Copiado. Pégalo en el chat que quieras.", NotesChatCopy.COPIED_MESSAGE,
                "el aviso de copiado es el acordado");
        expect("No se pudo enviar: no hay archivo que el agente pueda leer",
                NotesChatCopy.SEND_FAILED_MESSAGE,
                "el aviso de envío fallido es el acordado");
        expect(true, NotesChatCopy.LOCAL_ONLY_MESSAGE.contains("teléfono"),
                "el aviso localOnly dice que no sale del teléfono");
        expect(true, NotesChatCopy.SEND_FAILED_MESSAGE.contains("archivo"),
                "el aviso de fallo dice que no hay archivo");
        expect(true, NotesChatCopy.NO_FILE_MESSAGE.contains("archivo"),
                "el aviso sin archivo conocido menciona el archivo");
        expect(true, NotesChatCopy.NO_TITLE_MESSAGE.contains("título"),
                "el aviso sin título lo explica");
    }

    /** Índice id -> archivo: alta, reemplazo, aislamiento y tolerancia. */
    private static void index(File dir) throws Exception {
        File root = sub(dir, "remote");
        expect("", NotesChatCopy.known(root, null, "nota-1"),
                "sin envíos previos no hay archivo recordado");
        NotesChatCopy.remember(root, null, "nota-1", FILE);
        expect(FILE, NotesChatCopy.known(root, null, "nota-1"),
                "el archivo que devolvió el envío se recuerda");
        expect("", NotesChatCopy.known(root, null, "nota-2"),
                "otra nota no hereda el archivo");
        NotesChatCopy.remember(root, null, "nota-1", "2026-11-18-090000-otra.md");
        expect("2026-11-18-090000-otra.md", NotesChatCopy.known(root, null, "nota-1"),
                "reenviar actualiza el archivo de la misma nota");
        NotesChatCopy.remember(root, null, "nota-2", "2026-11-18-090500-segunda.md");
        expect("2026-11-18-090500-segunda.md", NotesChatCopy.known(root, null, "nota-2"),
                "el índice guarda varias notas");
        expect("2026-11-18-090000-otra.md", NotesChatCopy.known(root, null, "nota-1"),
                "añadir otra nota no pisa la primera");
        String indexText = read(new File(root, "notes_remote.dat"));
        expect(2, indexText.split("\n").length, "el índice tiene una línea por nota");
        expect(true, !indexText.contains("../"), "el índice no acepta rutas");
        NotesChatCopy.remember(root, null, "nota-2", "../fuera.md");
        expect("2026-11-18-090500-segunda.md", NotesChatCopy.known(root, null, "nota-2"),
                "un archivo inválido no reemplaza al bueno");
        NotesChatCopy.remember(root, null, "", FILE);
        expect("", NotesChatCopy.known(root, null, ""), "un id vacío no entra en el índice");
        NotesChatCopy.remember(null, null, "nota-1", FILE);
        expect("", NotesChatCopy.known(null, null, "nota-1"),
                "sin directorio el índice no falla y no inventa archivos");
        expect("Revisa la nota «Título» @companion/synced_chats/notes/"
                        + "2026-11-18-090000-otra.md",
                NotesChatCopy.reference("Título", NotesChatCopy.known(root, null, "nota-1")),
                "la referencia usa el archivo recordado");
    }
}
