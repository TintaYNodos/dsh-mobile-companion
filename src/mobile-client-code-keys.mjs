/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Catalogo aprobado de comandos rapidos y teclas de codigo: seleccion de los
 * 4 chips del dock (el resto detras de "+"), hoja inferior agrupada con
 * descripcion y toque para insertar, y manejo de teclas. El perfil y los ids
 * activos llegan de Ajustes por __DSH_SET_DOCK_PREFS__; sin APK se usan los
 * valores por defecto.
 */
export const MOBILE_CLIENT_CODE_KEYS = `  // Catalogo unico: id estable, grupo y prompt con imperativo, alcance,
  // formato y limite explicito. Notas va siempre y no se desactiva.
  var QUICK_COMMANDS = [
    { id: 'escena', grupo: 'escritura', label: 'Escena', desc: 'Redacta una escena del proyecto con límite de palabras.', prompt: 'Escribe una escena narrativa del proyecto actual, en español, con un solo escenario y máximo 300 palabras.' },
    { id: 'dialogo', grupo: 'escritura', label: 'Diálogo', desc: 'Escribe un diálogo breve entre personajes del proyecto.', prompt: 'Escribe un diálogo entre dos personajes del proyecto actual, en español, sin descripciones y con máximo 12 intervenciones.' },
    { id: 'estilo', grupo: 'escritura', label: 'Estilo', desc: 'Revisa repeticiones y estilo del texto anterior.', prompt: 'Revisa el estilo del texto anterior, en español, señala solo repeticiones y frases largas y da máximo 5 correcciones concretas.' },
    { id: 'fuentes', grupo: 'escritura', label: 'Fuentes', desc: 'Propone fuentes verificables para el tema actual.', prompt: 'Propone hasta 3 fuentes documentales verificables para el tema anterior, con formato autor, título y año, y sin inventar referencias.' },
    { id: 'coherencia', grupo: 'escritura', label: 'Coherencia', desc: 'Detecta contradicciones con el resto del proyecto.', prompt: 'Revisa la coherencia del texto anterior con el resto del proyecto, en español, y lista máximo 5 contradicciones concretas.' },
    { id: 'auditar', grupo: 'codigo', label: 'Auditar', desc: 'Busca vulnerabilidades y casos límite en el código.', prompt: 'Audita el código anterior buscando vulnerabilidades, casos límite y optimizaciones; responde en español con máximo 5 hallazgos priorizados.' },
    { id: 'explicar', grupo: 'codigo', label: 'Explicar', desc: 'Explica el contenido anterior con ejemplos breves.', prompt: 'Explica el funcionamiento del contenido anterior, en español, con ejemplos breves y máximo 400 palabras.' },
    { id: 'pruebas', grupo: 'codigo', label: 'Pruebas', desc: 'Genera pruebas unitarias y casos límite del código.', prompt: 'Escribe pruebas unitarias y casos límite para el código anterior; responde en español con el código completo y máximo 3 archivos.' },
    { id: 'depurar', grupo: 'codigo', label: 'Depurar', desc: 'Encuentra la causa del error y el arreglo mínimo.', prompt: 'Depura el error del código anterior: identifica la causa, aplica el arreglo mínimo y responde en español con máximo 5 pasos.' },
    { id: 'diseno', grupo: 'codigo', label: 'Diseño', desc: 'Propone componentes y estados para una pantalla.', prompt: 'Propone un diseño de interfaz para la pantalla descrita, en español, con jerarquía, estados y máximo 6 componentes.' },
    { id: 'continuar', grupo: 'trabajo', label: 'Continuar', desc: 'Sigue desde donde se quedó sin repetir nada.', prompt: 'Continúa exactamente desde donde se quedó, sin repetir lo anterior; responde en español y con máximo 600 palabras.' },
    { id: 'pendientes', grupo: 'trabajo', label: 'Pendientes', desc: 'Lista los pendientes abiertos del proyecto.', prompt: 'Lista los pendientes abiertos del proyecto actual, en español, en formato de lista y con máximo 10 elementos.' },
    { id: 'notas', grupo: 'trabajo', label: 'Notas', desc: 'Revisa tus notas del teléfono. Siempre visible.', prompt: 'Revisa mis notas del teléfono en companion/synced_chats/notes/INDICE.md, abre solo las notas relevantes y responde en español con máximo 6 líneas.' }
  ];
  var QUICK_GROUPS = { escritura: 'Escribir', codigo: 'Código', trabajo: 'Trabajo' };
  var QUICK_DEFAULT_ESCRITURA = ['escena', 'estilo', 'fuentes', 'continuar'];
  var QUICK_DEFAULT_CODIGO = ['auditar', 'explicar', 'pruebas', 'continuar'];
  var QUICK_BY_ID = {};
  QUICK_COMMANDS.forEach(function(cmd) { QUICK_BY_ID[cmd.id] = cmd; });

  function dshQuickDefaults(perfil) { return (perfil === 'codigo' ? QUICK_DEFAULT_CODIGO : QUICK_DEFAULT_ESCRITURA).slice(); }

  function dshNormalizeActive(ids) {
    var out = [];
    (ids || []).forEach(function(id) {
      if (id === 'notas' || !QUICK_BY_ID[id] || out.indexOf(id) >= 0) return;
      out.push(id);
    });
    return out;
  }

  // Orden pedido: activos, luego Continuar y al final Notas (fija). Se pintan
  // 4 y el resto va a la hoja inferior del chip "+"; Notas no cuenta. Con
  // perfil "auto" y la lista por defecto de escritura manda el uso real.
  function dshQuickChips() {
    var active = dshNormalizeActive(dockPrefs.activos);
    if (dockPrefs.perfil === 'auto' && active.join(',') === QUICK_DEFAULT_ESCRITURA.join(',')) {
      active = dshQuickDefaults(dshUsageProfile());
    }
    var ordered = active.filter(function(id) { return id !== 'continuar'; });
    if (active.indexOf('continuar') >= 0) ordered.push('continuar');
    return { visible: ordered.slice(0, 4), overflow: ordered.slice(4) };
  }

  // Perfil efectivo: con "auto" manda el grupo mas usado; sin uso, escritura.
  function dshUsageBump(grupo) {
    if (grupo !== 'escritura' && grupo !== 'codigo') return;
    try { var key = 'dshc-use-' + grupo; localStorage.setItem(key, String((parseInt(localStorage.getItem(key), 10) || 0) + 1)); } catch (e) {}
  }

  function dshUsageProfile() {
    try {
      var escritura = parseInt(localStorage.getItem('dshc-use-escritura'), 10) || 0;
      var codigo = parseInt(localStorage.getItem('dshc-use-codigo'), 10) || 0;
      if (codigo > escritura) return 'codigo';
    } catch (e) {}
    return 'escritura';
  }

  function dshEffectiveProfile() {
    return (dockPrefs.perfil === 'codigo' || dockPrefs.perfil === 'escritura') ? dockPrefs.perfil : dshUsageProfile();
  }

  // Teclas del catalogo aprobado: text/par escriben; event/action no escriben.
  var CODE_KEY_CATALOG = [
    { id: 'tab', label: 'Tab', kind: 'text', text: '  ', desc: 'Sangría de dos espacios.' },
    { id: 'esc', label: 'Esc', kind: 'event', event: 'Escape', desc: 'Envía Escape sin cerrar el teclado.' },
    { id: 'pair.brace', label: '{ }', kind: 'pair', before: '{ ', after: ' }', desc: 'Inserta llaves y deja el cursor dentro.' },
    { id: 'pair.bracket', label: '[ ]', kind: 'pair', before: '[ ', after: ' ]', desc: 'Inserta corchetes y deja el cursor dentro.' },
    { id: 'pair.paren', label: '( )', kind: 'pair', before: '( ', after: ' )', desc: 'Inserta paréntesis y deja el cursor dentro.' },
    { id: 'slash', label: '/', kind: 'text', text: '/', desc: 'Barra inclinada.' },
    { id: 'tick', label: '\`', kind: 'text', text: '\`', desc: 'Acento grave.' },
    { id: 'underscore', label: '_', kind: 'text', text: '_', desc: 'Guion bajo.' },
    { id: 'pipe', label: '|', kind: 'text', text: '|', desc: 'Barra vertical.' },
    { id: 'tilde', label: '~', kind: 'text', text: '~', desc: 'Virgulilla.' },
    { id: 'squote', label: "'", kind: 'text', text: "'", desc: 'Comilla simple.' },
    { id: 'dquote', label: '"', kind: 'text', text: '"', desc: 'Comilla doble.' },
    { id: 'equals', label: '=', kind: 'text', text: '=', desc: 'Signo igual.' },
    { id: 'colon', label: ':', kind: 'text', text: ':', desc: 'Dos puntos.' },
    { id: 'semicolon', label: ';', kind: 'text', text: ';', desc: 'Punto y coma.' },
    { id: 'arrows', label: '←', kind: 'event', event: 'ArrowLeft', desc: 'Mueve el cursor a la izquierda.' },
    { id: 'ctrl', label: 'Ctrl', kind: 'event', event: 'Control', desc: 'Envía Control sin cerrar el teclado.' },
    { id: 'alt', label: 'Alt', kind: 'event', event: 'Alt', desc: 'Envía Alt sin cerrar el teclado.' },
    { id: 'comments', label: '//', kind: 'text', text: '// ', desc: 'Comentario de línea.' },
    { id: 'arrow.fn', label: '=>', kind: 'text', text: ' => ', desc: 'Flecha de función.' },
    // El signo dolar va con fromCharCode: este catalogo viaja dentro del
    // reemplazo de String.replace que arma el HTML (mobile.mjs) y un literal
    // del signo seguido de comilla simple truncaria todo el script inyectado.
    { id: 'dollar', label: String.fromCharCode(36), kind: 'text', text: String.fromCharCode(36), desc: 'Signo de dólar.' },
    { id: 'hash', label: '#', kind: 'text', text: '#', desc: 'Numeral.' },
    { id: 'amp', label: '&', kind: 'text', text: '&', desc: 'Ampersand.' },
    { id: 'percent', label: '%', kind: 'text', text: '%', desc: 'Porcentaje.' },
    { id: 'star', label: '*', kind: 'text', text: '*', desc: 'Asterisco.' },
    { id: 'plus', label: '+', kind: 'text', text: '+', desc: 'Signo más.' },
    { id: 'minus', label: '-', kind: 'text', text: '-', desc: 'Signo menos.' },
    { id: 'backslash', label: '\\\\', kind: 'text', text: '\\\\', desc: 'Barra invertida.' },
    { id: 'copy', label: 'Copiar', kind: 'action', action: 'copy', desc: 'Copia la selección al portapapeles.' },
    { id: 'paste', label: 'Pegar', kind: 'action', action: 'paste', desc: 'Pega el portapapeles si el sistema lo permite.' },
    { id: 'undo', label: 'Deshacer', kind: 'action', action: 'undo', desc: 'Deshace el último cambio.' },
    { id: 'newline', label: '⏎', kind: 'action', action: 'newline', desc: 'Inserta un salto de línea.' }
  ];
  var KEY_KIND_LABELS = { pair: 'Pares', text: 'Símbolos', event: 'Eventos', action: 'Edición' };
  var KEY_PROFILES = { escritura: ['dquote', 'squote', 'underscore', 'minus', 'colon', 'semicolon'],
    codigo: ['tab', 'esc', 'pair.brace', 'pair.bracket', 'pair.paren', 'slash', 'tick', 'underscore'] };
  var CODE_KEY_BY_ID = {};
  CODE_KEY_CATALOG.forEach(function(entry) { CODE_KEY_BY_ID[entry.id] = entry; });

  function dshKeyChips() {
    var visible = (KEY_PROFILES[dshEffectiveProfile()] || KEY_PROFILES.escritura).filter(function(id) {
      return Boolean(CODE_KEY_BY_ID[id]);
    });
    var overflow = CODE_KEY_CATALOG.map(function(entry) { return entry.id; }).filter(function(id) {
      return visible.indexOf(id) < 0;
    });
    return { visible: visible, overflow: overflow };
  }

  function getTargetInput() {
    var active = document.activeElement;
    if (isEditableTarget(active)) return active;
    return findEditor();
  }

  function dispatchKey(target, type, key, code, keyCode, mods) {
    if (!target) return;
    var init = { key: key, code: code, keyCode: keyCode, which: keyCode, bubbles: true, cancelable: true };
    if (mods) {
      init.ctrlKey = Boolean(mods.ctrl);
      init.altKey = Boolean(mods.alt);
      init.shiftKey = Boolean(mods.shift);
    }
    try { target.dispatchEvent(new KeyboardEvent(type, init)); } catch(e) {}
  }

  function selectedText(input) {
    try {
      if (input && (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT')) return String(input.value || '').slice(input.selectionStart, input.selectionEnd);
      return String(window.getSelection ? window.getSelection() : '');
    } catch(e) { return ''; }
  }

  function copySelection(input) {
    var text = selectedText(input);
    if (!text) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text);
        return;
      }
    } catch(e) {}
    callBridgeWithToken('copyToClipboard', [text]);
  }

  function pasteClipboard(input) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        navigator.clipboard.readText().then(function(text) {
          if (text) insertIntoEditor(input || findEditor(), text);
        }).catch(function() {});
      }
    } catch(e) {}
  }

  function insertPair(input, entry) {
    var before = entry.before || '';
    var after = entry.after || '';
    if (!insertIntoEditor(input, before + after)) return;
    if (!after) return;
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.selectionStart = input.selectionEnd = Math.max(0, input.selectionStart - after.length);
      return;
    }
    // Lexical confirma la insercion de forma asincrona: el retroceso del caret
    // se programa despues del commit, como se verifico con el par { }.
    setTimeout(function() {
      try {
        var sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        var steps = after.length;
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

  function handleCodeKey(id) {
    var entry = CODE_KEY_BY_ID[id];
    if (!entry) return;
    haptic('tick');
    dshUsageBump('codigo');
    var input = getTargetInput();
    if (entry.kind === 'action') {
      if (entry.action === 'copy') { copySelection(input); return; }
      if (entry.action === 'paste') { pasteClipboard(input); return; }
      if (entry.action === 'undo') {
        dispatchKey(input || document.activeElement, 'keydown', 'z', 'KeyZ', 90, { ctrl: true });
        return;
      }
      // "⏎" viaja como Shift+Enter (salto de linea nativo de Lexical).
      if (input) {
        dispatchKey(input, 'keydown', 'Enter', 'Enter', 13, { shift: true });
        dispatchKey(input, 'keyup', 'Enter', 'Enter', 13, { shift: true });
      } else {
        insertIntoEditor(findEditor(), '\\n');
      }
      return;
    }
    if (entry.kind === 'event') {
      // Sin blur ni foco sintetico: la composicion y el teclado siguen vivos.
      dispatchKey(input, 'keydown', entry.event, entry.event, 0);
      dispatchKey(input, 'keyup', entry.event, entry.event, 0);
      return;
    }
    if (entry.kind === 'pair') { insertPair(input, entry); return; }
    insertIntoEditor(input, entry.text || '');
  }

  function dshChipButton(label, aria, extraCss, onClick) {
    return compactButton(label, extraCss, function(e) { e.preventDefault(); e.stopPropagation(); onClick(); }, aria);
  }

  function dshInsertQuick(cmd) {
    haptic('confirm');
    dshUsageBump(cmd.grupo);
    if (window.__DSH_INSERT_INTO_COMPOSER__) window.__DSH_INSERT_INTO_COMPOSER__(cmd.prompt);
  }

  function dshRenderQuickChips(container, compact) {
    var chips = dshQuickChips();
    var notas = QUICK_BY_ID.notas;
    var css = compact ? 'font-size:11.5px;padding:0 9px;' : 'border-radius:15px;padding:0 12px;';
    container.textContent = '';
    chips.visible.forEach(function(id) {
      var cmd = QUICK_BY_ID[id];
      container.appendChild(dshChipButton(cmd.label, cmd.label + ': ' + cmd.desc, css, function() { dshInsertQuick(cmd); }));
    });
    if (chips.overflow.length) {
      container.appendChild(dshChipButton('+', 'Más comandos', 'min-width:34px;padding:0 9px;font-weight:700;', function() {
        dshOpenSheet('comandos', chips.overflow);
      }));
    }
    container.appendChild(dshChipButton(notas.label, notas.label + ': ' + notas.desc, css, function() {
      dshInsertQuick(notas);
    }));
  }

  function dshRenderKeyChips(container, compact) {
    var chips = dshKeyChips();
    var css = (compact ? 'min-width:34px;padding:0 8px;' : 'flex:1 1 0;min-width:0;min-height:32px;')
      + 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;';
    container.textContent = '';
    chips.visible.forEach(function(id) {
      var entry = CODE_KEY_BY_ID[id];
      container.appendChild(dshChipButton(entry.label, 'Tecla ' + entry.label + ': ' + entry.desc, css, function() {
        handleCodeKey(id);
      }));
    });
    if (chips.overflow.length) {
      container.appendChild(dshChipButton('+', 'Más teclas', 'min-width:34px;padding:0 8px;font-weight:700;', function() {
        dshOpenSheet('teclas', chips.overflow);
      }));
    }
  }

  var dshChipsSignature = '';
  /**
   * Repinta los chips solo si cambio el perfil, los activos o el perfil
   * efectivo; las filas nuevas (dock recreado por DSH) tambien se repintan.
   */
  function dshRefreshDockChips() {
    var rows = [['dsh-quick-actions', false], ['dsh-code-keys', false], ['dsh-compact-quick', true], ['dsh-compact-keys', true]];
    var signature = [dockPrefs.perfil, dshEffectiveProfile(), dshNormalizeActive(dockPrefs.activos).join(',')].join('|');
    var stale = signature !== dshChipsSignature;
    rows.forEach(function(row) {
      var container = document.getElementById(row[0]);
      if (container && container.childElementCount === 0) stale = true;
    });
    if (!stale) return;
    dshChipsSignature = signature;
    rows.forEach(function(row) {
      var container = document.getElementById(row[0]);
      if (!container) return;
      if (row[0].indexOf('quick') >= 0) dshRenderQuickChips(container, row[1]);
      else dshRenderKeyChips(container, row[1]);
    });
  }

  var dshSheetNode = null;
  function dshCloseSheet() {
    try { if (dshSheetNode) dshSheetNode.remove(); } catch(e) {}
    dshSheetNode = null;
  }
  function dshSheetItem(label, desc, action) {
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'dsh-sheet-item';
    item.textContent = label + ' — ' + desc;
    item.setAttribute('aria-label', label + '. ' + desc);
    preventFocusLoss(item);
    item.onclick = function(e) { e.preventDefault(); e.stopPropagation(); action(); };
    return item;
  }
  function dshSheetGroup(sheet, title, entries, onPick) {
    if (!entries.length) return;
    var heading = document.createElement('div');
    heading.className = 'dsh-sheet-group';
    heading.textContent = title;
    sheet.appendChild(heading);
    entries.forEach(function(entry) {
      sheet.appendChild(dshSheetItem(entry.label, entry.desc, function() { onPick(entry); }));
    });
  }
  /**
   * Hoja inferior del chip "+": comandos agrupados Escribir/Codigo/Trabajo o
   * las teclas que no caben. Cada fila mide 48 dp y su aria-label lleva la
   * descripcion. No se lleva el foco al dialogo: el teclado no se cierra.
   */
  function dshOpenSheet(kind, ids) {
    dshCloseSheet();
    var overlay = document.createElement('div');
    overlay.id = 'dsh-quick-sheet';
    overlay.className = 'dsh-sheet-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', kind === 'teclas' ? 'Más teclas' : 'Más comandos');
    overlay.style.cssText = 'position:fixed;left:0;right:0;top:0;bottom:0;z-index:12000;display:flex;align-items:flex-end;background:rgba(0,0,0,0.42);';
    var sheet = document.createElement('div');
    sheet.className = 'dsh-sheet';
    sheet.setAttribute('role', 'document');
    var title = document.createElement('div');
    title.className = 'dsh-sheet-title';
    title.textContent = kind === 'teclas' ? 'Más teclas' : 'Más comandos';
    sheet.appendChild(title);
    overlay.appendChild(sheet);
    dshSheetNode = overlay;
    if (kind === 'teclas') {
      ['pair', 'text', 'event', 'action'].forEach(function(category) {
        var entries = CODE_KEY_CATALOG.filter(function(entry) {
          return ids.indexOf(entry.id) >= 0 && entry.kind === category;
        });
        dshSheetGroup(sheet, KEY_KIND_LABELS[category], entries, function(entry) {
          dshCloseSheet();
          handleCodeKey(entry.id);
        });
      });
    } else {
      ['escritura', 'codigo', 'trabajo'].forEach(function(grupo) {
        var entries = ids.map(function(id) { return QUICK_BY_ID[id]; }).filter(function(entry) {
          return entry && entry.grupo === grupo;
        });
        dshSheetGroup(sheet, QUICK_GROUPS[grupo], entries, function(entry) {
          dshCloseSheet();
          dshInsertQuick(entry);
        });
      });
    }
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'dsh-sheet-item';
    close.textContent = 'Cerrar';
    close.setAttribute('aria-label', 'Cerrar la hoja');
    close.onclick = function(e) { e.preventDefault(); e.stopPropagation(); dshCloseSheet(); };
    sheet.appendChild(close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) dshCloseSheet(); });
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); dshCloseSheet(); }
    });
    (document.body || document.documentElement).appendChild(overlay);
  }

`;
