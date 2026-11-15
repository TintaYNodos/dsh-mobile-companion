/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

/**
 * Nucleo del cliente: guardia de inicializacion, polyfill de portapapeles,
 * acciones sobre la tarjeta de aprobacion, helpers compartidos y armado del
 * puente nativo con el nonce de pagina (P1).
 *
 * P1: el objeto `window.AndroidCompanion` es accesible tambien desde iframes.
 * El bloque Android inyecta `window.__DSH_BRIDGE_TOKEN__` en este documento y
 * exige que el JS propio lo arme con `armBridge(nonce)`; ademas los metodos
 * sensibles (`installUpdate`, `confirmCriticalApproval`, `startSatelliteQuery`)
 * reciben ese nonce como primer argumento y solo se invocan desde el frame
 * principal (`window.top === window.self`). Un iframe cross-origin no puede leer
 * el global ni el meta del padre. El armado se intenta al arrancar, al cargar el
 * documento y, si el nonce llega tarde, en el tick del planificador unico (P53).
 * Todo va con `typeof` para que un APK antiguo sin `armBridge` siga funcionando
 * exactamente igual.
 */
export const MOBILE_CLIENT_CORE = `  if (window.__DSH_COMPANION_NOTIFICATIONS_INITIALIZED__) return;
  window.__DSH_COMPANION_NOTIFICATIONS_INITIALIZED__ = true;

  // Helpers compartidos por los bloques del cliente. Varios estaban repetidos y
  // una de las copias se quedo atras al corregir la otra; ahora hay una sola
  // version y todos los bloques llaman aqui.
  var APPROVAL_CARD_FALLBACK_SELECTORS = [
    '[data-approval-key]',
    '[class*="approvalCard"], [class*="approval_card"], [class*="_approval_"]',
    '[data-card="approval"]'
  ];

  function findApprovalCard(key) {
    var exact = key ? document.querySelector('[data-approval-key="' + key + '"]') : null;
    if (exact) return exact;
    for (var i = 0; i < APPROVAL_CARD_FALLBACK_SELECTORS.length; i++) {
      var card = document.querySelector(APPROVAL_CARD_FALLBACK_SELECTORS[i]);
      if (card) return card;
    }
    return null;
  }

  function cleanDocTitle() {
    return (document.title || '').replace(/^DeepSeek Harness\\s*[-·]?\\s*/i, '').trim();
  }

  function preventFocusLoss(button) {
    button.addEventListener('pointerdown', function(e) { e.preventDefault(); });
    button.addEventListener('mousedown', function(e) { e.preventDefault(); });
  }

  function haptic(pattern) {
    if (window.AndroidCompanion && typeof window.AndroidCompanion.performHaptic === 'function') {
      try { window.AndroidCompanion.performHaptic(pattern); } catch(e) {}
    }
  }

  if (window.AndroidCompanion && typeof window.AndroidCompanion.copyToClipboard === 'function') {
    try {
      // navigator.clipboard solo existe en contexto seguro; en http:// de la LAN
      // no está. Se define con defineProperty porque el getter es de solo
      // lectura: una asignación directa fallaba en silencio y "copiar" no hacía
      // nada sin ningún aviso.
      var writeText = function(text) {
        try {
          window.AndroidCompanion.copyToClipboard(String(text != null ? text : ''));
        } catch (err) {
          console.error('[companion-clipboard] Error al copiar:', err);
        }
        return Promise.resolve();
      };
      if (!navigator.clipboard) {
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: writeText },
          configurable: true,
          writable: true
        });
      } else if (typeof navigator.clipboard.writeText !== 'function') {
        navigator.clipboard.writeText = writeText;
      }
    } catch (e) {
      console.error('[companion-clipboard] Error configurando polyfill de portapapeles:', e);
    }
  }

  window.__DSH_COMPANION_ACTION__ = function(action, key) {
    try {
      var card = findApprovalCard(key);
      if (!card) return false;

      var buttons = Array.from(card.querySelectorAll('button'));
      if (action === 'allow' || action === 'approve') {
        var allowBtn = card.querySelector('button[class*="primary"]') ||
                       buttons.find(function(b) { return /permitir|allow|aceptar/i.test(b.textContent || ''); });
        if (allowBtn) { allowBtn.click(); return true; }
      } else if (action === 'reject') {
        var rejectBtn = card.querySelector('button[class*="reject"]') ||
                        buttons.find(function(b) { return /rechazar|reject/i.test(b.textContent || ''); });
        if (rejectBtn) { rejectBtn.click(); return true; }
      }
    } catch (e) {
      console.error('[companion-notification] Error:', e);
    }
    return false;
  };

  /**
   * P1: armado del puente con el nonce de pagina.
   *
   * El nonce viaja en window.__DSH_BRIDGE_TOKEN__ (lo inyecta WebBridge) o, como
   * respaldo, en un meta[name="dsh-bridge-token"]. A proposito NO se pregunta al
   * puente por el token: getBridgeToken existe en todos los frames y un iframe
   * cross-origin podria pedirlo, que es justo lo que el guardian evita.
   */
  var bridgeArmed = false;

  function readBridgeToken() {
    try {
      var token = window.__DSH_BRIDGE_TOKEN__;
      if (typeof token === 'string' && token.trim()) return token;
      var meta = document.querySelector('meta[name="dsh-bridge-token"], meta[name="__DSH_BRIDGE_TOKEN__"]');
      if (meta) {
        var content = meta.getAttribute('content');
        if (content && content.trim()) return content;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Llama a armBridge con la firma que exista: primero con el nonce y, si esa
   * firma no existe (JavascriptInterface lanza cuando no hay metodo con esa
   * aridad), sin argumentos, por si el nativo lee el nonce de su propio WebView.
   * Un retorno false explicito cuenta como fallo y se reintenta; void (undefined)
   * cuenta como armado. Sin nonce no se llama: BridgeGuard registra cada rechazo
   * y no tiene sentido ensuciar el log antes de que WebBridge inyecte el global.
   */
  function armBridgeOnce(token) {
    var bridge = window.AndroidCompanion;
    if (!bridge || typeof bridge.armBridge !== 'function') return false;
    if (!token) return false;
    try {
      if (bridge.armBridge(token) !== false) return true;
    } catch (errWithToken) {}
    try {
      if (bridge.armBridge() !== false) return true;
    } catch (errNoArgs) {}
    return false;
  }

  // Reintentos acotados: el nonce se inyecta en onPageStarted/onPageFinished y
  // deberia estar en el primer segundo; 20 intentos (10 s) sobran y evitan
  // quedarse llamando al puente indefinidamente si algo no cuadra.
  var BRIDGE_ARM_MAX_ATTEMPTS = 20;
  var bridgeArmAttempts = 0;

  function ensureBridgeArmed() {
    if (bridgeArmed) return true;
    if (bridgeArmAttempts >= BRIDGE_ARM_MAX_ATTEMPTS) return false;
    if (!window.AndroidCompanion || typeof window.AndroidCompanion.armBridge !== 'function') return false;
    bridgeArmAttempts++;
    if (!armBridgeOnce(readBridgeToken())) return false;
    bridgeArmed = true;
    return true;
  }

  /** true solo en el frame principal: un iframe nunca invoca acciones sensibles. */
  function isTopFrame() {
    try { return window.top === window.self; } catch (e) { return false; }
  }

  /**
   * El APK con guardian se reconoce porque expone armBridge. Con un APK
   * anterior no hay nonce ni firma nueva: se conserva la llamada de siempre para
   * que el cliente siga funcionando al mezclar APK viejo con puente actualizado.
   */
  function bridgeHasNonceGuard() {
    return Boolean(window.AndroidCompanion && typeof window.AndroidCompanion.armBridge === 'function');
  }

  // Reintento acotado: se rearma una vez y se devuelve el nonce vigente.
  function rearmBridgeForCall() {
    bridgeArmed = false;
    bridgeArmAttempts = 0;
    return ensureBridgeArmed() ? readBridgeToken() : null;
  }

  /**
   * P1: invoca un metodo sensible del puente (installUpdate y compania) con el
   * guardián de nonce. Requiere frame principal, armado y el nonce como primer
   * argumento; si el puente responde false se rearma UNA vez y se reintenta, sin
   * bucles. Con APK antiguo (sin armBridge) se llama con la firma de siempre.
   * Devuelve true si el puente acepto la accion.
   */
  function callBridgeSensitive(method, args) {
    var bridge = window.AndroidCompanion;
    if (!isTopFrame() || !bridge || typeof bridge[method] !== 'function') return false;

    var extra = Array.prototype.slice.call(args || []);
    var invoke = function(nonce) {
      try {
        var callArgs = nonce ? [nonce].concat(extra) : extra;
        return bridge[method].apply(bridge, callArgs) !== false;
      } catch (e) {
        return false;
      }
    };

    if (!bridgeHasNonceGuard()) return invoke(null);

    var nonce = ensureBridgeArmed() ? readBridgeToken() : null;
    if (nonce && invoke(nonce)) return true;
    nonce = rearmBridgeForCall();
    return Boolean(nonce) && invoke(nonce);
  }

  // Intento inmediato (si WebBridge ya dejo el nonce antes de este script) y
  // reintentos enganchados a la carga y al volver del segundo plano. Si el nonce
  // aparece mas tarde, el planificador unico (P53) lo reintenta cada 500 ms.
  ensureBridgeArmed();
  window.addEventListener('load', ensureBridgeArmed);
  document.addEventListener('DOMContentLoaded', ensureBridgeArmed);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') ensureBridgeArmed();
  });
  // Por si el nativo prefiere avisar en caliente despues de inyectar el nonce.
  window.addEventListener('dsh-bridge-token', ensureBridgeArmed);
  window.addEventListener('dsh-bridge-armed', ensureBridgeArmed);
  // Enganche para pruebas y para el propio WebBridge si necesita forzarlo.
  window.__DSH_ARM_BRIDGE__ = ensureBridgeArmed;

`;
