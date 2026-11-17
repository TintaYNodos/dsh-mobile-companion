/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.widget.Button;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * H-03: un solo envío de notas a la PC a la vez.
 *
 * Las tres rutas de la pantalla de Notas (el «Enviar» de cada tarjeta, «Enviar
 * todas a la PC» y el «Enviar» del editor) acaban en {@link NotesSync}: sin un
 * candado, dos toques seguidos lanzaban dos hilos y la nota se duplicaba en la
 * PC. El candado se toma antes de crear el hilo y se suelta SIEMPRE al terminar
 * (éxito, fallo o excepción del hilo), no en el `finally` de la petición.
 *
 * Mientras dura el envío los botones registrados se deshabilitan; al soltar el
 * candado se restauran a su estado anterior (un botón que ya estaba
 * deshabilitado, como el de una nota «solo en el teléfono», sigue así). Todo se
 * ejecuta en el hilo principal: los toques vienen de la vista y {@link #release()}
 * se postea al principal desde el hilo de trabajo.
 */
final class NotesSendGuard {

    private static final AtomicBoolean IN_FLIGHT = new AtomicBoolean(false);
    private static final List<WeakReference<Button>> BUTTONS = new ArrayList<>();
    private static final Map<Button, Boolean> PREVIOUS_ENABLED = new HashMap<>();

    private NotesSendGuard() {
    }

    /** Registra un botón que se deshabilita mientras hay un envío en vuelo. */
    static void watch(Button button) {
        if (button == null) return;
        synchronized (BUTTONS) {
            for (Iterator<WeakReference<Button>> it = BUTTONS.iterator(); it.hasNext(); ) {
                Button watched = it.next().get();
                if (watched == null) {
                    it.remove();
                } else if (watched == button) {
                    return;
                }
            }
            BUTTONS.add(new WeakReference<>(button));
        }
    }

    /** Toma el candado. false si ya había un envío en curso (no se relanza). */
    static boolean acquire() {
        if (!IN_FLIGHT.compareAndSet(false, true)) return false;
        synchronized (BUTTONS) {
            PREVIOUS_ENABLED.clear();
            for (WeakReference<Button> reference : BUTTONS) {
                Button button = reference.get();
                if (button == null) continue;
                PREVIOUS_ENABLED.put(button, button.isEnabled());
                button.setEnabled(false);
                button.setAlpha(0.5f);
            }
        }
        return true;
    }

    /** Suelta el candado y restaura los botones. Se llama en el hilo principal. */
    static void release() {
        IN_FLIGHT.set(false);
        synchronized (BUTTONS) {
            for (Map.Entry<Button, Boolean> entry : PREVIOUS_ENABLED.entrySet()) {
                Button button = entry.getKey();
                Boolean enabled = entry.getValue();
                if (button == null) continue;
                boolean restore = enabled != null && enabled;
                button.setEnabled(restore);
                button.setAlpha(restore ? 1f : 0.5f);
            }
            PREVIOUS_ENABLED.clear();
        }
    }
}
