/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Nucleo del cliente: guardia de inicializacion, polyfill de portapapeles,
 * acciones sobre la tarjeta de aprobacion, helpers compartidos y armado del
 * puente nativo con el nonce de pagina (P1).
 *
 * P1: el objeto `window.AndroidCompanion` es accesible tambien desde iframes.
 * El bloque Android inyecta `window.__DSH_BRIDGE_TOKEN__` en este documento y
 * exige que el JS propio lo arme con `armBridge(nonce)`. Desde 5.1.9 TODOS los
 * metodos del puente (sensibles, informativos y getters) reciben ese nonce como
 * primer argumento y solo se invocan desde el frame principal
 * (`window.top === window.self`); un iframe cross-origin no puede leer el global
 * ni el meta del padre. El APK y el puente se publican juntos en esta version,
 * asi que NO queda ninguna llamada de respaldo sin token: si no hay nonce, no se
 * llama al puente (fail-closed). El armado se intenta al arrancar, al cargar el
 * documento y, si el nonce llega tarde, en el tick del planificador unico (P53).
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
    // P1: la vibracion tambien exige el nonce; sin el, no se llama.
    callBridgeWithToken('performHaptic', [pattern]);
  }

  if (window.AndroidCompanion && typeof window.AndroidCompanion.copyToClipboard === 'function') {
    try {
      // navigator.clipboard solo existe en contexto seguro; en http:// de la LAN
      // no está. Se define con defineProperty porque el getter es de solo
      // lectura: una asignación directa fallaba en silencio y "copiar" no hacía
      // nada sin ningún aviso.
      var writeText = function(text) {
        try {
          callBridgeWithToken('copyToClipboard', [String(text != null ? text : '')]);
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
   * Arma el puente con el nonce. En 5.1.9 el APK y el puente se publican juntos,
   * asi que armBridge siempre tiene la firma con token: NO hay llamada sin
   * argumentos (fail-closed). Un retorno false explicito cuenta como fallo y se
   * reintenta; undefined cuenta como armado (JavascriptInterface antiguo).
   */
  function armBridgeOnce(token) {
    var bridge = window.AndroidCompanion;
    if (!bridge || typeof bridge.armBridge !== 'function') return false;
    if (!token) return false;
    try {
      return bridge.armBridge(token) !== false;
    } catch (e) {
      return false;
    }
  }

  // Reintentos acotados: el nonce se inyecta en onPageStarted/onPageFinished y
  // deberia estar en el primer segundo; 20 intentos (10 s) sobran y evitan
  // quedarse llamando al puente indefinidamente si algo no cuadra.
  var BRIDGE_ARM_MAX_ATTEMPTS = 20;
  var bridgeArmAttempts = 0;

  function ensureBridgeArmed() {
    if (bridgeArmed) return true;
    if (bridgeArmAttempts >= BRIDGE_ARM_MAX_ATTEMPTS) return false;
    // P1: solo el frame principal arma el puente. Un iframe no puede leer el
    // token del padre, pero si lo tuviera tampoco debe poder armar/llamar.
    if (!isTopFrame()) return false;
    if (!window.AndroidCompanion || typeof window.AndroidCompanion.armBridge !== 'function') return false;
    bridgeArmAttempts++;
    if (!armBridgeOnce(readBridgeToken())) return false;
    bridgeArmed = true;
    // Los bloques que leen getters nativos (tema, Enter, dock) se enteran ahora
    // de que el puente acepta llamadas y los releen; asi no quedan con los
    // valores por defecto si el token se inyecto despues de que corrieran.
    try { window.dispatchEvent(new Event('dsh-bridge-armed')); } catch (e) {}
    return true;
  }

  /** true solo en el frame principal: un iframe nunca invoca acciones sensibles. */
  function isTopFrame() {
    try { return window.top === window.self; } catch (e) { return false; }
  }

  /** El APK 5.1.9 expone armBridge; sin el no se llama a nada (fail-closed). */
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
   * guardian de nonce. Exige frame principal, puente armado y el nonce como
   * primer argumento; si el puente responde false se rearma UNA vez y se
   * reintenta, sin bucles. Sin nonce no se llama (fail-closed en 5.1.9).
   */
  function callBridgeSensitive(method, args) {
    var bridge = window.AndroidCompanion;
    if (!isTopFrame() || !bridge || typeof bridge[method] !== 'function') return false;
    if (!bridgeHasNonceGuard()) return false;

    var extra = Array.prototype.slice.call(args || []);
    var invoke = function(nonce) {
      try {
        return bridge[method].apply(bridge, [nonce].concat(extra)) !== false;
      } catch (e) {
        return false;
      }
    };

    var nonce = ensureBridgeArmed() ? readBridgeToken() : null;
    if (nonce && invoke(nonce)) return true;
    nonce = rearmBridgeForCall();
    return Boolean(nonce) && invoke(nonce);
  }

  /**
   * P1: invoca un metodo informativo del puente (latido, avisos, portapapeles,
   * borrador, vibracion, cancelaciones) con el nonce de pagina. Exige frame
   * principal y puente armado; sin nonce NO se llama: se prefiere no avisar
   * antes que llamar sin token (fail-closed en 5.1.9).
   *
   * No rearma en bucle como callBridgeSensitive: el latido se repite cada pocos
   * segundos y no debe reiniciar el presupuesto de intentos del armado.
   */
  function callBridgeWithToken(method, args) {
    var bridge = window.AndroidCompanion;
    if (!bridge || typeof bridge[method] !== 'function') return false;
    if (!bridgeHasNonceGuard() || !isTopFrame() || !ensureBridgeArmed()) return false;
    var nonce = readBridgeToken();
    if (!nonce) return false;
    try {
      return bridge[method].apply(bridge, [nonce].concat(Array.prototype.slice.call(args || []))) !== false;
    } catch (e) {
      return false;
    }
  }

  /**
   * P1: lee un getter nativo (tema, Enter, dock, isOnline) con el nonce. Sin
   * token no se llama al puente y se devuelve el valor por defecto: los
   * llamadores pasan null para distinguir "no se pudo leer" de un false nativo.
   */
  function callBridgeValue(method, args, fallback) {
    var bridge = window.AndroidCompanion;
    if (!bridge || typeof bridge[method] !== 'function') return fallback;
    if (!bridgeHasNonceGuard() || !isTopFrame() || !ensureBridgeArmed()) return fallback;
    var nonce = readBridgeToken();
    if (!nonce) return fallback;
    try {
      return bridge[method].apply(bridge, [nonce].concat(Array.prototype.slice.call(args || [])));
    } catch (e) {
      return fallback;
    }
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
