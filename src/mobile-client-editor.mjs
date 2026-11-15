/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
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

  // Control de comportamiento de tecla Enter (â†µ): Salto de lÃ­nea vs Enviar mensaje.
  // Se consulta el sentido directo ("Â¿Enter envÃ­a?") cuando el puente lo ofrece:
  // asÃ­ el lado web no invierte nada y no puede quedar al revÃ©s respecto a
  // Ajustes. El mÃ©todo antiguo queda solo como respaldo.
  window.__DSH_ENTER_NEWLINE__ = true;
  try {
    var bridgeSends = null;
    if (window.AndroidCompanion && typeof window.AndroidCompanion.enterSendsMessage === 'function') {
      bridgeSends = Boolean(window.AndroidCompanion.enterSendsMessage());
    }
    if (bridgeSends !== null) {
      window.__DSH_ENTER_NEWLINE__ = !bridgeSends;
    } else if (window.AndroidCompanion && typeof window.AndroidCompanion.isEnterNewlineEnabled === 'function') {
      window.__DSH_ENTER_NEWLINE__ = Boolean(window.AndroidCompanion.isEnterNewlineEnabled());
    }
  } catch(e) {}

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
  }, true);

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

  // Interceptar tecla Enter en fase de captura para convertirla en salto de lÃ­nea si estÃ¡ activado
  window.addEventListener('keydown', function(event) {
    if (!window.__DSH_ENTER_NEWLINE__) return;
    if (event.key === 'Enter' || event.keyCode === 13) {
      var target = composerTargetFor(event);
      if (target) {
        // Permitir envÃ­o explÃ­cito con Ctrl+Enter o Cmd+Enter si hay teclado fÃ­sico
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

`;
