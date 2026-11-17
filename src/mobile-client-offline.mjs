/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Copia del chat para el modo sin conexion, interruptor de privacidad de esa
 * copia, eventos de visibilidad y planificador periodico unico del cliente.
 *
 * P54: la copia del chat en localStorage (clave `dsh_last_synced_chat`) se
 * hacia sin avisar. Este modulo expone en el propio cliente la funcion
 * `window.__DSH_SET_OFFLINE_COPY__(boolean)`: el lado nativo (Ajustes) o una
 * prueba puede apagarla o volver a encenderla en caliente, sin recargar. Por
 * defecto sigue ACTIVA para no romper el lector offline (offline.html lee esa
 * clave). Apagarla borra la copia ya guardada porque es una medida de
 * privacidad: desactivarla no debe seguir reteniendo el chat en el telefono.
 * Volver a activarla regenera la copia en el siguiente visibilitychange/pagehide.
 *
 * P56: ademas de localStorage, con el interruptor activo se manda la misma copia
 * ({title, text, updatedAt}) al lector NATIVO por el puente con nonce
 * (`saveOfflineChat`, mismo guardian que `saveOfflineDraft`). El nativo la cifra
 * con el AndroidKeyStore y la guarda en el almacenamiento privado de la app, de
 * modo que se puede leer con la PC apagada y sin red. Sin interruptor no se
 * envia NADA al puente; el nativo ademas rechaza la copia como segundo candado.
 */
export const MOBILE_CLIENT_OFFLINE = `  /**
   * Interruptor de la copia sin conexion (P54).
   *
   * window.__DSH_SET_OFFLINE_COPY__(boolean) lo cambia en caliente; lo llaman
   * MainActivity/WebBridge al aplicar Ajustes y las pruebas. Devuelve el estado
   * resultante. Por defecto sigue en true: el lector offline funciona igual que
   * antes sin que nadie toque nada.
   */
  var offlineCopyEnabled = true;

  window.__DSH_SET_OFFLINE_COPY__ = function(enabled) {
    offlineCopyEnabled = Boolean(enabled);
    if (!offlineCopyEnabled) {
      // Apagar la copia es una decision de privacidad: se borra lo ya guardado
      // para que offline.html no muestre una conversacion que el usuario cree
      // eliminada. Si se vuelve a activar, se rehace al ocultar o cerrar. El
      // lado nativo borra ademas su copia cifrada al aplicar la preferencia
      // (WebBridge/SettingsScreen, P56).
      try { localStorage.removeItem('dsh_last_synced_chat'); } catch (e) {}
    }
    return offlineCopyEnabled;
  };

  /**
   * Copia de respaldo para el modo sin conexion (offline.html la lee).
   *
   * Antes se hacia cada 10 s con el chat completo: escritura periodica en
   * localStorage de una conversacion entera. Ahora solo se guarda cuando la
   * pagina se oculta o se cierra, y con un tope de tamano.
   *
   * Respeta __DSH_SET_OFFLINE_COPY__ (P54): con la copia desactivada no escribe
   * nada ni toca localStorage.
   */
  var OFFLINE_COPY_LIMIT = 20000;
  var OFFLINE_COPY_MIN = 30;

  /**
   * P56: manda la copia al lector nativo cifrado, con el nonce de pagina.
   *
   * Usa callBridgeWithToken (core): exige frame principal, puente armado y
   * nonce, y sin token NO llama al puente (fail-closed). Si el APK no trae
   * saveOfflineChat devuelve false y no pasa nada: localStorage sigue siendo
   * la copia de respaldo del lector web. Nunca se llama con el interruptor
   * apagado.
   */
  function sendOfflineChatToNative(title, text, updatedAt) {
    if (!offlineCopyEnabled) return false;
    return Boolean(callBridgeWithToken('saveOfflineChat', [title, text, updatedAt]));
  }

  function cacheLastChat() {
    if (!offlineCopyEnabled) return;
    try {
      var text = window.__DSH_EXTRACT_CHAT_TEXT__();
      if (!text || text.length <= OFFLINE_COPY_MIN) return;
      if (text.length > OFFLINE_COPY_LIMIT) text = text.slice(-OFFLINE_COPY_LIMIT);
      var title = cleanDocTitle() || 'Conversacion reciente';
      var updatedAt = new Date().toISOString();
      localStorage.setItem('dsh_last_synced_chat', JSON.stringify({
        title: title,
        text: text,
        updatedAt: updatedAt
      }));
      // P56: la copia cifrada del telefono, para leerla sin PC ni red.
      sendOfflineChatToNative(title, text, updatedAt);
    } catch(e) {}
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') cacheLastChat();
  });
  window.addEventListener('pagehide', cacheLastChat);

  // La visibilidad se reevalua al enfocar, al redimensionar (teclado) y en el
  // tick del planificador, por si el WebView no emite ninguno de los dos eventos.
  document.addEventListener('focusin', updateComposerDockVisibility, true);
  document.addEventListener('focusout', function() {
    setTimeout(updateComposerDockVisibility, 60);
  }, true);
  window.addEventListener('resize', updateComposerDockVisibility);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', updateComposerDockVisibility);
  }

  /**
   * P53: un unico planificador periodico.
   *
   * Antes habia cuatro temporizadores independientes y solapados (600 ms para
   * el dock, 1000 ms para la vista previa, 1500 ms para crear el dock y 2500 ms
   * para el estado). Con la pagina en segundo plano el WebView los acumulaba y
   * al volver se ejecutaban en rafaga. Ahora hay UN solo temporizador de 500 ms
   * (2 Hz), que es la frecuencia mas baja que aun cubre a la tarea mas rapida
   * (la visibilidad del dock, antes cada 600 ms); las demas se reparten por su
   * propio intervalo dentro del mismo tick. El comportamiento observable es el
   * de siempre (o un poco mas fino en el dock) y se elimina el solapamiento.
   *
   * No se anade ningun otro temporizador periodico al cliente: los reintentos de
   * armado del puente (P1) y las demas tareas viajan en este mismo tick.
   */
  var SCHEDULER_TICK_MS = 500;
  var schedulerStartedAt = Date.now();

  var SCHEDULED_TASKS = [
    // La mas sensible: mira el teclado y la posicion del compositor. Antes 600.
    { name: 'dock-visibility', every: 500, lastRun: schedulerStartedAt, run: updateComposerDockVisibility },
    // Boton flotante de cerrar la vista previa. Antes 1000.
    { name: 'preview-tabs', every: 1000, lastRun: schedulerStartedAt, run: checkPreviewTabs },
    // Creacion y reparacion del dock. Antes 1500.
    { name: 'ensure-dock', every: 1500, lastRun: schedulerStartedAt, run: ensureComposerDock },
    // Latido, aprobaciones, generacion y reconexion. Antes 2500.
    { name: 'check-state', every: 2500, lastRun: schedulerStartedAt, run: checkState },
    // P1: reintento de armado del puente con el nonce de pagina mientras falte
    // (no crea otro temporizador). Si el APK no trae armBridge, retorna al
    // instante por el typeof de ensureBridgeArmed.
    { name: 'arm-bridge', every: 500, lastRun: schedulerStartedAt, run: ensureBridgeArmed }
  ];

  function runScheduledTasks() {
    var now = Date.now();
    for (var i = 0; i < SCHEDULED_TASKS.length; i++) {
      var task = SCHEDULED_TASKS[i];
      if (now - task.lastRun < task.every) continue;
      task.lastRun = now;
      try {
        task.run();
      } catch (e) {
        console.error('[companion] Error en tarea programada ' + task.name + ':', e);
      }
    }
  }

  setInterval(runScheduledTasks, SCHEDULER_TICK_MS);
`;
