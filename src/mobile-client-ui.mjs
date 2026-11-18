/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Observadores de la pagina: latido por mutaciones, enlaces de APK,
 * boton de cerrar vista previa, sincronia de tema y extraccion del chat.
 */
export const MOBILE_CLIENT_UI = `  // El latido periodico de checkState ya no tiene temporizador propio: el
  // planificador unico (P53, en mobile-client-offline.mjs) lo ejecuta cada
  // 2500 ms. Aqui quedan solo las reacciones inmediatas a mutaciones del DOM.
  var observer = new MutationObserver(debouncedCheckState);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  document.addEventListener('click', function(ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (btn) {
      var txt = (btn.textContent || '').trim();
      var isPlus = txt === '+' || btn.getAttribute('aria-label') === 'Añadir' || btn.getAttribute('aria-label') === 'Add';
      if (isPlus) {
        var active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
          active.blur();
        }
      }
    }

    // Solo se intercepta un enlace que realmente apunte al APK. Antes bastaba
    // con que cualquier boton dijera "Abrir" o "Descargar" y que la página
    // mencionara DSH-Companion.apk en algun sitio (incluido el chat) para
    // lanzar la instalacion por error.
    var apkLink = ev.target && ev.target.closest
      ? ev.target.closest('a[href*=".apk" i], [data-file*=".apk" i], [data-companion-apk]')
      : null;
    if (apkLink) {
      var href = apkLink.getAttribute('href') || '';
      ev.preventDefault();
      ev.stopPropagation();
      // P1: installUpdate recibe el nonce de pagina en el APK con guardián. Solo
      // el frame principal lo invoca (un iframe no puede leer el nonce del
      // padre); en un iframe se deja la navegacion normal del enlace.
      if (!isTopFrame()) {
        window.location.href = href || '/DSH-Companion.apk';
        return;
      }
      // Si el puente rechaza la accion (nonce caducado, origen no valido...), se
      // rearma una vez dentro de callBridgeSensitive y, si aun asi falla, se
      // avisa en pantalla en vez de fingir que empezo la instalacion.
      if (window.AndroidCompanion && typeof window.AndroidCompanion.installUpdate === 'function') {
        if (callBridgeSensitive('installUpdate', [])) return;
        haptic('reject');
        try {
          showDiagnosis('No se pudo autorizar la actualizacion. Recarga la app e intentalo de nuevo.', 'warning');
        } catch (e) {}
        return;
      }
      window.location.href = href || '/DSH-Companion.apk';
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
        // P1: los getters exigen el nonce; sin el, se usa prefers-color-scheme.
        var nativeDark = callBridgeValue('isDark', [], null);
        dark = typeof nativeDark === 'boolean'
          ? nativeDark
          : Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
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

    var syncThemeFromBridge = function() {
      // P1: getThemeMode/isDark exigen el nonce; sin el no se llama al puente.
      var mode = callBridgeValue('getThemeMode', [], null);
      if (typeof mode !== 'string') return;
      var nativeDark = callBridgeValue('isDark', [], false);
      window.__DSH_SET_THEME__(mode, Boolean(nativeDark));
    };

    var attachThemeObserver = function() {
      if (document.body) {
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        syncThemeFromBridge();
      } else {
        document.addEventListener('DOMContentLoaded', attachThemeObserver);
      }
    };
    attachThemeObserver();
    // Si el nonce llega despues de este bloque, el armado avisa y se relee.
    window.addEventListener('dsh-bridge-armed', syncThemeFromBridge);
  } catch(e) {}

  window.__DSH_EXTRACT_CHAT_TEXT__ = function() {
    try {
      var out = [];
      var seen = [];
      // No depender de un unico atributo interno de DSH: se prueban varios y,
      // si ninguno aparece, se usa el scroller con mas texto. Asi sobrevive a
      // cambios del DOM sin dejar la copia offline vacia.
      var selectors = ['[data-message-role]', '[data-role]', '[data-testid*="message"]', 'article', '[class*="message_"]', '[class*="message-"]'];
      for (var s = 0; s < selectors.length && !out.length; s++) {
        var nodes = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var dup = false;
          for (var j = 0; j < seen.length; j++) {
            if (seen[j] === el || (seen[j].contains && seen[j].contains(el))) { dup = true; break; }
          }
          if (dup) continue;
          var txt = (el.innerText || el.textContent || '').trim();
          if (txt.length < 2) continue;
          seen.push(el);
          var role = el.getAttribute('data-message-role') || el.getAttribute('data-role') || '';
          var label = /user|human/i.test(role) ? '### Usuario:' : '### Asistente:';
          out.push(label + '\\n\\n' + txt + '\\n');
        }
      }
      if (!out.length) {
        var best = null;
        var bestLen = 0;
        var all = document.querySelectorAll('div,main,section');
        for (var k = 0; k < all.length; k++) {
          var e = all[k];
          var oy = '';
          try { oy = window.getComputedStyle(e).overflowY; } catch (ignore) {}
          if (!/(auto|scroll)/.test(oy)) continue;
          if (e.scrollHeight <= e.clientHeight + 40) continue;
          var len = (e.innerText || '').length;
          if (len > bestLen) { best = e; bestLen = len; }
        }
        if (best) out.push('### Conversacion:\\n\\n' + (best.innerText || '').trim() + '\\n');
      }
      var text = out.join('\\n---\\n\\n').trim();
      if (text.length > 20000) text = text.slice(-20000);
      return text;
    } catch(e) {
      return '';
    }
  };

`;
