/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

/**
 * Observadores de la pagina: latido por mutaciones, enlaces de APK,
 * boton de cerrar vista previa, sincronia de tema y extraccion del chat.
 */
export const MOBILE_CLIENT_UI = `  var observer = new MutationObserver(debouncedCheckState);
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

    // Solo se intercepta un enlace que realmente apunte al APK. Antes bastaba
    // con que cualquier boton dijera "Abrir" o "Descargar" y que la pÃ¡gina
    // mencionara DSH-Companion.apk en algun sitio (incluido el chat) para
    // lanzar la instalacion por error.
    var apkLink = ev.target && ev.target.closest
      ? ev.target.closest('a[href*=".apk" i], [data-file*=".apk" i], [data-companion-apk]')
      : null;
    if (apkLink) {
      var href = apkLink.getAttribute('href') || '';
      ev.preventDefault();
      ev.stopPropagation();
      if (window.AndroidCompanion && window.AndroidCompanion.installUpdate) {
        window.AndroidCompanion.installUpdate();
      } else {
        window.location.href = href || '/DSH-Companion.apk';
      }
      return;
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
        if (text) lines.push(roleLabel + '\\n\\n' + text + '\\n');
      });
      return lines.join('\\n---\\n\\n');
    } catch(e) {
      return '';
    }
  };

`;
