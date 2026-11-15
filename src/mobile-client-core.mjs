/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

/**
 * Nucleo del cliente: guardia de inicializacion, polyfill de portapapeles,
 * acciones sobre la tarjeta de aprobacion y helpers compartidos.
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
    return (document.title || '').replace(/^DeepSeek Harness\\s*[-Â·]?\\s*/i, '').trim();
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
      // no estÃ¡. Se define con defineProperty porque el getter es de solo
      // lectura: una asignaciÃ³n directa fallaba en silencio y "copiar" no hacÃ­a
      // nada sin ningÃºn aviso.
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

`;
