/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Preferencias y geometria del dock: comandos rapidos, deteccion del
 * teclado en pantalla y colores solidos del bloque.
 */
export const MOBILE_CLIENT_DOCK = `  // Barra de comandos rapidos + teclas de codigo, ancladas al compositor.
  var QUICK_ACTIONS = [
    { label: "Auditar", prompt: "Audita el codigo anterior buscando vulnerabilidades, edge cases y optimizaciones." },
    { label: "Explicar", prompt: "Explica de forma clara y estructurada el funcionamiento del contenido anterior." },
    { label: "Pruebas", prompt: "Escribe pruebas unitarias completas y casos limite para el codigo anterior." },
    { label: "Continuar", prompt: "Continua exactamente desde donde se quedo, sin repetir lo anterior." },
    { label: "Notas", prompt: "Revisa mis notas del telefono. Indice: companion/synced_chats/notes/INDICE.md" }
  ];

  var CODE_KEY_SYMBOLS = ['Tab', 'Esc', '/', '{ }', '[ ]', '( )', '|', '~', '\`'];

  function isEditableTarget(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
    if (el.isContentEditable) return true;
    return Boolean(el.getAttribute && el.getAttribute('contenteditable') === 'true');
  }

  var keyboardBaseline = 0;

  /**
   * Preferencias de Ajustes del telefono: que filas del bloque se muestran.
   * P1: quickActionsEnabled/codeKeysEnabled exigen el nonce de pagina, asi que
   * sin puente armado no se llama y se usan los valores por defecto; cuando el
   * armado avisa, se releen sin recargar.
   */
  var dockPrefs = { quick: true, keys: true };

  function readDockPrefs() {
    var prefs = { quick: true, keys: true };
    var quick = callBridgeValue('quickActionsEnabled', [], null);
    if (typeof quick === 'boolean') prefs.quick = quick;
    var keys = callBridgeValue('codeKeysEnabled', [], null);
    if (typeof keys === 'boolean') prefs.keys = keys;
    return prefs;
  }

  dockPrefs = readDockPrefs();
  window.addEventListener('dsh-bridge-armed', function() {
    dockPrefs = readDockPrefs();
    updateComposerDockVisibility();
  });

  window.__DSH_SET_DOCK_PREFS__ = function(next) {
    if (!next) return;
    if (typeof next.quick === 'boolean') dockPrefs.quick = next.quick;
    if (typeof next.keys === 'boolean') dockPrefs.keys = next.keys;
    updateComposerDockVisibility();
  };

  function viewportHeight() {
    var vv = window.visualViewport;
    return Math.round(vv ? vv.height : window.innerHeight);
  }

  function noteKeyboardBaseline() {
    var h = viewportHeight();
    if (h > keyboardBaseline) keyboardBaseline = h;
  }

  /**
   * Heuristica del teclado: se muestra solo si el campo tiene el foco Y el alto
   * visible se redujo respecto al alto sin teclado. Mirar solo el foco dejaba la
   * barra pegada cuando se ocultaba el teclado con el boton Atras, que no quita
   * el foco del textarea.
   *
   * La referencia de alto se aprende siempre (con o sin foco) y se queda con el
   * mayor valor visto: si se aprendiera solo al enfocar, el primer dato podria
   * ser el alto ya reducido por el teclado y la barra no apareceria nunca.
   */
  function isKeyboardOpen() {
    noteKeyboardBaseline();
    if (!isEditableTarget(document.activeElement)) return false;
    if (!keyboardBaseline) return true;
    return viewportHeight() <= keyboardBaseline * 0.82;
  }

  /**
   * Utilidades de color para que el bloque tenga fondo propio opaco.
   */
  function parseCssColor(value) {
    if (!value) return null;
    // Dentro de esta plantilla las barras invertidas se comen: hay que
    // escribirlas dobles para que el JS servido reciba \\( y \\) y la regex sea
    // valida (con una sola, el navegador recibe /rgba?(([^)]+))/ y devuelve NaN).
    var match = String(value).match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    var parts = match[1].split(',').map(function(n) { return parseFloat(n); });
    if (parts.length < 3) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  /**
   * Fondo opaco para el bloque. Cuando flota sobre el historial (conversacion)
   * los botones semitransparentes dejaban ver el texto de detras; se toma el
   * color del compositor y, si viene con alfa, se mezcla sobre un fondo solido
   * acorde al esquema de color.
   */
  function solidDockBackground(candidates) {
    var i;
    for (i = 0; i < candidates.length; i++) {
      var solid = parseCssColor(candidates[i]);
      if (solid && solid.a >= 0.9) {
        return 'rgb(' + Math.round(solid.r) + ',' + Math.round(solid.g) + ',' + Math.round(solid.b) + ')';
      }
    }

    var scheme = '';
    try { scheme = window.getComputedStyle(document.documentElement).colorScheme || ''; } catch(e) {}
    var dark = scheme.indexOf('dark') >= 0;
    var base = dark ? { r: 21, g: 21, b: 23 } : { r: 255, g: 255, b: 255 };

    for (i = 0; i < candidates.length; i++) {
      var tint = parseCssColor(candidates[i]);
      if (!tint || tint.a === 0) continue;
      var a = Math.min(1, Math.max(0, tint.a));
      return 'rgb('
        + Math.round(tint.r * a + base.r * (1 - a)) + ','
        + Math.round(tint.g * a + base.g * (1 - a)) + ','
        + Math.round(tint.b * a + base.b * (1 - a)) + ')';
    }

    return dark ? '#151517' : '#ffffff';
  }

  /**
   * Caja del compositor completo (la tarjeta que incluye la fila del espacio de
   * trabajo, el campo y los botones), no solo el area de texto. Se sube desde el
   * editor como maximo 4 niveles y se corta si el ancestro deja de parecer la
   * tarjeta: si se sube de mas, se llega al "hero" y el bloque se va al titulo.
   */
  function composerCardRect(editor) {
    var editorRect = editor.getBoundingClientRect();
    var best = editorRect;
    var limit = viewportHeight() * 0.6;
    var node = editor;

    for (var depth = 0; depth < 4; depth++) {
      node = node.parentElement;
      if (!node || node === document.body) break;
      var rect = node.getBoundingClientRect();
      if (!rect.height || rect.height > limit) break;
      if (rect.width + 1 < editorRect.width) break;
      best = rect;
    }
    // Union con el propio editor: el ancestro elegido puede ser MAS BAJO que el
    // area de texto y el bloque acababa dibujandose sobre la ultima linea que
    // el usuario estaba escribiendo. Con la union, "debajo"/"encima" nunca
    // pisan ni la tarjeta ni el campo.
    return {
      top: Math.min(best.top, editorRect.top),
      bottom: Math.max(best.bottom, editorRect.bottom),
      left: Math.min(best.left, editorRect.left),
      right: Math.max(best.right, editorRect.right),
    };
  }

  // --- Apaisado con teclado: una franja compacta que RESERVA su alto ---------

  /** Tarjeta del compositor (atributo estable de DSH, no la clase hasheada). */
  function composerCardFor(editor) {
    try { return editor && editor.closest ? editor.closest('[data-composer-card]') : null; } catch (e) { return null; }
  }

  /** Fila de botones de la tarjeta: en DSH es su ultimo hijo. */
  function composerRowRect(editor) {
    var card = composerCardFor(editor);
    var row = card ? card.lastElementChild : null;
    if (!row) return null;
    var rect = row.getBoundingClientRect();
    return rect && rect.height ? rect : null;
  }

  /**
   * Franja vertical realmente visible para el compositor: el alto del scroller
   * del chat recortado por el teclado. Si la pila del compositor lo supera, el
   * asiento sticky se recorta por ARRIBA y el campo de texto (lo primero de la
   * tarjeta) queda fuera aunque la fila de botones se siga viendo.
   */
  function composerBand(seat, editor) {
    var scroller = seat ? findChatScroller(seat) : null;
    var rect = scroller ? scroller.getBoundingClientRect() : null;
    if (rect && rect.height) {
      return Math.max(0, Math.round(Math.min(rect.bottom, visibleBottomEdge()) - rect.top - 2));
    }
    if (editor) {
      return Math.max(0, Math.round(visibleBottomEdge() - editor.getBoundingClientRect().top - 2));
    }
    return 0;
  }

  var dockCompactScroll = null;

  /**
   * Ajusta el scrollport del borrador a la franja disponible. La linea que se
   * teclea nunca empuja la tarjeta fuera de la vista: lo que excede la franja se
   * desplaza dentro del propio scrollport (DSH revela el caret al escribir).
   */
  function fitComposerScroll(editor, seat, band, reserve) {
    var card = composerCardFor(editor);
    var scroll = null;
    try { scroll = document.querySelector('[data-input-scroll]'); } catch (e) {}
    if (!card || !scroll || !band) return;
    var rowRect = composerRowRect(editor);
    var rowH = rowRect ? rowRect.height : 28;
    var style = window.getComputedStyle(card);
    var padTop = parseFloat(style.paddingTop) || 0;
    var gap = parseFloat(style.rowGap || style.gap) || 0;
    var rootPad = 0;
    try { rootPad = parseFloat(window.getComputedStyle(card.parentElement).paddingBottom) || 0; } catch (e) {}
    var avail = Math.floor(band - (reserve || 0) - rootPad - padTop - gap - rowH - 2);
    if (avail < 24) avail = 24;
    if (avail > 96) avail = 96;
    dockCompactScroll = scroll;
    scroll.style.setProperty('max-height', avail + 'px', 'important');
    // Red de seguridad: si aun asi el borde del campo quedara bajo el borde de
    // arriba del scroller (fila que envuelve, aviso del compositor), se recorta
    // otro poco el borrador; el texto sigue viendose y el resto se desplaza.
    try {
      var scroller = seat ? findChatScroller(seat) : null;
      var scrollerTop = scroller ? scroller.getBoundingClientRect().top : 0;
      var delta = Math.round(scrollerTop - editor.getBoundingClientRect().top - 4);
      if (delta > 0) {
        avail = Math.max(24, avail - delta - 2);
        scroll.style.setProperty('max-height', avail + 'px', 'important');
      }
    } catch (e) {}
  }

  /** Devuelve el scrollport del borrador a los topes normales de DSH. */
  function restoreComposerScroll() {
    if (!dockCompactScroll) return;
    try { dockCompactScroll.style.removeProperty('max-height'); } catch (e) {}
    dockCompactScroll = null;
  }

  /** Alto de la unica fila compacta del dock en apaisado. */
  var COMPACT_DOCK_HEIGHT = 34;

  /**
   * Franja minima que necesita el compositor compacto: una linea de escritura
   * (24 px), la fila de botones (28 px) y el relleno, mas un margen para que no
   * roce el borde del scroller.
   */
  var COMPACT_COMPOSER_MIN = 72;

  /** Telefono en apaisado: el alto vertical util es escaso. */
  function isShortLandscape() {
    return window.innerWidth > window.innerHeight && viewportHeight() <= 520;
  }

  /**
   * Pixeles del layout que tapa el teclado. Con adjustResize el layout ya se
   * encoge y esto queda en 0; con adjustPan o edge-to-edge el layout sigue
   * completo y hay que subir a mano el dock y el compositor. Se mide con
   * visualViewport (el area realmente visible), no con innerHeight.
   */
  function visualKeyboardInset() {
    var vv = window.visualViewport;
    if (!vv) return 0;
    var inset = Math.round(window.innerHeight - ((vv.offsetTop || 0) + vv.height));
    return inset > 0 ? inset : 0;
  }

  /** Borde inferior de lo visible, en coordenadas del layout. */
  function visibleBottomEdge() {
    var vv = window.visualViewport;
    if (!vv) return window.innerHeight;
    return (vv.offsetTop || 0) + vv.height;
  }

  /**
   * Asiento del compositor: en DSH es el ancestro que queda pegado al fondo del
   * scroller (sticky en conversacion, absolute con overlay). Se busca por clase
   * y, si DSH la renombra, subiendo desde el editor.
   */
  function findComposerSeat(el) {
    var byClass = document.querySelector('[class*="composerSeat"]');
    if (byClass && byClass.contains && byClass.contains(el)) return byClass;
    var node = el;
    for (var depth = 0; depth < 40 && node; depth++) {
      node = node.parentElement;
      if (!node || node === document.body) break;
      var position = '';
      try { position = window.getComputedStyle(node).position; } catch (e) {}
      if (position === 'sticky') return node;
    }
    return null;
  }

  /** Scroller del chat: el que desplaza el historial de mensajes. */
  function findChatScroller(el) {
    var node = el;
    for (var depth = 0; depth < 40 && node; depth++) {
      node = node.parentElement;
      if (!node || node === document.body) break;
      var style = null;
      try { style = window.getComputedStyle(node); } catch (e) {}
      if (!style) break;
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    }
    return null;
  }

  var dockReserveSeat = null;
  var dockReserveSeatBottom = '';
  var dockReserveScroller = null;
  var dockReserveScrollerPadding = '';
  var dockReserveScrollerScrollPadding = '';
  var dockReserveActive = false;

  /** Devuelve los estilos que tenia DSH antes de reservar. */
  function restoreDockReserve() {
    if (!dockReserveActive) return;
    if (dockReserveSeat) dockReserveSeat.style.bottom = dockReserveSeatBottom;
    if (dockReserveScroller) {
      dockReserveScroller.style.paddingBottom = dockReserveScrollerPadding;
      dockReserveScroller.style.scrollPaddingBottom = dockReserveScrollerScrollPadding;
    }
    dockReserveActive = false;
  }

  /**
   * Reserva la franja del dock en vez de superponerla: sube el asiento del
   * compositor (pegado al fondo en DSH) el alto del dock y deja ese mismo hueco
   * como padding-bottom del scroller, para que la ultima linea del chat pueda
   * desplazarse por encima del dock. Devuelve false si DSH no ofrece asiento.
   */
  function applyDockReserve(pixels) {
    var editor = findEditor();
    if (!editor) {
      restoreDockReserve();
      return false;
    }
    var seat = findComposerSeat(editor);
    if (!seat) {
      restoreDockReserve();
      return false;
    }
    var scroller = findChatScroller(seat);
    if (seat !== dockReserveSeat || scroller !== dockReserveScroller) {
      restoreDockReserve();
      dockReserveSeat = seat;
      dockReserveScroller = scroller;
      dockReserveSeatBottom = seat.style.bottom || '';
      dockReserveScrollerPadding = scroller ? (scroller.style.paddingBottom || '') : '';
      dockReserveScrollerScrollPadding = scroller ? (scroller.style.scrollPaddingBottom || '') : '';
    }
    var size = Math.max(0, Math.round(pixels)) + 'px';
    seat.style.bottom = size;
    if (scroller) {
      scroller.style.paddingBottom = size;
      scroller.style.scrollPaddingBottom = size;
    }
    dockReserveActive = true;
    return true;
  }

`;
