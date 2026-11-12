/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
export const NOTIFICATION_BRIDGE_SCRIPT = `
<script id="dsh-companion-notifications">
(function() {
  if (window.__DSH_COMPANION_NOTIFICATIONS_INITIALIZED__) return;
  window.__DSH_COMPANION_NOTIFICATIONS_INITIALIZED__ = true;

  window.__DSH_COMPANION_ACTION__ = function(action, key) {
    try {
      var card = (key ? document.querySelector('[data-approval-key="' + key + '"]') : null) ||
                 document.querySelector('[data-approval-key]') ||
                 document.querySelector('.Zf6DNq_root');
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

  var lastApprovalKey = null;
  var wasGenerating = false;
  var genStartTime = 0;

  function checkState() {
    if (window.AndroidCompanion && window.AndroidCompanion.onHeartbeat) {
      window.AndroidCompanion.onHeartbeat();
    }

    var card = document.querySelector('[data-approval-key]');
    if (card) {
      var key = card.getAttribute('data-approval-key') || 'approval';
      if (key !== lastApprovalKey) {
        lastApprovalKey = key;
        var headlineEl = card.querySelector('.Zf6DNq_headline');
        var headline = headlineEl ? headlineEl.textContent.trim() : 'AprobaciÃ³n requerida';
        var detailEl = card.querySelector('.Zf6DNq_command') || card.querySelector('.Zf6DNq_description');
        var detail = detailEl ? detailEl.textContent.trim() : '';

        var match = headline.match(/(?:herramienta|tool)\\s+([A-Za-z0-9_\\-]+)/i);
        var toolName = match ? match[1] : 'Harness';

        if (window.AndroidCompanion && window.AndroidCompanion.onApprovalRequested) {
          window.AndroidCompanion.onApprovalRequested(key, toolName, headline, detail);
        }
      }
    } else if (lastApprovalKey) {
      if (window.AndroidCompanion && window.AndroidCompanion.onApprovalSettled) {
        window.AndroidCompanion.onApprovalSettled(lastApprovalKey);
      }
      lastApprovalKey = null;
    }

    var stopBtn = document.querySelector('button[aria-label*="Stop" i], button[aria-label*="Detener" i], button[data-stop-generation]');
    var isGenerating = Boolean(stopBtn);

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
            snippet = text.length > 150 ? text.substring(0, 150) + 'â€¦' : text;
          }
        }
        var docTitle = (document.title || '').replace(/^DeepSeek Harness\\s*[-Â·]?\\s*/i, '').trim();
        if (window.AndroidCompanion && window.AndroidCompanion.onGenerationFinished) {
          window.AndroidCompanion.onGenerationFinished(docTitle || 'Respuesta lista', snippet);
        }
      }
    }
    handleAutoReconnectAndDiagnostics();
  }

  var lastAutoReconnect = 0;
  function handleAutoReconnectAndDiagnostics() {
    var discBtn = document.querySelector('button[data-phase="disconnected"]') ||
                  Array.from(document.querySelectorAll('button')).find(function(b) {
                    return /desconectado|reconnect/i.test(b.textContent || '');
                  });

    if (discBtn) {
      var now = Date.now();
      if (now - lastAutoReconnect > 2000) {
        lastAutoReconnect = now;
        try { discBtn.click(); } catch(e) {}
      }
      diagnoseConnection();
    } else {
      var diagEl = document.getElementById('dsh-connection-diagnosis');
      if (diagEl) diagEl.remove();
    }
  }

  function diagnoseConnection() {
    fetch('/dsh-companion/status', { cache: 'no-store' })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!data) {
          showDiagnosis('TÃºnel desconectado: El puente no responde. Verifica la VPN.');
          return;
        }
        if (!data.dshOnline) {
          showDiagnosis('La PC responde, pero DeepSeek Harness estÃ¡ cerrado.');
          return;
        }
        showDiagnosis('Harness activo en PC. Reconectando tÃºnel WebSocket...');
      })
      .catch(function() {
        showDiagnosis('Sin conexiÃ³n con la PC. Verifica que la VPN estÃ© activa.');
      });
  }

  function showDiagnosis(msg) {
    var diagEl = document.getElementById('dsh-connection-diagnosis');
    if (!diagEl) {
      diagEl = document.createElement('div');
      diagEl.id = 'dsh-connection-diagnosis';
      diagEl.style.cssText = 'position:fixed;top:max(env(safe-area-inset-top,0px),8px);left:12px;right:12px;background:#1E1A11;border:1px solid #D97706;color:#FCD34D;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:space-between;pointer-events:none;';
      document.body.appendChild(diagEl);
    }
    diagEl.textContent = msg;
  }

  var observer = new MutationObserver(checkState);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(checkState, 2500);

  document.addEventListener('click', function(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (btn) {
      var txt = (btn.textContent || '').trim();
      var isPlus = txt === '+' || btn.getAttribute('aria-label') === 'AÃ±adir' || btn.getAttribute('aria-label') === 'Add';
      if (isPlus) {
        var active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
          active.blur();
        }
      }
    }

    var link = ev.target && ev.target.closest ? ev.target.closest('a[href*=".apk" i], [data-file*=".apk" i], a[href*="DSH-Companion" i], button') : null;
    if (link) {
      var href = link.getAttribute('href') || '';
      var text = (link.textContent || '').trim();
      if (href.includes('.apk') || href.includes('DSH-Companion') || /abrir|descargar|download/i.test(text)) {
        var container = link.closest('[class*="preview"], [class*="card"], [class*="dock"]') || document.body;
        if (href.includes('.apk') || href.includes('DSH-Companion') || (container && container.textContent.includes('DSH-Companion.apk'))) {
          ev.preventDefault();
          ev.stopPropagation();
          if (window.AndroidCompanion && window.AndroidCompanion.installUpdate) {
            window.AndroidCompanion.installUpdate();
          } else {
            window.location.href = '/DSH-Companion.apk';
          }
          return;
        }
      }
    }
  }, true);

  function checkPreviewTabs() {
    var tabs = document.querySelectorAll('[data-dockkit-tab], [class*="_dockHeader"] [role="tab"], [class*="tabBar"]');
    var existingClose = document.getElementById('dsh-close-preview-btn');
    var hasOpenPreview = false;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].offsetParent !== null) { hasOpenPreview = true; break; }
    }

    if (hasOpenPreview) {
      if (!existingClose) {
        var closeBtn = document.createElement('button');
        closeBtn.id = 'dsh-close-preview-btn';
        closeBtn.textContent = 'Cerrar vista';
        closeBtn.style.cssText = 'position:fixed;top:max(env(safe-area-inset-top,0px)+10px,12px);right:12px;background:#1E2028;border:1.5px solid #0EA5E9;color:#38BDF8;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;z-index:999999;box-shadow:0 4px 20px rgba(0,0,0,0.6);cursor:pointer;';
        closeBtn.onclick = function() {
          var tabCloses = document.querySelectorAll('button[aria-label*="close" i], button[aria-label*="cerrar" i], [class*="tabClose"], [class*="CloseButton"]');
          tabCloses.forEach(function(c) { try { c.click(); } catch(e){} });
          closeBtn.remove();
        };
        document.body.appendChild(closeBtn);
      }
    } else if (existingClose) {
      existingClose.remove();
    }
  }

  window.__DSH_SET_THEME__ = function(themeMode, isDarkExplicit) {
    try {
      var dark;
      if (typeof isDarkExplicit === 'boolean') {
        dark = isDarkExplicit;
      } else if (themeMode === 'light') {
        dark = false;
      } else if (themeMode === 'dark') {
        dark = true;
      } else if (window.AndroidCompanion && typeof window.AndroidCompanion.isDark === 'function') {
        try { dark = window.AndroidCompanion.isDark(); } catch(e) { dark = false; }
      } else {
        dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      window.__DSH_CURRENT_THEME_DARK__ = dark;
      var scheme = dark ? 'dark' : 'light';

      var root = document.documentElement;
      if (root) {
        root.style.colorScheme = scheme;
        root.setAttribute('data-ds-theme-source', themeMode || scheme);
        root.setAttribute('data-theme', scheme);
        if (dark) {
          root.classList.remove('light');
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
          root.classList.add('light');
        }
      }

      var body = document.body;
      if (body) {
        if (dark) {
          body.setAttribute('data-ds-dark-theme', '');
          body.classList.remove('light');
          body.classList.add('dark');
        } else {
          body.removeAttribute('data-ds-dark-theme');
          body.classList.remove('dark');
          body.classList.add('light');
        }
      }
    } catch(e) {}
  };

  try {
    var themeObserver = new MutationObserver(function() {
      if (typeof window.__DSH_CURRENT_THEME_DARK__ === 'boolean' && document.body) {
        var shouldBeDark = window.__DSH_CURRENT_THEME_DARK__;
        var hasDark = document.body.hasAttribute('data-ds-dark-theme');
        if (shouldBeDark && !hasDark) {
          document.body.setAttribute('data-ds-dark-theme', '');
        } else if (!shouldBeDark && hasDark) {
          document.body.removeAttribute('data-ds-dark-theme');
        }
      }
    });

    var attachThemeObserver = function() {
      if (document.body) {
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        if (window.AndroidCompanion && typeof window.AndroidCompanion.getThemeMode === 'function') {
          try {
            window.__DSH_SET_THEME__(window.AndroidCompanion.getThemeMode(), window.AndroidCompanion.isDark());
          } catch(e) {}
        }
      } else {
        document.addEventListener('DOMContentLoaded', attachThemeObserver);
      }
    };
    attachThemeObserver();
  } catch(e) {}

  window.__DSH_EXTRACT_CHAT_TEXT__ = function() {
    try {
      var messages = Array.from(document.querySelectorAll('[data-role], [data-message-role], article, .message'));
      if (messages.length === 0) return '';
      var lines = [];
      messages.forEach(function(msg) {
        var role = msg.getAttribute('data-role') || msg.getAttribute('data-message-role') || (msg.classList.contains('user') ? 'user' : 'assistant');
        var roleLabel = /user/i.test(role) ? '### Usuario:' : '### Asistente:';
        var text = (msg.innerText || msg.textContent || '').trim();
        if (text) lines.push(roleLabel + '\n\n' + text + '\n');
      });
      return lines.join('\n---\n\n');
    } catch(e) {
      return '';
    }
  };

  window.__DSH_INSERT_INTO_COMPOSER__ = function(text) {
    try {
      var textarea = document.querySelector('textarea, [contenteditable="true"]');
      if (!textarea) return false;
      if (textarea.tagName === 'TEXTAREA') {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.focus();
        return true;
      } else {
        textarea.innerText = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        return true;
      }
    } catch(e) {
      return false;
    }
  };

  // Control de comportamiento de tecla Enter (â†µ): Salto de lÃ­nea vs Enviar mensaje
  window.__DSH_ENTER_NEWLINE__ = true;
  if (window.AndroidCompanion && typeof window.AndroidCompanion.isEnterNewlineEnabled === 'function') {
    try {
      window.__DSH_ENTER_NEWLINE__ = Boolean(window.AndroidCompanion.isEnterNewlineEnabled());
    } catch(e) {}
  }

  window.__DSH_SET_ENTER_BEHAVIOR__ = function(isNewline) {
    window.__DSH_ENTER_NEWLINE__ = Boolean(isNewline);
  };

  function isComposerTarget(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT' && el.type !== 'textarea') return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) return true;
    if (el.closest && (el.closest('[contenteditable="true"]') || el.closest('textarea') || el.closest('[class*="composer"]') || el.closest('form:has(textarea)'))) return true;
    return false;
  }

  // Interceptar tecla Enter en fase de captura para convertirla en salto de lÃ­nea si estÃ¡ activado
  window.addEventListener('keydown', function(event) {
    if (!window.__DSH_ENTER_NEWLINE__) return;
    if (event.key === 'Enter' || event.keyCode === 13) {
      if (isComposerTarget(event.target)) {
        // Permitir envÃ­o explÃ­cito con Ctrl+Enter o Cmd+Enter si hay teclado fÃ­sico
        if (event.ctrlKey || event.metaKey) return;

        // Si ya trae shiftKey, dejar pasar normalmente
        if (event.shiftKey) return;

        // Redefinir shiftKey a true en el evento para que Lexical y el textarea traten Enter como Shift+Enter:
        // Lexical ejecuta INSERT_LINE_BREAK_COMMAND y NO ejecuta handlers.submit()
        try {
          Object.defineProperty(event, 'shiftKey', {
            get: function() { return true; },
            configurable: true
          });
        } catch(e) {}
      }
    }
  }, true);

  setInterval(checkPreviewTabs, 1000);
})();
</script>
`;
