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
    { label: "Continuar", prompt: "Continua exactamente desde donde se quedo, sin repetir lo anterior." }
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
   * Se leen del puente nativo y se pueden cambiar en caliente desde Ajustes sin
   * recargar la pagina (MainActivity llama a __DSH_SET_DOCK_PREFS__).
   */
  var dockPrefs = { quick: true, keys: true };

  function readDockPrefs() {
    var prefs = { quick: true, keys: true };
    try {
      if (window.AndroidCompanion) {
        if (typeof window.AndroidCompanion.quickActionsEnabled === 'function') {
          prefs.quick = Boolean(window.AndroidCompanion.quickActionsEnabled());
        }
        if (typeof window.AndroidCompanion.codeKeysEnabled === 'function') {
          prefs.keys = Boolean(window.AndroidCompanion.codeKeysEnabled());
        }
      }
    } catch(e) {}
    return prefs;
  }

  dockPrefs = readDockPrefs();

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
    return best;
  }

`;
