/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Editor real del compositor (Lexical): insercion de texto como teclado y
 * control de la tecla Enter (salto de linea o envio).
 */
export const MOBILE_CLIENT_EDITOR = `  /**
   * Editor real del compositor. DSH usa Lexical: un div contenteditable con
   * data-composer-input. Escribir en su innerText o en su .value rompe el
   * modelo interno del editor (Lexical repinta y descarta el texto), asi que
   * la unica via fiable es insertar como lo haria el teclado: execCommand
   * ('insertText'), que dispara beforeinput/input y Lexical aplica el cambio.
   */
  function findEditor() {
    // DSH usa Lexical: el editor es el div con data-lexical-editor. Se busca
    // primero por ese atributo porque hay otros contenteditable en la pagina.
    return document.querySelector('[data-lexical-editor="true"]') ||
           document.querySelector('[data-composer-input]') ||
           document.querySelector('[contenteditable="true"]') ||
           document.querySelector('textarea');
  }

  function caretIntoEditor(el) {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel) return;
    if (sel.rangeCount > 0 && el.contains(sel.anchorNode)) return;
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertIntoEditor(el, text) {
    if (!el) return false;
    try { el.focus(); } catch(e) {}

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      var start = el.selectionStart != null ? el.selectionStart : el.value.length;
      var end = el.selectionEnd != null ? el.selectionEnd : el.value.length;
      var next = el.value.substring(0, start) + text + el.value.substring(end);
      setter.call(el, next);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return true;
    }

    caretIntoEditor(el);
    try {
      if (document.execCommand('insertText', false, text)) return true;
    } catch(e) {}

    // Ultimo recurso para contenteditable sin execCommand disponible.
    try {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return false;
      var range = sel.getRangeAt(0);
      range.deleteContents();
      var node = document.createTextNode(text);
      range.insertNode(node);
      range.setStart(node, text.length);
      range.setEnd(node, text.length);
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return true;
    } catch(e) {
      return false;
    }
  }

  window.__DSH_INSERT_INTO_COMPOSER__ = function(text) {
    try {
      var editor = findEditor();
      if (!editor) return false;
      return insertIntoEditor(editor, String(text == null ? '' : text));
    } catch(e) {
      return false;
    }
  };

  // Control de comportamiento de tecla Enter (↵): Salto de línea vs Enviar mensaje.
  // P1: enterSendsMessage/isEnterNewlineEnabled exigen el nonce de pagina. Si el
  // puente aun no esta armado no se llama: se conserva el valor por defecto y se
  // relee cuando llega el aviso de armado. Sin APK, WebBridge aplica el
  // interruptor por __DSH_SET_ENTER_SENDS__ igual que antes.
  window.__DSH_ENTER_NEWLINE__ = true;

  function readEnterBehaviorFromBridge() {
    var bridgeSends = callBridgeValue('enterSendsMessage', [], null);
    if (typeof bridgeSends === 'boolean') {
      window.__DSH_ENTER_NEWLINE__ = !bridgeSends;
      return;
    }
    var newline = callBridgeValue('isEnterNewlineEnabled', [], null);
    if (typeof newline === 'boolean') window.__DSH_ENTER_NEWLINE__ = newline;
  }

  readEnterBehaviorFromBridge();
  window.addEventListener('dsh-bridge-armed', readEnterBehaviorFromBridge);

  window.__DSH_SET_ENTER_BEHAVIOR__ = function(isNewline) {
    window.__DSH_ENTER_NEWLINE__ = Boolean(isNewline);
  };

  // Variante en sentido directo, para no depender de la inversion en el nativo.
  window.__DSH_SET_ENTER_SENDS__ = function(sends) {
    window.__DSH_ENTER_NEWLINE__ = !Boolean(sends);
  };

  function isComposerTarget(el) {
    if (!el) return false;
    if (el.tagName === 'INPUT' && el.type !== 'textarea') return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) return true;
    if (el.closest && (el.closest('[contenteditable="true"]') || el.closest('textarea') || el.closest('[class*="composer"]') || el.closest('form:has(textarea)'))) return true;
    return false;
  }

  // Ultimo elemento del compositor que tuvo el foco. Con pulsaciones rapidas el
  // segundo Enter puede llegar cuando el evento ya no apunta al editor (Lexical
  // recrea nodos al insertar el salto); sin esta memoria, ese Enter se colaba a
  // DSH y enviaba el mensaje.
  var lastComposerTarget = null;
  var lastComposerAt = 0;

  function noteComposerTarget(el) {
    if (el && isComposerTarget(el)) {
      lastComposerTarget = el;
      lastComposerAt = Date.now();
    }
  }

  document.addEventListener('focusin', function(event) {
    noteComposerTarget(event.target);
    // Con el teclado abierto el campo puede quedar tapado si el WebView no se
    // redimensiona: solo entonces se acerca lo justo. Si su borde inferior ya
    // se ve no se toca: con el asiento sticky, un scrollIntoView a ciegas movia
    // el chat sin descubrir el campo recortado por arriba.
    var el = event.target;
    if (!el || !isComposerTarget(el)) return;
    setTimeout(function() {
      try {
        if (el.isConnected === false) return;
        if (el.getBoundingClientRect().bottom <= visibleBottomEdge() - 6) return;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (e) {}
    }, 280);
  }, true);

  /**
   * Con el teclado abierto el campo puede quedar por debajo del area visible
   * (el WebView se redimensiona tarde o el teclado se dibuja encima). Mirar solo
   * el foco no basta: el primer caracter y los saltos de linea llegan despues.
   * Tras cada cambio se comprueba que el campo siga dentro de lo visible y, si
   * no, se acerca lo justo; no se mueve si ya se ve (block:'nearest').
   */
  var typedTextCheckTimer = 0;

  function keepTypedTextVisible() {
    typedTextCheckTimer = 0;
    var el = findEditor();
    if (!el || !isEditableTarget(document.activeElement)) return;
    var rect = null;
    try { rect = el.getBoundingClientRect(); } catch (e) { return; }
    if (!rect || !rect.height) return;
    var limit = visibleBottomEdge() - 6;
    if (rect.bottom <= limit) return;
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
    if (typeof updateComposerDockVisibility === 'function') updateComposerDockVisibility();
  }

  function scheduleTypedTextCheck() {
    if (typedTextCheckTimer) return;
    typedTextCheckTimer = setTimeout(keepTypedTextVisible, 60);
  }

  document.addEventListener('input', scheduleTypedTextCheck, true);
  document.addEventListener('selectionchange', scheduleTypedTextCheck);
  window.addEventListener('keyup', scheduleTypedTextCheck, true);

  /** Scrollport del borrador: DSH lo marca con data-input-scroll. */
  function findComposerScrollport() {
    try { return document.querySelector('[data-input-scroll]'); } catch (e) { return null; }
  }

  /**
   * Tope del area de texto: 35 % del alto visible y nunca mas de 160 px en
   * vertical ni 72 px en apaisado. Sin tope el borrador crecia sin limite,
   * subia por encima del dock de comandos y lo tapaba (capturas 1080x2400).
   */
  function composerMaxHeight() {
    var vh = viewportHeight();
    var landscape = window.innerWidth > window.innerHeight && vh <= 520;
    return Math.max(24, Math.min(Math.round(vh * 0.35), landscape ? 72 : 160));
  }

  /** Aplica el tope al scrollport (el resto del borrador se desplaza dentro). */
  function setComposerScrollCap(px) {
    var scroll = findComposerScrollport();
    if (!scroll) return 0;
    var value = Math.max(24, Math.round(px));
    dockCompactScroll = scroll;
    scroll.style.setProperty('max-height', value + 'px', 'important');
    return value;
  }

  function composerTargetFor(event) {
    if (isComposerTarget(event.target)) return event.target;
    var active = document.activeElement;
    if (isComposerTarget(active)) return active;
    // Solo se recurre a la memoria si no hay nada enfocado: si el usuario esta
    // escribiendo en otro campo (buscador, dialogo), ahi manda ese campo.
    if (lastComposerTarget && Date.now() - lastComposerAt < 2000 && lastComposerTarget.isConnected !== false) {
      if (!active || active === document.body || active === document.documentElement) return lastComposerTarget;
    }
    return null;
  }

  // Interceptar tecla Enter en fase de captura para convertirla en salto de línea si está activado
  window.addEventListener('keydown', function(event) {
    if (!window.__DSH_ENTER_NEWLINE__) return;
    if (event.key === 'Enter' || event.keyCode === 13) {
      var target = composerTargetFor(event);
      if (target) {
        // Permitir envío explícito con Ctrl+Enter o Cmd+Enter si hay teclado físico
        if (event.ctrlKey || event.metaKey) return;

        // Si ya trae shiftKey, dejar pasar normalmente
        if (event.shiftKey) return;

        // Detener inmediatamente para que Lexical/DSH no procese el evento como Submit
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        noteComposerTarget(target);
        if (target.tagName === 'TEXTAREA') {
          var start = target.selectionStart || 0;
          var end = target.selectionEnd || 0;
          target.value = target.value.substring(0, start) + '\\n' + target.value.substring(end);
          target.selectionStart = target.selectionEnd = start + 1;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }

        // En Lexical, execCommand('insertLineBreak') devuelve true pero deja el
        // editor en un nodo "\\n" y DESCARTA el borrador (verificado sobre la GUI
        // real). La ruta que si funciona es reintroducir el Enter como
        // Shift+Enter: es el salto de linea nativo de DSH y este listener lo
        // deja pasar por su guarda de shiftKey.
        try {
          var shifted = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            shiftKey: true,
            bubbles: true,
            cancelable: true
          });
          target.dispatchEvent(shifted);
        } catch(e) {
          if (document.execCommand) {
            try { document.execCommand('insertText', false, '\\n'); } catch(err) {}
          }
        }
      }
    }
  }, true);

  /**
   * Recorta el borrador para que la tarjeta deje sitio al dock encima. Se mide
   * la tarjeta REAL (data-composer-card), no la union con ancestros: con la
   * union, el dock quedaba 1-2 px sobre el borde de la tarjeta. Devuelve esa
   * tarjeta ya medida despues del recorte.
   */
  function fitClassicComposer(editor, dockHeight, gap) {
    var card = composerCardFor(editor);
    if (!card) return null;
    var scroll = findComposerScrollport();
    var cardRect = card.getBoundingClientRect();
    if (scroll) {
      var fixed = Math.max(0, cardRect.height - scroll.getBoundingClientRect().height);
      // Lo que puede medir el borrador sin que la tarjeta suba por encima del
      // dock: el campo hace scroll en vez de empujar el dock fuera.
      var above = Math.floor(cardRect.bottom - 4 - dockHeight - gap - fixed);
      setComposerScrollCap(Math.min(composerMaxHeight(), above));
    }
    return card.getBoundingClientRect();
  }

  /**
   * Modo vertical y pantallas altas: dos filas junto a la tarjeta, debajo si
   * caben y si no encima. Antes de colocar se recorta el borrador (35 % / 160
   * px) y, si aun asi el dock no cabe entero, hace scroll interno: la segunda
   * fila sigue siendo alcanzable y nunca queda recortada por el borde inferior.
   * No se oculta el dock por solape: el compositor cede, no el dock.
   */
  function positionClassicDock(dock, editor) {
    var rect = editor.getBoundingClientRect();
    if (!rect || !rect.height) { setDockDisplay(dock, false); return true; }
    // Tope base SIEMPRE (tambien si el dock cabe debajo): el borrador no puede
    // crecer mas del 35 % del alto visible ni de 160 px.
    setComposerScrollCap(composerMaxHeight());
    var gap = 8;
    var vh = visibleBottomEdge();
    var bottomLimit = vh - 4;
    // Se mide el alto NATURAL: si el tick anterior dejo el dock con scroll
    // interno, su alto recortado no sirve para recolocarlo.
    dock.style.maxHeight = '';
    dock.style.overflowY = 'visible';
    var dockHeight = dock.offsetHeight || 120;
    var card = composerCardFor(editor);
    var cardRect = card ? card.getBoundingClientRect() : composerCardRect(editor);
    var below = Math.round(cardRect.bottom + gap);
    if (below + dockHeight > bottomLimit) {
      var measured = fitClassicComposer(editor, dockHeight, gap);
      if (measured) cardRect = measured;
      below = Math.round(cardRect.bottom + gap);
    }
    var belowFits = below + dockHeight <= bottomLimit;
    var top;
    if (belowFits) {
      top = below;
      dock.style.borderRadius = '0 0 14px 14px';
      dock.style.borderTop = '1px solid var(--dshc-separator)';
      dock.style.borderBottom = 'none';
    } else {
      top = Math.max(4, Math.round(cardRect.top - dockHeight - gap));
      dock.style.borderRadius = '14px 14px 0 0';
      dock.style.borderTop = 'none';
      dock.style.borderBottom = '1px solid var(--dshc-separator)';
    }
    var room = belowFits ? bottomLimit - top : Math.max(0, Math.round(cardRect.top - gap - 4));
    var scrollable = dockHeight > room + 0.5;
    dock.style.maxHeight = scrollable ? Math.max(48, room) + 'px' : '';
    dock.style.overflowY = scrollable ? 'auto' : 'visible';
    dock.style.overflowX = scrollable ? 'hidden' : '';
    dock.style.top = top + 'px';
    dock.style.bottom = 'auto';
    // Red de seguridad: si el borrador aun cruzara el borde inferior del dock,
    // se recorta por la diferencia y se recoloca en el mismo frame.
    var sp = findComposerScrollport();
    if (sp) {
      var visibleTop = sp.getBoundingClientRect().top;
      var dockBottom = top + Math.min(dockHeight, room);
      if (visibleTop < dockBottom + gap - 0.5) {
        var newCap = sp.getBoundingClientRect().height - Math.ceil(dockBottom + gap - visibleTop);
        if (newCap >= 24 && card) {
          setComposerScrollCap(newCap);
          cardRect = card.getBoundingClientRect();
          dock.style.top = Math.max(4, Math.round(cardRect.top - dockHeight - gap)) + 'px';
        }
      }
    }
    return false;
  }

`;
