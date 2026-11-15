/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Latido, estado de aprobaciones y generacion, reconexion automatica y
 * diagnostico de conexion del puente.
 */
export const MOBILE_CLIENT_DIAGNOSTICS = `  var lastApprovalKey = null;
  var wasGenerating = false;
  var genStartTime = 0;

  function checkState() {
    // P1: el latido exige el nonce de pagina (callBridgeWithToken solo llama
    // desde el frame principal y con el puente armado).
    callBridgeWithToken('onHeartbeat', []);

    var card = findApprovalCard();
    if (card) {
      var key = card.getAttribute('data-approval-key') || 'approval';
      if (key !== lastApprovalKey) {
        var headlineEl = card.querySelector('[class*="headline"], h2, h3, header') || card.querySelector('[data-card="approval"] [class*="headline"]');
        var headline = headlineEl ? headlineEl.textContent.trim() : 'Aprobación requerida';
        var detailEl = card.querySelector('[class*="command"], [class*="description"], code, pre') || card.querySelector('[class*="command"]') || card.querySelector('[class*="description"]');
        var detail = detailEl ? detailEl.textContent.trim() : '';

        var match = headline.match(/(?:herramienta|tool)\\s+([A-Za-z0-9_\\-]+)/i);
        var toolName = match ? match[1] : 'Harness';

        // P1: el aviso de aprobacion tambien exige el nonce de la pagina. Solo
        // se marca como avisada si el puente lo acepto; si el nonce aun no esta
        // (o el APK lo rechazo) se reintenta en el siguiente tick.
        if (callBridgeWithToken('onApprovalRequested', [key, toolName, headline, detail])) {
          lastApprovalKey = key;
        }
      }
    } else if (lastApprovalKey) {
      if (window.AndroidCompanion && window.AndroidCompanion.onApprovalSettled) {
        window.AndroidCompanion.onApprovalSettled(lastApprovalKey);
      }
      lastApprovalKey = null;
    }

    var stopBtn = document.querySelector([
      'button[aria-label*="Stop" i]',
      'button[aria-label*="Detener" i]',
      'button[aria-label*="Cancel" i]',
      'button[data-stop-generation]',
      'button.stop',
      '.stop-button',
      '[data-state="generating"]'
    ].join(', '));
    var titleHasGenerating = /generando|generating/i.test(document.title || '');
    var isGenerating = Boolean(stopBtn || titleHasGenerating);

    if (isGenerating !== wasGenerating) {
      if (window.AndroidCompanion && window.AndroidCompanion.onGenerationStateChanged) {
        window.AndroidCompanion.onGenerationStateChanged(isGenerating);
      }
    }

    if (isGenerating && !wasGenerating) {
      wasGenerating = true;
      genStartTime = Date.now();
    } else if (!isGenerating && wasGenerating) {
      wasGenerating = false;
      var duration = Date.now() - genStartTime;
      if (duration > 1500) {
        var messages = document.querySelectorAll('[data-role="assistant"], [data-message-role="assistant"], article, .message');
        var snippet = 'El modelo ha finalizado la respuesta.';
        if (messages.length > 0) {
          var lastMsg = messages[messages.length - 1];
          var text = (lastMsg.textContent || '').trim();
          if (text) {
            snippet = text.length > 150 ? text.substring(0, 150) + '…' : text;
          }
        }
        var docTitle = cleanDocTitle();
        // P1: el aviso de "respuesta lista" tambien exige el nonce de pagina.
        callBridgeWithToken('onGenerationFinished', [docTitle || 'Respuesta lista', snippet]);
      }
    }
    handleAutoReconnectAndDiagnostics();
  }

  var lastAutoReconnect = 0;
  var autoReconnectAttempts = 0;
  function handleAutoReconnectAndDiagnostics() {
    // Solo el boton de estado propio de DSH, nunca "cualquier boton cuyo texto
    // diga desconectado": eso pulsaba controles ajenos en Ajustes y en bucles.
    var discBtn = document.querySelector('button[data-phase="disconnected"]');

    if (discBtn) {
      var now = Date.now();
      if (now - lastAutoReconnect > 4000 && autoReconnectAttempts < 5) {
        lastAutoReconnect = now;
        autoReconnectAttempts++;
        try { discBtn.click(); } catch(e) {}
      }
      diagnoseConnection();
    } else {
      // Al reconectar se reinicia el presupuesto de intentos.
      autoReconnectAttempts = 0;
      var diagEl = document.getElementById('dsh-connection-diagnosis');
      if (diagEl) diagEl.remove();
    }
  }

  function diagnoseConnection() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showDiagnosis('Sin conexion a internet en el celular.', 'error');
      return;
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { controller.abort(); }, 3500) : null;

    fetch('/dsh-companion/status', { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function(r) {
        if (timeoutId) clearTimeout(timeoutId);
        return r.ok ? r.json() : null;
      })
      .then(function(data) {
        if (!data) {
          showDiagnosis('El puente no responde. Revisa que la computadora este encendida y en la VPN.', 'warning');
          return;
        }
        if (!data.dshOnline) {
          showDiagnosis('DeepSeek Harness no esta abierto en Windows. Inicia la aplicacion en la PC.', 'warning');
          return;
        }
        showDiagnosis('Harness activo en PC. Reconectando tunel privado...', 'info');
      })
      .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        var isAbort = err && (err.name === 'AbortError' || /timeout/i.test(err.message || ''));
        if (isAbort) {
          showDiagnosis('Computadora no responde en la IP privada. Revisa la conexion VPN de la PC.', 'error');
        } else {
          showDiagnosis('Red privada inactiva en el telefono. Abre ZeroTier o Tailscale y verifica la conexion.', 'error');
        }
      });
  }

  function showDiagnosis(msg, level) {
    var diagEl = document.getElementById('dsh-connection-diagnosis');
    if (!diagEl) {
      diagEl = document.createElement('div');
      diagEl.id = 'dsh-connection-diagnosis';
      diagEl.style.cssText = 'position:fixed;top:max(env(safe-area-inset-top,0px),8px);left:12px;right:12px;padding:9px 14px;border-radius:10px;font-size:12px;font-weight:600;letter-spacing:0.02em;z-index:99999;box-shadow:0 4px 18px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:space-between;pointer-events:none;transition:background 0.2s,border-color 0.2s;';
      document.body.appendChild(diagEl);
    }
    if (level === 'error') {
      diagEl.style.background = '#2A1215';
      diagEl.style.border = '1px solid #E11D48';
      diagEl.style.color = '#FDA4AF';
    } else if (level === 'warning') {
      diagEl.style.background = '#1E1A11';
      diagEl.style.border = '1px solid #D97706';
      diagEl.style.color = '#FCD34D';
    } else {
      diagEl.style.background = '#0F172A';
      diagEl.style.border = '1px solid #0284C7';
      diagEl.style.color = '#7DD3FC';
    }
    diagEl.textContent = msg;
  }

  var checkStateTimer = null;
  function debouncedCheckState() {
    if (checkStateTimer) return;
    checkStateTimer = setTimeout(function() {
      checkStateTimer = null;
      checkState();
    }, 120);
  }

`;
