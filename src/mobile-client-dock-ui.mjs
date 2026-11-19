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
      // Al reaparecer, las filas vuelven al principio: el primer chip no queda
      // cortado a la mitad (defecto: se veia «Escena» a medias al reabrir).
      if (visible) dshResetRowScroll();
    }
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

  /** Chip del dock. Alto, ancho y contraste vienen de la hoja (.dsh-chip:
   * 44 dp y colores con ratio verificado); aqui solo el matiz de cada modo. */
  function compactButton(label, extraCss, onClick, ariaLabel) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dsh-chip';
    btn.textContent = label;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    // La densidad se añade al final para pisar el tamaño heredado de cada uso.
    btn.style.cssText = 'flex:0 0 auto;' + (extraCss || '') + 'min-width:44px;font-size:11px;';
    preventFocusLoss(btn);
    btn.onclick = onClick;
    return btn;
  }

  /** Estado de scroll de una fila: data-overflow (hay mas contenido),
   * data-overflow-start / data-overflow-end para el degradado de cada extremo.
   * Al desplazar se recalcula: el chip cortado siempre tiene contexto visual y
   * al volver al inicio no queda un degradado izquierdo fijo. */
  function dshRowScrollState(el) {
    var max = el.scrollWidth - el.clientWidth;
    if (max > 1) el.setAttribute('data-overflow', '1');
    else el.removeAttribute('data-overflow');
    if (max > 1 && el.scrollLeft > 1) el.setAttribute('data-overflow-start', '1');
    else el.removeAttribute('data-overflow-start');
    if (max > 1 && el.scrollLeft < max - 1) el.setAttribute('data-overflow-end', '1');
    else el.removeAttribute('data-overflow-end');
  }

  function dshMarkRowOverflow(el) {
    if (!el) return;
    if (el.__dshRowScroll !== true) {
      el.__dshRowScroll = true;
      el.addEventListener('scroll', function() { dshRowScrollState(el); }, { passive: true });
    }
    dshRowScrollState(el);
  }

  function dshMarkAllRowOverflow() {
    ['dsh-dock-compact', 'dsh-quick-actions', 'dsh-code-keys'].forEach(function(id) {
      dshMarkRowOverflow(document.getElementById(id));
    });
  }

  /** Devuelve las filas al inicio (sin primer chip cortado). */
  function dshResetRowScroll() {
    ['dsh-dock-compact', 'dsh-quick-actions', 'dsh-code-keys'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.scrollLeft = 0;
      dshMarkRowOverflow(el);
    });
  }

  /** Fila unica del apaisado: comandos y teclas en un scroll horizontal. */
  function buildCompactRow() {
    var row = document.createElement('div');
    row.id = 'dsh-dock-compact';
    row.className = 'dsh-row';
    row.setAttribute('role', 'toolbar');
    row.setAttribute('aria-label', 'Comandos y teclas');
    row.style.cssText = 'display:none;align-items:center;gap:4px;width:100%;height:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:0 6px;';

    row.appendChild(compactButton('Ocultar', 'min-width:44px;padding:0 8px;', function(e) {
      e.preventDefault();
      e.stopPropagation();
      haptic('tick');
      dockCompactOpen = false;
      updateComposerDockVisibility();
    }, 'Ocultar comandos y teclas'));

    // En apaisado DSH esconde su fila de herramientas para ganar franja; este
    // chip devuelve el acceso a los archivos abriendo el menu de adjuntar.
    row.appendChild(compactButton('Archivo', 'min-width:44px;padding:0 8px;', function(e) {
      e.preventDefault();
      e.stopPropagation();
      haptic('tick');
      dshOpenAttachMenu();
    }, 'Adjuntar un archivo'));

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

  function updateComposerDockVisibility() {
    var dock = document.getElementById('dsh-composer-dock');
    if (!dock) return;
    if (dshFilePickerOpen) return dshHideDockForFilePicker();

    // Perfil/ids activos: repinta los chips si cambiaron (o si DSH recreo el dock).
    dshRefreshDockChips();

    // Cada fila respeta su interruptor de Ajustes; el bloque entero desaparece
    // si ambas estan desactivadas.
    var quickRow = document.getElementById('dsh-quick-actions');
    var keysRow = document.getElementById('dsh-code-keys');
    var compactRow = document.getElementById('dsh-dock-compact');
    var latch = document.getElementById('dsh-dock-latch');
    var collapse = document.getElementById('dsh-dock-collapse');
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
      if (collapse) collapse.style.display = 'none';
      return;
    }

    if (!tightLandscape) {
      // Vertical: una sola fila (igual que el apaisado) para no comerse la
      // pantalla del chat. El chip «Ocultar» la pliega y la lengueta «Mas» la
      // reabre; al plegarse no se reserva franja, solo flota la lengueta.
      restoreDockReserve();
      if (compactRow) compactRow.style.display = 'none';
      if (collapse) collapse.style.display = 'none';
      if (latch) latch.style.display = 'none';
      if (quickRow) quickRow.style.display = 'none';
      if (keysRow) keysRow.style.display = 'none';
      var portraitQuick = document.getElementById('dsh-compact-quick');
      if (portraitQuick) portraitQuick.style.display = dockPrefs.quick ? 'flex' : 'none';
      var portraitKeys = document.getElementById('dsh-compact-keys');
      if (portraitKeys) portraitKeys.style.display = dockPrefs.keys ? 'flex' : 'none';
      if (dockCompactOpen === false) {
        setDockDisplay(dock, false);
        positionDockLatch(latch, editor);
        dshMarkAllRowOverflow();
        return;
      }
      if (compactRow) compactRow.style.display = 'flex';
      dock.style.flexDirection = 'row';
      dock.style.alignItems = 'center';
      dock.style.gap = '0';
      dock.style.height = COMPACT_DOCK_HEIGHT + 'px';
      dock.style.padding = '0';
      dock.style.left = '0';
      dock.style.right = '0';
      dock.style.borderTop = '1px solid var(--dshc-separator)';
      dock.style.borderBottom = 'none';
      setDockDisplay(dock, true);
      if (!positionClassicDock(dock, editor)) paintDockSurface(dock, editor);
      dshMarkAllRowOverflow();
      return;
    }

    // --- Apaisado de telefono con teclado ---
    // La franja util la fija el scroller del chat, no la ventana: el asiento es
    // sticky al fondo y lo que sobra se recorta por ARRIBA, donde esta el campo.
    if (collapse) collapse.style.display = 'none';
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
    // En 'latch' el boton ocupa la franja por encima del compositor: el
    // borrador se recorta para dejarle sitio y no tapar el campo.
    var latchReserve = mode === 'latch' ? COMPACT_LATCH_HEIGHT + 6 : 0;
    var reserve = mode === 'row' ? COMPACT_DOCK_HEIGHT + inset : inset;
    if (reserve > 0) applyDockReserve(reserve);
    else restoreDockReserve();
    fitComposerScroll(editor, seat, band, mode === 'row' ? COMPACT_DOCK_HEIGHT : latchReserve);

    if (mode === 'latch') {
      setDockDisplay(dock, false);
      if (compactRow) compactRow.style.display = 'none';
      positionDockLatch(latch, editor);
      dshMarkAllRowOverflow();
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
    dock.style.borderTop = '1px solid var(--dshc-separator)';
    dock.style.borderBottom = 'none';
    // Sin restos del modo vertical (tope/scroll del bloque clasico).
    dock.style.maxHeight = '';
    dock.style.overflowY = '';
    dock.style.overflowX = '';
    if (mode === 'row') {
      dock.style.top = 'auto';
      dock.style.bottom = inset + 'px';
      dock.style.height = COMPACT_DOCK_HEIGHT + 'px';
    } else {
      // Apaisado muy justo: la fila compacta se abre superpuesta POR ENCIMA de
      // la fila de botones de DSH. Con chips de 44 dp ya no cabe en los 28 px de
      // esa fila: se ancla su borde inferior justo sobre ella para no recortar
      // el chip y dejar el campo lo más visible posible.
      var rowRect = composerRowRect(editor);
      var editorRect = editor.getBoundingClientRect();
      var rowTop = rowRect ? rowRect.top : editorRect.bottom + 4;
      dock.style.bottom = 'auto';
      dock.style.top = Math.max(4, Math.round(rowTop - COMPACT_DOCK_HEIGHT - 2)) + 'px';
      dock.style.height = COMPACT_DOCK_HEIGHT + 'px';
    }
    setDockDisplay(dock, true);
    paintDockSurface(dock, editor);
    dshMarkAllRowOverflow();
  }

  function buildQuickActionsRow() {
    var row = document.createElement('div');
    row.id = 'dsh-quick-actions';
    row.className = 'dsh-row';
    row.style.cssText = 'display:flex;align-items:center;gap:5px;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-right:14px;';
    return row;
  }

  function buildCodeKeysRow() {
    var row = document.createElement('div');
    row.id = 'dsh-code-keys';
    row.className = 'dsh-row';
    row.setAttribute('role', 'toolbar');
    row.setAttribute('aria-label', 'Teclas de programacion');
    row.style.cssText = 'display:flex;align-items:stretch;gap:5px;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;user-select:none;-webkit-user-select:none;padding-right:14px;';
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
    ensureDockCollapse();

    var dock = document.getElementById('dsh-composer-dock');
    if (dock && dock.isConnected !== false) {
      if (!document.getElementById('dsh-dock-compact')) dock.appendChild(buildCompactRow());
      observeEditorForDock();
      updateComposerDockVisibility();
      return;
    }
    if (dock) dock.remove();

    dock = document.createElement('div');
    dock.id = 'dsh-composer-dock';
    dock.setAttribute('data-visible', '0');
    dock.setAttribute('aria-hidden', 'true');
    dock.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:auto;z-index:70;display:none;flex-direction:column;gap:5px;width:100%;box-sizing:border-box;padding:5px 8px 7px 8px;border-top:1px solid var(--dshc-separator);';

    dock.appendChild(buildQuickActionsRow());
    dock.appendChild(buildCodeKeysRow());
    dock.appendChild(buildCompactRow());

    (document.body || document.documentElement).appendChild(dock);
    observeEditorForDock();
    updateComposerDockVisibility();
  }

  var dockObserver = null;
  var dockObserverTarget = null;
  var dockObserverCard = null;

  /**
   * El compositor crece al escribir. El ResizeObserver del editor Y de la
   * tarjeta recoloca el dock con el alto real en cada cambio; el tope del
   * borrador lo aplica el cliente, asi que el dock no se mueve solo.
   */
  function observeEditorForDock() {
    if (typeof ResizeObserver === 'undefined') return;
    var editor = findEditor();
    if (!editor) return;
    var card = composerCardFor(editor);
    if (editor === dockObserverTarget && card === dockObserverCard && dockObserver) return;
    if (dockObserver) dockObserver.disconnect();
    dockObserverTarget = editor;
    dockObserverCard = card;
    dockObserver = new ResizeObserver(function() {
      // Sincrono y no via requestAnimationFrame: el callback del observer corre
      // tras el layout y ANTES del paint, asi el dock se recoloca en el mismo
      // frame. El dock es position:fixed, no altera el tamano del editor.
      updateComposerDockVisibility();
    });
    dockObserver.observe(editor);
    if (card) dockObserver.observe(card);
  }

  // Recoloca tambien en cada input (el ResizeObserver puede llegar un frame
  // despues si el texto solo desplaza el contenido dentro del scrollport).
  var dockInputTimer = 0;
  document.addEventListener('input', function(event) {
    if (!isComposerTarget(event.target) || dockInputTimer) return;
    dockInputTimer = setTimeout(function() {
      dockInputTimer = 0;
      updateComposerDockVisibility();
    }, 0);
  }, true);

  // Ganchos para pruebas automatizadas.
  window.__DSH_ENSURE_DOCK__ = ensureComposerDock;
  window.__DSH_UPDATE_DOCK__ = updateComposerDockVisibility;

`;
