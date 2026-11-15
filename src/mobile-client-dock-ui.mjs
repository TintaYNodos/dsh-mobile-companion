/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

/**
 * Dock del compositor: colocacion debajo o encima de la tarjeta, filas de
 * comandos y teclas de codigo, y observacion de cambios de tamano.
 */
export const MOBILE_CLIENT_DOCK_UI = `  function updateComposerDockVisibility() {
    var dock = document.getElementById('dsh-composer-dock');
    if (!dock) return;

    // Cada fila respeta su interruptor de Ajustes; el bloque entero desaparece
    // si ambas estan desactivadas.
    var quickRow = document.getElementById('dsh-quick-actions');
    if (quickRow) quickRow.style.display = dockPrefs.quick ? 'flex' : 'none';
    var keysRow = document.getElementById('dsh-code-keys');
    if (keysRow) keysRow.style.display = dockPrefs.keys ? 'flex' : 'none';

    var anyRow = dockPrefs.quick || dockPrefs.keys;
    var visible = anyRow && isKeyboardOpen();
    var current = dock.getAttribute('data-visible') === '1';
    if (visible !== current) {
      dock.setAttribute('data-visible', visible ? '1' : '0');
      dock.style.display = visible ? 'flex' : 'none';
      if (visible) dock.removeAttribute('aria-hidden');
      else dock.setAttribute('aria-hidden', 'true');
    }

    if (!visible) return;

    // El bloque va DEBAJO de la tarjeta del compositor, hacia el teclado: por
    // encima se montaba sobre la fila del espacio de trabajo y la de "Modo".
    var editor = findEditor();
    if (!editor) return;
    var rect = editor.getBoundingClientRect();
    if (!rect || !rect.height) return;

    var card = composerCardRect(editor);
    var vh = viewportHeight();
    var dockHeight = dock.offsetHeight || 92;
    var gap = 6;

    // Preferencia: debajo de la tarjeta (hacia el teclado). En una conversacion
    // el compositor ya esta pegado al borde inferior del WebView, no cabe ahi y
    // el clamp lo montaba sobre la caja de texto; en ese caso se coloca encima
    // de la tarjeta completa, nunca sobre el campo de escritura.
    var below = Math.round(card.bottom + gap);
    if (below + dockHeight <= vh - 4) {
      dock.style.top = below + 'px';
      // Debajo de la tarjeta: esquinas inferiores redondeadas.
      dock.style.borderRadius = '0 0 14px 14px';
      dock.style.borderTop = '1px solid rgba(128,128,128,0.35)';
      dock.style.borderBottom = 'none';
    } else {
      var above = Math.round(card.top - dockHeight - gap);
      dock.style.top = Math.max(4, above) + 'px';
      // Pegado al borde superior del compositor: esquinas superiores
      // redondeadas para que se lea como parte de la caja, no como una barra
      // suelta flotando sobre el historial.
      dock.style.borderRadius = '14px 14px 0 0';
      dock.style.borderBottom = '1px solid rgba(128,128,128,0.35)';
    }
    dock.style.bottom = 'auto';

    // Los tokens de color de DSH viven en su contenedor con tema, no en body:
    // colgado del body no puede resolverlos. Se copian los colores reales del
    // editor para que el bloque se vea igual en tema claro y oscuro.
    try {
      var style = window.getComputedStyle(editor);
      if (style && style.color) dock.style.color = style.color;
      var cardStyle = editor.parentElement ? window.getComputedStyle(editor.parentElement) : null;
      var bodyBg = '';
      try { bodyBg = window.getComputedStyle(document.body).backgroundColor; } catch(e) {}

      dock.style.background = solidDockBackground([
        cardStyle ? cardStyle.backgroundColor : '',
        style.backgroundColor,
        bodyBg
      ]);

      var border = style.borderTopColor;
      if (border && border !== 'rgba(0, 0, 0, 0)') dock.style.borderTopColor = border;
    } catch(e) {}
  }

  function buildQuickActionsRow() {
    var row = document.createElement('div');
    row.id = 'dsh-quick-actions';
    row.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;';

    QUICK_ACTIONS.forEach(function(act) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = act.label;
      btn.style.cssText = 'flex:0 0 auto;min-height:30px;padding:0 12px;border-radius:15px;border:1px solid rgba(128,128,128,0.45);background:rgba(128,128,128,0.14);color:inherit;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
      // Sin esto, pulsar un comando le quita el foco al compositor y el teclado
      // se cierra a media tarea.
      preventFocusLoss(btn);
      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        haptic('confirm');
        if (window.__DSH_INSERT_INTO_COMPOSER__) window.__DSH_INSERT_INTO_COMPOSER__(act.prompt);
      };
      row.appendChild(btn);
    });

    return row;
  }

  function buildCodeKeysRow() {
    var row = document.createElement('div');
    row.id = 'dsh-code-keys';
    row.setAttribute('role', 'toolbar');
    row.setAttribute('aria-label', 'Teclas de programacion');
    row.style.cssText = 'display:flex;align-items:stretch;gap:6px;width:100%;user-select:none;-webkit-user-select:none;';

    CODE_KEY_SYMBOLS.forEach(function(sym) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = sym;
      btn.setAttribute('aria-label', 'Tecla ' + sym);
      // Reparto equitativo del ancho: las nueve teclas caben sin recortes en
      // pantallas de 360dp.
      btn.style.cssText = 'flex:1 1 0;min-width:0;min-height:32px;display:inline-flex;align-items:center;justify-content:center;background:rgba(128,128,128,0.16);border:1px solid rgba(128,128,128,0.40);color:inherit;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12.5px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';

      preventFocusLoss(btn);

      btn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        handleCodeKey(sym);
      };

      row.appendChild(btn);
    });

    return row;
  }

  /**
   * Crea (una sola vez) el bloque de comandos y teclas, fijado justo encima del
   * editor. No se inserta dentro del arbol de DSH: React/Lexical reordena ese
   * subarbol y el bloque acababa encima del hero, lejos del pulgar.
   */
  function ensureComposerDock() {
    if (!findEditor()) return;

    var dock = document.getElementById('dsh-composer-dock');
    if (dock && dock.isConnected !== false) {
      updateComposerDockVisibility();
      return;
    }
    if (dock) dock.remove();

    dock = document.createElement('div');
    dock.id = 'dsh-composer-dock';
    dock.setAttribute('data-visible', '0');
    dock.setAttribute('aria-hidden', 'true');
    dock.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:auto;z-index:70;display:none;flex-direction:column;gap:5px;width:100%;box-sizing:border-box;padding:5px 10px 6px 10px;border-top:1px solid rgba(128,128,128,0.35);';

    dock.appendChild(buildQuickActionsRow());
    dock.appendChild(buildCodeKeysRow());

    (document.body || document.documentElement).appendChild(dock);
    observeEditorForDock();
    updateComposerDockVisibility();
  }

  var dockObserver = null;
  var dockObserverTarget = null;

  /**
   * El compositor crece al escribir (hasta 36 px por linea nueva). Sin observar
   * su tamano, el bloque se quedaba quieto y el editor lo alcanzaba durante
   * unos 300 ms. ResizeObserver lo sube en cuanto el editor cambia.
   */
  function observeEditorForDock() {
    if (typeof ResizeObserver === 'undefined') return;
    var editor = findEditor();
    if (!editor || editor === dockObserverTarget) return;
    if (dockObserver) dockObserver.disconnect();
    dockObserverTarget = editor;
    dockObserver = new ResizeObserver(function() {
      // Sincrono y no via requestAnimationFrame: el callback del observer corre
      // tras el layout y ANTES del paint, asi el dock se recoloca en el mismo
      // frame y no se ve ni un frame con el editor encima. El dock es
      // position:fixed, no altera el tamano del editor, no hay realimentacion.
      updateComposerDockVisibility();
    });
    dockObserver.observe(editor);
  }

  // Ganchos para pruebas automatizadas.
  window.__DSH_ENSURE_DOCK__ = ensureComposerDock;
  window.__DSH_UPDATE_DOCK__ = updateComposerDockVisibility;

`;
