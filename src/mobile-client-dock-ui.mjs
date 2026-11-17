/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Dock del compositor: filas de comandos y teclas, y su geometria. En apaisado
 * con teclado la fila compacta no se superpone al campo: o cabe encima, o se
 * abre sobre la fila de botones, o queda el boton que la abre.
 */
export const MOBILE_CLIENT_DOCK_UI = `  // null = automatico (fila si sobra franja), true = abierto, false = plegado.
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

  /** Modo de siempre (vertical y pantallas altas): dos filas pegadas a la
   * tarjeta, por abajo o por arriba; true si hubo que ocultarlo. */
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
    row.appendChild(quick);

    var keys = document.createElement('div');
    keys.id = 'dsh-compact-keys';
    keys.style.cssText = 'display:flex;align-items:center;gap:4px;flex:0 0 auto;';
    row.appendChild(keys);

    return row;
  }

  /** Boton que abre el dock cuando la fila no cabe o el usuario la pliega.
   * Se coloca encima de la tarjeta, nunca sobre el campo ni los botones. */
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

  /**
   * Boton que abre la fila compacta cuando no cabe encima del compositor. Se
   * coloca justo POR ENCIMA de la tarjeta (nunca sobre el campo de texto) y
   * siempre dentro de la franja visible, es decir, por encima del teclado.
   */
  function positionDockLatch(latch, editor) {
    if (!latch) return;
    var card = composerCardFor(editor);
    var cardRect = card ? card.getBoundingClientRect() : editor.getBoundingClientRect();
    var top = Math.round(cardRect.top - 34);
    var limit = visibleBottomEdge() - 38;
    if (top > limit) top = limit;
    if (top < 4) top = 4;
    latch.style.top = top + 'px';
    latch.style.bottom = 'auto';
    latch.style.display = 'inline-flex';
    paintDockSurface(latch, editor);
  }

  function updateComposerDockVisibility() {
    var dock = document.getElementById('dsh-composer-dock');
    if (!dock) return;

    // Perfil/ids activos: repinta los chips si cambiaron (o si DSH recreo el dock).
    dshRefreshDockChips();

    // Cada fila respeta su interruptor de Ajustes; el bloque entero desaparece
    // si ambas estan desactivadas.
    var quickRow = document.getElementById('dsh-quick-actions');
    var keysRow = document.getElementById('dsh-code-keys');
    var compactRow = document.getElementById('dsh-dock-compact');
    var latch = document.getElementById('dsh-dock-latch');
    var anyRow = dockPrefs.quick || dockPrefs.keys;
    var editor = findEditor();
    var keyboardOpen = Boolean(editor) && anyRow && isKeyboardOpen();
    var tightLandscape = keyboardOpen && isShortLandscape();

    // El CSS compacta la tarjeta del compositor solo mientras el teclado esta
    // abierto en apaisado; al cerrarlo se devuelve a DSH su geometria normal.
    var root = document.documentElement;
    if (tightLandscape) root.setAttribute('data-dshc-keyboard', '1');
    else root.removeAttribute('data-dshc-keyboard');

    if (!keyboardOpen) {
      dockCompactOpen = null;
      restoreDockReserve();
      restoreComposerScroll();
      setDockDisplay(dock, false);
      if (compactRow) compactRow.style.display = 'none';
      if (latch) latch.style.display = 'none';
      return;
    }

    if (!tightLandscape) {
      // Comportamiento de siempre (vertical y pantallas altas): sin reservar.
      dockCompactOpen = null;
      restoreDockReserve();
      restoreComposerScroll();
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

    // --- Apaisado de telefono con teclado ---
    // La franja util la fija el scroller del chat, no la ventana: el asiento es
    // sticky al fondo y lo que sobra se recorta por ARRIBA, donde esta el campo.
    if (quickRow) quickRow.style.display = 'none';
    if (keysRow) keysRow.style.display = 'none';
    var compactQuick = document.getElementById('dsh-compact-quick');
    if (compactQuick) compactQuick.style.display = dockPrefs.quick ? 'flex' : 'none';
    var compactKeys = document.getElementById('dsh-compact-keys');
    if (compactKeys) compactKeys.style.display = dockPrefs.keys ? 'flex' : 'none';

    var seat = findComposerSeat(editor);
    var inset = visualKeyboardInset();
    var band = composerBand(seat, editor);
    // La fila solo se reserva si, ademas de ella, cabe la pila compacta entera;
    // si no, se abre a peticion superponiendose SOLO a la fila de botones (el
    // texto queda siempre por encima) o se ofrece el boton que la abre.
    var rowRoom = band >= COMPACT_DOCK_HEIGHT + COMPACT_COMPOSER_MIN;
    var mode = rowRoom && dockCompactOpen !== false ? 'row'
      : dockCompactOpen === true ? 'overlay' : 'latch';
    var reserve = mode === 'row' ? COMPACT_DOCK_HEIGHT + inset : inset;
    if (reserve > 0) applyDockReserve(reserve);
    else restoreDockReserve();
    fitComposerScroll(editor, seat, band, mode === 'row' ? COMPACT_DOCK_HEIGHT : 0);

    if (mode === 'latch') {
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
    dock.style.padding = '0';
    dock.style.left = '0';
    dock.style.right = '0';
    dock.style.borderRadius = '0';
    dock.style.borderTop = '1px solid rgba(128,128,128,0.35)';
    dock.style.borderBottom = 'none';
    if (mode === 'row') {
      dock.style.top = 'auto';
      dock.style.bottom = inset + 'px';
      dock.style.height = COMPACT_DOCK_HEIGHT + 'px';
    } else {
      // Apaisado muy justo: la fila se superpone a la fila de botones de DSH,
      // justo debajo de la linea de texto; el campo sigue visible y editable.
      var rowRect = composerRowRect(editor);
      var editorRect = editor.getBoundingClientRect();
      dock.style.bottom = 'auto';
      dock.style.top = Math.max(4, Math.round((rowRect ? rowRect.top : editorRect.bottom + 4) - 2)) + 'px';
      dock.style.height = Math.round((rowRect ? rowRect.height : 28) + 2) + 'px';
    }
    setDockDisplay(dock, true);
    paintDockSurface(dock, editor);
  }

  function buildQuickActionsRow() {
    var row = document.createElement('div');
    row.id = 'dsh-quick-actions';
    row.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;';
    return row;
  }

  function buildCodeKeysRow() {
    var row = document.createElement('div');
    row.id = 'dsh-code-keys';
    row.setAttribute('role', 'toolbar');
    row.setAttribute('aria-label', 'Teclas de programacion');
    row.style.cssText = 'display:flex;align-items:stretch;gap:6px;width:100%;user-select:none;-webkit-user-select:none;';
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
