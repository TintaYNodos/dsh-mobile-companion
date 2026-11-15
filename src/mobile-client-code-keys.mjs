/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

/**
 * Teclas de codigo: Tab, Esc, llaves, corchetes y parentesis sobre el
 * editor activo.
 */
export const MOBILE_CLIENT_CODE_KEYS = `  function getTargetInput() {
    var active = document.activeElement;
    if (isEditableTarget(active)) return active;
    return findEditor();
  }

  function handleCodeKey(symbol) {
    haptic('tick');
    var input = getTargetInput();

    if (symbol === 'Esc') {
      if (input) {
        try {
          var escEv = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true });
          input.dispatchEvent(escEv);
          input.blur();
        } catch(e) {}
      }
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      } catch(e) {}
      return;
    }

    if (!input) return;

    var beforeText = '';
    var afterText = '';

    if (symbol === 'Tab') {
      beforeText = '  ';
    } else if (symbol === '{ }') {
      beforeText = '{ ';
      afterText = ' }';
    } else if (symbol === '[ ]') {
      beforeText = '[ ';
      afterText = ' ]';
    } else if (symbol === '( )') {
      beforeText = '( ';
      afterText = ' )';
    } else {
      beforeText = symbol;
    }

    // Se inserta como teclado real (execCommand), no manipulando el DOM del
    // editor: Lexical descarta los nodos que no inserta el mismo.
    var ok = insertIntoEditor(input, beforeText + afterText);
    if (!ok) return;

    if (!afterText) return;

    // En un textarea real la seleccion es sincrona.
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.selectionStart = input.selectionEnd = Math.max(0, input.selectionStart - afterText.length);
      return;
    }

    // Lexical confirma la insercion de forma asincrona (~10 ms): si se mueve el
    // caret en el mismo tick, la seleccion aun esta en el parrafo vacio y el
    // desplazamiento no hace nada; luego el editor deja el caret al final.
    // Por eso el retroceso se programa despues del commit.
    setTimeout(function() {
      try {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var steps = afterText.length;
        if (typeof sel.modify === 'function') {
          for (var step = 0; step < steps; step++) sel.modify('move', 'backward', 'character');
          return;
        }
        var range = sel.getRangeAt(0);
        var container = range.endContainer;
        if (container && container.nodeType === 3) {
          var offset = Math.max(0, range.endOffset - steps);
          range.setStart(container, offset);
          range.setEnd(container, offset);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch(e) {}
      if (typeof updateComposerDockVisibility === 'function') updateComposerDockVisibility();
    }, 0);
  }

`;
