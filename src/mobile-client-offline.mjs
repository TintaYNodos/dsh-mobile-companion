/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

/**
 * Copia del chat para el modo sin conexion, eventos de visibilidad y los
 * temporizadores periodicos del cliente.
 */
export const MOBILE_CLIENT_OFFLINE = `  /**
   * Copia de respaldo para el modo sin conexiÃ³n (offline.html la lee).
   *
   * Antes se hacia cada 10 s con el chat completo: escritura periodica en
   * localStorage de una conversacion entera. Ahora solo se guarda cuando la
   * pagina se oculta o se cierra, y con un tope de tamano.
   */
  var OFFLINE_COPY_LIMIT = 20000;

  function cacheLastChat() {
    try {
      var text = window.__DSH_EXTRACT_CHAT_TEXT__();
      if (!text || text.length <= 30) return;
      if (text.length > OFFLINE_COPY_LIMIT) text = text.slice(-OFFLINE_COPY_LIMIT);
      var title = cleanDocTitle() || 'Conversacion reciente';
      localStorage.setItem('dsh_last_synced_chat', JSON.stringify({
        title: title,
        text: text,
        updatedAt: new Date().toISOString()
      }));
    } catch(e) {}
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') cacheLastChat();
  });
  window.addEventListener('pagehide', cacheLastChat);

  // La visibilidad se reevalua al enfocar, al redimensionar (teclado) y en un
  // latido lento por si el WebView no emite ninguno de los dos eventos.
  document.addEventListener('focusin', updateComposerDockVisibility, true);
  document.addEventListener('focusout', function() {
    setTimeout(updateComposerDockVisibility, 60);
  }, true);
  window.addEventListener('resize', updateComposerDockVisibility);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', updateComposerDockVisibility);
  }

  setInterval(checkPreviewTabs, 1000);
  setInterval(ensureComposerDock, 1500);
  setInterval(updateComposerDockVisibility, 600);
`;
