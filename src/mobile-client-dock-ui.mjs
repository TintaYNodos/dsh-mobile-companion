/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Dock del compositor: filas de comandos y teclas, y su geometria. En apaisado
 * con teclado pasa a UNA fila compacta que reserva su franja en vez de tapar
 * el campo de escritura.
 */
export const MOBILE_CLIENT_DOCK_UI = `  // Estado del dock compacto: null = automatico (abre si cabe), true = abierto
  // a peticion del usuario, false = plegado (queda el boton que lo reabre).
  var dockCompactOpen = null;

  function setDockDisplay(dock, visible) {
    var current = dock.getAttribute('data-visible') === '1';
    if (visible !== current) {
      dock.setAttribute('data-visible', visible ? '1' : '0');
      dock.style.display = visible ? 'flex' : 'none';
      if (visible) dock.removeAttribute('aria-hidden');
      else dock.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Modo de siempre (vertical y pantallas altas): dos filas pegadas a la
   * tarjeta del compositor, por abajo o por arriba. Devuelve true si hubo que
   * ocultarlo (red de seguridad: nunca sobre el area de texto).
   */
  function positionClassicDock(dock, editor) {
    var rect = editor.getBoundingClientRect();
    if (!rect || !rect.height) {
      setDockDisplay(dock, false);
      return true;
    }
    var card = composerCardRect(editor);
    var vh = viewportHeight();
    var dockHeight = dock.offsetHeight || 92;
    var gap = 6;

    var below = Math.round(card.bottom + gap);
    if (below + dockHeight <= vh - 4) {
      dock.style.top = below + 'px';
      dock.style.borderRadius = '0 0 14px 14px';
      dock.style.borderTop = '1px solid rgba(128,128,128,0.35)';
      dock.style.borderBottom = 'none';
    } else {
      var above = Math.round(card.top - dockHeight - gap);
      dock.style.top = Math.max(4, above) + 'px';
      dock.style.borderRadius = '14px 14px 0 0';
      dock.style.borderBottom = '1px solid rgba(128,128,128,0.35)';
    }
    dock.style.bottom = 'auto';

    var topPx = parseFloat(dock.style.top) || 0;
    if (topPx < rect.bottom + 2 && topPx + dockHeight > rect.top - 2) {
      setDockDisplay(dock, false);
      return true;
    }
    return false;
  }

  /**
   * Fondo opaco del bloque: los tokens de DSH viven en su contenedor con tema,
   * no en body; se copian los colores reales del editor.
   */
  function paintDockSurface(el, editor) {
    try {
      var style = window.getComputedStyle(editor);
      if (style && style.color) el.style.color = style.color;
      var cardStyle = editor.parentElement ? window.getComputedStyle(editor.parentElement) : null;
      var bodyBg = '';
      try { bodyBg = window.getComputedStyle(document.body).backgroundColor; } catch(e) {}
      el.style.background = solidDockBackground([
        cardStyle ? cardStyle.backgroundColor : '',
        style.backgroundColor,
        bodyBg
      ]);
      var border = style.borderTopColor;
      if (border && border !== 'rgba(0, 0, 0, 0)') el.style.borderTopColor = border;
    } catch(e) {}
  }

  function compactButton(label, extraCss, onClick, ariaLabel) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    btn.style.cssText = 'flex:0 0 auto;min-height:30px;padding:0 10px;border-radius:8px;border:1px solid rgba(128,128,128,0.40);background:rgba(128,128,128,0.14);color:inherit;font-size:12px;font-weight:600;line-height:1.15;white-space:nowrap;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;' + (extraCss || '');
    preventFocusLoss(btn);
    btn.onclick = onClick;
    return btn;
  }

  function quickActionButton(act, extraCss) {
    return compactButton(act.label, extraCss, function(e) {
      e.preventDefault();
      e.stopPropagation();
      haptic('confirm');
      if (window.__DSH_INSERT_INTO_COMPOSER__) window.__DSH_INSERT_INTO_COMPOSER__(act.prompt);
    });
  }

  /** Fila unica del apaisado: comandos y teclas en un scroll horizontal. */
  function buildCompactRow() {
    var row = document.createElement('div');
    row.id = 'dsh-dock-compact';
    row.setAttribute('role', 'toolbar');
    row.setAttribute('aria-label', 'Comandos y teclas');
    row.style.cssText = 'display:none;align-items:center;gap:4px;width:100%;height:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;';

    row.appendChild(compactButton('⌨', 'min-width:32px;padding:0 8px;', function(e) {
      e.preventDefault();
      e.stopPropagation();
      haptic('tick');
      dockCompactOpen = false;
      updateComposerDockVisibility();
    }, 'Ocultar comandos y teclas'));

    var quick = document.createElement('div');
    quick.id = 'dsh-compact-quick';
    quick.style.cssText = 'display:flex;align-items:center;gap:4px;flex:0 0 auto;';
    QUICK_ACTIONS.forEach(function(act) {
      quick.appendChild(quickActionButton(act, 'font-size:11.5px;padding:0 9px;'));
    });
    row.appendChild(quick);

    var keys = document.createElement('div');
    keys.id = 'dsh-compact-keys';
    keys.style.cssText = 'display:flex;align-items:center;gap:4px;flex:0 0 auto;';
    CODE_KEY_SYMBOLS.forEach(function(sym) {
      keys.appendChild(compactButton(sym, 'min-width:34px;padding:0 8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;', function(e) {
        e.preventDefault();
        e.stopPropagation();
        handleCodeKey(sym);
      }, 'Tecla ' + sym));
    });
    row.appendChild(keys);

    return row;
  }

  /**
   * Boton que reabre el dock cuando no cabe la fila o cuando el usuario la
   * pliega. Se coloca encima de la tarjeta para no tapar ni el campo ni los
   * botones, y deja claro que los comandos siguen ahi.
   */
  function ensureDockLatch() {
    var latch = document.getElementById('dsh-dock-latch');
    if (latch) return latch;
    latch = document.createElement('button');
    latch.id = 'dsh-dock-latch';
    latch.type = 'button';
    latch.textContent = '⌨ Comandos';
    latch.setAttribute('aria-label', 'Abrir comandos y teclas');
    latch.style.cssText = 'position:fixed;z-index:71;left:auto;right:10px;top:auto;bottom:10px;display:none;align-items:center;min-height:30px;padding:0 12px;border-radius:15px;border:1px solid rgba(128,128,128,0.45);background:#1b1b1f;color:#e6edf3;font-size:12px;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,0.45);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
    preventFocusLoss(latch);
    latch.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      haptic('tick');
      dockCompactOpen = true;
      updateComposerDockVisibility();
    };
    (document.body || document.documentElement).appendChild(latch);
    return latch;
  }

  function positionDockLatch(latch, editor) {
    if (!latch) return;
    var inset = visualKeyboardInset();
    var layoutH = window.innerHeight;
    var card = composerCardRect(editor);
    var above = Math.round(layoutH - card.top + 6);
    if (above < inset + 6) above = inset + 6;
    if (above > layoutH - 34) above = layoutH - 34;
    latch.style.bottom = Math.max(4, above) + 'px';
    latch.style.display = 'inline-flex';
    paintDockSurface(latch, editor);
  }

  function updateComposerDockVisibility() {
    var dock = document.getElementById('dsh-composer-dock');
    if (!dock) return;

    // Cada fila respeta su interruptor de Ajustes; el bloque entero desaparece
    // si ambas estan desactivadas.
    var quickRow = document.getElementById('dsh-quick-actions');
    var keysRow = document.getElementById('dsh-code-keys');
    var compactRow = document.getElementById('dsh-dock-compact');
    var latch = document.getElementById('dsh-dock-latch');
    var anyRow = dockPrefs.quick || dockPrefs.keys;
    var editor = findEditor();
    var keyboardOpen = Boolean(editor) && anyRow && isKeyboardOpen();

    if (!keyboardOpen) {
      dockCompactOpen = null;
      restoreDockReserve();
      setDockDisplay(dock, false);
      if (compactRow) compactRow.style.display = 'none';
      if (latch) latch.style.display = 'none';
      return;
    }

    if (!isShortLandscape()) {
      // Comportamiento de siempre (vertical y pantallas altas): sin reservar.
      dockCompactOpen = null;
      restoreDockReserve();
      if (compactRow) compactRow.style.display = 'none';
      if (latch) latch.style.display = 'none';
      if (quickRow) quickRow.style.display = dockPrefs.quick ? 'flex' : 'none';
      if (keysRow) keysRow.style.display = dockPrefs.keys ? 'flex' : 'none';
      dock.style.flexDirection = 'column';
      dock.style.alignItems = 'stretch';
      dock.style.gap = '5px';
      dock.style.height = 'auto';
      dock.style.padding = '5px 10px 6px 10px';
      dock.style.left = '0';
      dock.style.right = '0';
      setDockDisplay(dock, true);
      if (!positionClassicDock(dock, editor)) paintDockSurface(dock, editor);
      return;
    }

    // --- Apaisado de telefono con teclado: una sola fila compacta ---
    if (quickRow) quickRow.style.display = 'none';
    if (keysRow) keysRow.style.display = 'none';
    var compactQuick = document.getElementById('dsh-compact-quick');
    if (compactQuick) compactQuick.style.display = dockPrefs.quick ? 'flex' : 'none';
    var compactKeys = document.getElementById('dsh-compact-keys');
    if (compactKeys) compactKeys.style.display = dockPrefs.keys ? 'flex' : 'none';

    var inset = visualKeyboardInset();
    var layoutH = window.innerHeight;
    var editorRect = editor.getBoundingClientRect();
    var seat = findComposerSeat(editor);
    var seatPosition = '';
    if (seat) {
      try { seatPosition = window.getComputedStyle(seat).position; } catch (e) {}
    }
    var canReserve = seatPosition === 'sticky' || seatPosition === 'absolute';
    // Distancia del asiento al borde superior del campo: no cambia al subir el
    // asiento entero, asi que sirve para decidir si cabe sin oscilar.
    var distance = seat ? (seat.getBoundingClientRect().bottom - editorRect.top) : 0;
    var fits = canReserve
      ? visibleBottomEdge() >= distance + COMPACT_DOCK_HEIGHT + 2
      : composerCardRect(editor).bottom <= layoutH - inset - COMPACT_DOCK_HEIGHT + 2;
    var showRow = dockCompactOpen === null ? fits : dockCompactOpen;

    if (!showRow) {
      restoreDockReserve();
      setDockDisplay(dock, false);
      if (compactRow) compactRow.style.display = 'none';
      positionDockLatch(latch, editor);
      return;
    }

    if (latch) latch.style.display = 'none';
    if (compactRow) compactRow.style.display = 'flex';
    dock.style.flexDirection = 'row';
    dock.style.alignItems = 'center';
    dock.style.gap = '0';
    dock.style.height = COMPACT_DOCK_HEIGHT + 'px';
    dock.style.padding = '0';
    dock.style.left = '0';
    dock.style.right = '0';
    dock.style.top = 'auto';
    dock.style.bottom = inset + 'px';
    dock.style.borderRadius = '0';
    dock.style.borderTop = '1px solid rgba(128,128,128,0.35)';
    dock.style.borderBottom = 'none';
    // Si el usuario lo abre a mano aunque no quepa, se sube solo lo justo para
    // que el campo no quede cortado por arriba: el dock nunca tapa el texto.
    var lift = inset + COMPACT_DOCK_HEIGHT;
    if (!fits) lift = Math.min(lift, Math.max(0, visibleBottomEdge() - distance - 4));
    if (canReserve) applyDockReserve(lift);
    else restoreDockReserve();
    setDockDisplay(dock, true);
    paintDockSurface(dock, editor);

    // Red de seguridad: si aun asi rozara el area de texto, se pliega y queda
    // el boton que lo abre. Nunca se escribe a ciegas.
    var dockRect = dock.getBoundingClientRect();
    var nowRect = editor.getBoundingClientRect();
    if (dockRect.height && nowRect.height && dockRect.top < nowRect.bottom - 2 && dockRect.bottom > nowRect.top + 2) {
      dockCompactOpen = false;
      restoreDockReserve();
      setDockDisplay(dock, false);
      if (compactRow) compactRow.style.display = 'none';
      positionDockLatch(latch, editor);
    }
  }

  function buildQuickActionsRow() {
    var row = document.createElement('div');
    row.id = 'dsh-quick-actions';
    row.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;';

    // Sin preventFocusLoss, pulsar un comando le quita el foco al compositor y
    // el teclado se cierra a media tarea.
    QUICK_ACTIONS.forEach(function(act) {
      row.appendChild(quickActionButton(act, 'border-radius:15px;padding:0 12px;'));
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
    ensureDockLatch();

    var dock = document.getElementById('dsh-composer-dock');
    if (dock && dock.isConnected !== false) {
      if (!document.getElementById('dsh-dock-compact')) dock.appendChild(buildCompactRow());
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
    dock.appendChild(buildCompactRow());

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
