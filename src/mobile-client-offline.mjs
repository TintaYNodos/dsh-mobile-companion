/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

export const MOBILE_CLIENT_OFFLINE = `  /**
   * Copia del chat para el modo sin conexion.
   *
   * El interruptor vive en \`window.__DSH_SET_OFFLINE_COPY__(boolean)\`; lo usan
   * Ajustes y las pruebas y, al apagarlo, se borra la copia guardada.
   *
   * La copia se guarda ESTRUCTURADA: una lista de mensajes {role, text, time}
   * en vez de un texto plano. Asi el lector nativo separa cada mensaje y puede
   * pintar listas, citas y bloques de codigo sin perder la estructura. El
   * formato es compatible con la copia antigua (texto plano).
   */
  var offlineCopyEnabled = false;
  window.__DSH_SET_OFFLINE_COPY__ = function(enabled) {
    offlineCopyEnabled = Boolean(enabled);
    if (!offlineCopyEnabled) {
      try { localStorage.removeItem('dsh_last_synced_chat'); } catch (e) {}
    }
    return offlineCopyEnabled;
  };
  var OFFLINE_COPY_LIMIT = 20000;
  var OFFLINE_COPY_MIN = 30;

  // --- Limpieza de texto: control, zero-width, entidades y mojibake --------
  var OFFLINE_CONTROL = /[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g;
  var OFFLINE_INVISIBLE = /[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\uFEFF]/g;
  var OFFLINE_ENTITY = /&(amp|lt|gt|quot|apos|nbsp|#\\d{1,7}|#x[0-9a-f]{1,6});/gi;
  function offlineEntityValue(body) {
    var name = String(body || '').toLowerCase();
    if (name === 'amp') return '&';
    if (name === 'lt') return '<';
    if (name === 'gt') return '>';
    if (name === 'quot') return '"';
    if (name === 'apos') return "'";
    if (name === 'nbsp') return ' ';
    if (name.charAt(0) === '#') {
      var code = name.charAt(1) === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      if (typeof code === 'number' && isFinite(code) && code > 0 && code <= 0x10FFFF) {
        try { return String.fromCodePoint(code); } catch (e) { return null; }
      }
    }
    return null;
  }
  function offlineDecodeEntities(text) {
    if (text.indexOf('&') < 0) return text;
    return text.replace(OFFLINE_ENTITY, function(all, body) {
      var value = offlineEntityValue(body);
      return value == null ? all : value;
    });
  }

  /**
   * Repara texto UTF-8 que se decodifico como ISO-8859-1 (una vocal acentuada
   * partida en dos caracteres). Solo actua si la secuencia vuelve a ser UTF-8
   * valido; si no, devuelve el texto tal cual.
   */
  function offlineRepairMojibake(text) {
    if (!/[\\u00C2-\\u00F4][\\u0080-\\u00BF]/.test(text)) return text;
    if (typeof TextDecoder !== 'function') return text;
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code > 0xFF) return text;
      bytes.push(code);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    } catch (e) {
      return text;
    }
  }
  function offlineCleanText(raw) {
    var text = String(raw == null ? '' : raw);
    text = text.replace(/\\r\\n?/g, '\\n');
    text = text.replace(OFFLINE_CONTROL, '');
    text = text.replace(OFFLINE_INVISIBLE, '');
    text = text.replace(/\\u00A0/g, ' ');
    text = offlineDecodeEntities(text);
    text = offlineRepairMojibake(text);
    text = text.replace(/[ \\t]+\\n/g, '\\n');
    text = text.replace(/\\n{3,}/g, '\\n\\n');
    return text.replace(/^\\s+|\\s+$/g, '');
  }

  // --- Lectura del DOM: un texto por mensaje, con su estructura ------------
  var OFFLINE_NOISE_TAGS = { BUTTON: 1, SVG: 1, IMG: 1, I: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, STYLE: 1, SCRIPT: 1, NOSCRIPT: 1, TEMPLATE: 1, PATH: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1 };
  var OFFLINE_NOISE_ROLES = /^(button|toolbar|menu|menuitem|tab|tablist|switch|checkbox|radio|img|presentation)$/i;
  var OFFLINE_NOISE_TOKENS = /(tool|icon|badge|chip|copy|action|button|menu|avatar)/i;
  var OFFLINE_BLOCKS = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|MAIN|UL|OL|TABLE|THEAD|TBODY|TR|FORM|FIELDSET|FIGURE|FIGCAPTION|DL|DT|DD)$/;
  function offlineSkipElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (OFFLINE_NOISE_TAGS[String(el.tagName || '').toUpperCase()]) return true;
    if (String(el.getAttribute('aria-hidden') || '').toLowerCase() === 'true') return true;
    if (OFFLINE_NOISE_ROLES.test(String(el.getAttribute('role') || ''))) return true;
    var token = String(el.getAttribute('data-testid') || '') + ' ' + String(el.getAttribute('data-tool') || '')
      + ' ' + String(el.getAttribute('class') || '');
    if (OFFLINE_NOISE_TOKENS.test(token) && !/message/i.test(token)) return true;
    return false;
  }
  function offlineAppendChildren(node, out) {
    if (!node) return;
    var children = node.childNodes || [];
    for (var i = 0; i < children.length; i++) offlineAppendNode(children[i], out);
  }
  function offlineAppendNode(node, out) {
    if (!node) return;
    if (node.nodeType === 3) {
      out.push(String(node.nodeValue || '').replace(/\\s+/g, ' '));
      return;
    }
    if (node.nodeType !== 1) return;
    var el = node;
    if (offlineSkipElement(el)) return;
    var tag = String(el.tagName || '').toUpperCase();
    if (tag === 'BR') { out.push('\\n'); return; }
    if (tag === 'PRE') {
      var code = String(el.innerText || el.textContent || '').replace(/\\r\\n?/g, '\\n').replace(/^\\n+|\\n+$/g, '');
      out.push('\\n\`\`\`\\n' + code + '\\n\`\`\`\\n');
      return;
    }
    if (tag === 'LI') { out.push('\\n- '); offlineAppendChildren(el, out); out.push('\\n'); return; }
    if (tag === 'BLOCKQUOTE') { out.push('\\n> '); offlineAppendChildren(el, out); out.push('\\n'); return; }
    if (tag === 'TD' || tag === 'TH') { out.push(' | '); offlineAppendChildren(el, out); return; }
    if (/^H[1-6]$/.test(tag)) { out.push('\\n\\n'); offlineAppendChildren(el, out); out.push('\\n\\n'); return; }
    if (OFFLINE_BLOCKS.test(tag)) { out.push('\\n'); offlineAppendChildren(el, out); out.push('\\n'); return; }
    offlineAppendChildren(el, out);
  }
  var OFFLINE_MESSAGE_SELECTORS = [
    '[data-message-role]', '[data-role="user"]', '[data-role="assistant"]',
    '[data-testid*="message"]', '[data-testid*="Message"]',
    'article[data-message-id]', '[class*="message_"]', '[class*="message-"]', '[class*="Message"]'
  ];

  /** Nodos de mensaje en orden de documento, sin los que son hijos de otro. */
  function offlineMessageNodes() {
    var found;
    try { found = document.querySelectorAll(OFFLINE_MESSAGE_SELECTORS.join(',')); } catch (e) { return []; }
    var all = [];
    for (var i = 0; i < found.length; i++) all.push(found[i]);
    var result = [];
    for (var j = 0; j < all.length; j++) {
      var nested = false;
      for (var k = 0; k < all.length; k++) {
        if (k === j || !all[k].contains) continue;
        if (all[k] !== all[j] && all[k].contains(all[j])) { nested = true; break; }
      }
      if (!nested) result.push(all[j]);
    }
    return result;
  }
  function offlineDetectRole(el) {
    var sources = [el.getAttribute('data-message-role'), el.getAttribute('data-role'), el.getAttribute('data-author-role')];
    var node = el.parentElement;
    for (var depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      sources.push(node.getAttribute('data-message-role'), node.getAttribute('data-role'));
    }
    var attr = sources.join(' ').toLowerCase();
    if (/assistant|bot|agent|model|\\bai\\b/.test(attr)) return 'assistant';
    if (/user|human|you|prompt|person/.test(attr)) return 'user';
    var cls = (String(el.className || '') + ' ' + String((el.parentElement && el.parentElement.className) || '')).toLowerCase();
    if (/assistant|agent|bot/.test(cls)) return 'assistant';
    if (/user|human|prompt/.test(cls)) return 'user';
    return 'assistant';
  }
  function offlineDetectTime(el) {
    var raw = el.getAttribute('data-time') || el.getAttribute('data-timestamp') || '';
    if (!raw) {
      var time = el.querySelector('time');
      if (time) raw = time.getAttribute('datetime') || time.getAttribute('title') || time.textContent || '';
    }
    var match = /(\\d{1,2}):(\\d{2})/.exec(String(raw).trim());
    if (!match) return '';
    return (match[1].length === 1 ? '0' + match[1] : match[1]) + ':' + match[2];
  }
  function offlineMessagesFromLegacyText() {
    var text = '';
    try {
      if (typeof window.__DSH_EXTRACT_CHAT_TEXT__ === 'function') text = window.__DSH_EXTRACT_CHAT_TEXT__();
    } catch (e) {}
    var parts = offlineCleanText(text || '').split(/\\n*---\\n*/);
    var messages = [];
    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i].trim();
      if (!chunk) continue;
      var role = /^###\\s*(Usuario|User)/i.test(chunk) ? 'user' : 'assistant';
      chunk = offlineCleanText(chunk.replace(/^###[^\\n]*\\n*/, ''));
      if (chunk) messages.push({ role: role, text: chunk, time: '' });
    }
    return messages;
  }

  /** Lista [{role, text, time}] leida del chat abierto. */
  function offlineExtractMessages() {
    try {
      if (typeof window.__DSH_EXTRACT_CHAT_MESSAGES__ === 'function') {
        var external = window.__DSH_EXTRACT_CHAT_MESSAGES__();
        if (external && external.length) return external;
      }
    } catch (e) {}
    var nodes = offlineMessageNodes();
    var messages = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var text = '';
      try {
        var out = [];
        offlineAppendChildren(el, out);
        text = offlineCleanText(out.join(''));
      } catch (e) { text = ''; }
      if (text.length < 2) text = offlineCleanText(el.innerText || el.textContent || '');
      if (text.length < 2) continue;
      messages.push({ role: offlineDetectRole(el), text: text, time: offlineDetectTime(el) });
    }
    return messages.length ? messages : offlineMessagesFromLegacyText();
  }

  /** Recorta al tope por MENSAJES COMPLETOS, conservando los mas recientes. */
  function offlineClampMessages(messages, limit) {
    var kept = [];
    if (!messages || !messages.length) return kept;
    var total = 0;
    for (var i = messages.length - 1; i >= 0; i--) {
      var item = messages[i];
      if (!item || !item.text) continue;
      var size = item.text.length + (kept.length ? 1 : 0);
      if (total + size > limit) break;
      total += size;
      kept.unshift({ role: item.role, text: item.text, time: item.time || '' });
    }
    if (!kept.length) {
      var last = null;
      for (var j = messages.length - 1; j >= 0; j--) {
        if (messages[j] && messages[j].text) { last = messages[j]; break; }
      }
      if (last) {
        var tail = last.text.slice(-limit);
        if (tail.length && /[\\uDC00-\\uDFFF]/.test(tail.charAt(0))) tail = tail.slice(1);
        kept.push({ role: last.role, text: tail, time: last.time || '' });
      }
    }
    return kept;
  }
  function offlineMessagesPlain(messages) {
    var lines = [];
    for (var i = 0; i < messages.length; i++) {
      var item = messages[i];
      if (!item || !item.text) continue;
      lines.push((item.role === 'user' ? 'Tú: ' : 'Agente: ') + item.text);
    }
    return lines.join('\\n\\n');
  }

  // --- Envio al lector nativo cifrado -------------------------------------

  /**
   * Llama a un metodo del puente con el nonce y, si falla, rearma una vez.
   * Devuelve false tambien si el APK no trae el metodo (compatibilidad).
   */
  function offlineCallNative(method, args) {
    if (callBridgeWithToken(method, args)) return true;
    var nonce = rearmBridgeForCall();
    var bridge = window.AndroidCompanion;
    if (!nonce || !bridge || typeof bridge[method] !== 'function') return false;
    try {
      return bridge[method].apply(bridge, [nonce].concat(args)) !== false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Manda la copia estructurada (y el texto plano de respaldo). Si el APK no
   * tiene \`saveOfflineChatStructured\` se usa el metodo antiguo, que guarda el
   * texto plano; siempre fail-closed sin nonce.
   */
  function sendOfflineChatToNative(title, text, messages, updatedAt) {
    if (!offlineCopyEnabled) return false;
    var messagesJson = '[]';
    try { messagesJson = JSON.stringify(messages || []); } catch (e) { messagesJson = '[]'; }
    if (offlineCallNative('saveOfflineChatStructured', [title, text, messagesJson, updatedAt])) return true;
    return offlineCallNative('saveOfflineChat', [title, text, updatedAt]);
  }
  function offlineCaptureStatus(ok, reason, chars) {
    return { ok: Boolean(ok), reason: reason, chars: chars || 0 };
  }

  /** Guarda la copia en localStorage y en el lector nativo cifrado. */
  function captureLastChat() {
    if (!offlineCopyEnabled) return offlineCaptureStatus(false, 'disabled', 0);
    var messages = offlineClampMessages(offlineExtractMessages(), OFFLINE_COPY_LIMIT);
    var text = offlineMessagesPlain(messages);
    if (!text || !text.trim()) return offlineCaptureStatus(false, 'no-chat', 0);
    if (text.length <= OFFLINE_COPY_MIN) return offlineCaptureStatus(false, 'too-short', text.length);
    var title = offlineCleanText(cleanDocTitle()) || 'Conversacion reciente';
    var updatedAt = new Date().toISOString();
    var stored = false;
    try {
      localStorage.setItem('dsh_last_synced_chat', JSON.stringify({
        title: title,
        text: text,
        messages: messages,
        updatedAt: updatedAt
      }));
      stored = true;
    } catch (e) {}
    if (sendOfflineChatToNative(title, text, messages, updatedAt)) {
      return offlineCaptureStatus(true, 'saved', text.length);
    }
    return offlineCaptureStatus(false, stored ? 'no-encryption' : 'storage', text.length);
  }
  function cacheLastChat() {
    try {
      captureLastChat();
    } catch (e) {}
  }

  /** Captura forzada desde Ajustes («Guardar ahora»). */
  window.__DSH_CAPTURE_CHAT_NOW__ = function() {
    try {
      var result = captureLastChat();
      return result.ok ? 'ok' : result.reason;
    } catch (e) {
      return 'error';
    }
  };
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') cacheLastChat();
  });
  window.addEventListener('pagehide', cacheLastChat);
  // La visibilidad del dock se reevalua al enfocar, al redimensionar y en el
  // tick del planificador, por si el WebView no emite visibilitychange.
  document.addEventListener('focusin', updateComposerDockVisibility, true);
  document.addEventListener('focusout', function() {
    setTimeout(updateComposerDockVisibility, 60);
  }, true);
  window.addEventListener('resize', updateComposerDockVisibility);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', updateComposerDockVisibility);
  }

  /**
   * P53: un unico planificador periodico de 500 ms (2 Hz). Antes habia cuatro
   * temporizadores solapados; las demas tareas se reparten por su intervalo
   * dentro del mismo tick y no se anade ningun otro temporizador periodico.
   */
  var SCHEDULER_TICK_MS = 500;
  var schedulerStartedAt = Date.now();
  var SCHEDULED_TASKS = [
    { name: 'dock-visibility', every: 500, lastRun: schedulerStartedAt, run: updateComposerDockVisibility },
    { name: 'preview-tabs', every: 1000, lastRun: schedulerStartedAt, run: checkPreviewTabs },
    { name: 'ensure-dock', every: 1500, lastRun: schedulerStartedAt, run: ensureComposerDock },
    { name: 'check-state', every: 2500, lastRun: schedulerStartedAt, run: checkState },
    { name: 'arm-bridge', every: 500, lastRun: schedulerStartedAt, run: ensureBridgeArmed }
  ];
  function runScheduledTasks() {
    var now = Date.now();
    for (var i = 0; i < SCHEDULED_TASKS.length; i++) {
      var task = SCHEDULED_TASKS[i];
      if (now - task.lastRun < task.every) continue;
      task.lastRun = now;
      try {
        task.run();
      } catch (e) {
        console.error('[companion] Error en tarea programada ' + task.name + ':', e);
      }
    }
  }
  setInterval(runScheduledTasks, SCHEDULER_TICK_MS);
`;
