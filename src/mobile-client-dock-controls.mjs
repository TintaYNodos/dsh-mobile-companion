/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */

/**
 * Controles del dock: lengueta «Mas» (abre cuando no cabe o esta plegado),
 * boton «Ocultar» del modo vertical, su colocacion y el acceso a archivos en
 * apaisado. Se separo de mobile-client-dock-ui para respetar el limite de 400
 * lineas; el cuerpo se concatena en el mismo IIFE inyectado.
 */
export const MOBILE_CLIENT_DOCK_CONTROLS = `
  /**
   * Abre el menu de adjuntar de DSH. En apaisado ocultamos su fila de
   * herramientas para ganar franja, asi que el chip «Archivo» hace ese trabajo:
   * busca el boton real del compositor (aria-label/title de adjuntar) y, si no
   * lo encuentra, pulsa el primer boton de la barra inferior del compositor.
   * Nunca abre un menu propio: el selector de archivos sigue siendo el nativo.
   */
  function dshOpenAttachMenu() {
    try {
      var editor = findEditor();
      var card = editor ? composerCardFor(editor) : null;
      if (!card) return false;
      var target = null;
      var buttons = card.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        var label = (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '');
        if (/adjunt|attach|archivo|file/i.test(label)) { target = b; break; }
      }
      if (!target) {
        var bar = card.lastElementChild;
        target = bar ? bar.querySelector('button') : null;
      }
      if (!target) return false;
      target.click();
      return true;
    } catch (e) { return false; }
  }

  /** Boton que abre el dock cuando la fila no cabe o el usuario la pliega.
   * Se coloca encima de la tarjeta, nunca sobre el campo ni los botones. */
  function ensureDockLatch() {
    var latch = document.getElementById('dsh-dock-latch');
    if (latch) return latch;
    latch = document.createElement('button');
    latch.id = 'dsh-dock-latch';
    latch.type = 'button';
    latch.className = 'dsh-chip';
    // Defecto 6: ni glifos de teclado ni sólo iconos; texto claro y corto.
    latch.textContent = 'Más';
    latch.setAttribute('aria-label', 'Abrir comandos y teclas');
    latch.style.cssText = 'position:fixed;z-index:71;left:auto;right:10px;top:auto;bottom:10px;display:none;min-height:44px;padding:0 14px;border-radius:22px;box-shadow:0 2px 10px rgba(0,0,0,0.45);';
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
    var top = Math.round(cardRect.top - COMPACT_LATCH_HEIGHT - 6);
    var limit = visibleBottomEdge() - COMPACT_LATCH_HEIGHT - 6;
    if (top > limit) top = limit;
    if (top < 4) top = 4;
    latch.style.top = top + 'px';
    latch.style.bottom = 'auto';
    latch.style.display = 'inline-flex';
    paintDockSurface(latch, editor);
  }

  /** Control compacto para plegar el dock tambien en vertical: sustituye a la
   * lengueta del apaisado, sin gastar ancho en las filas de chips. */
  function ensureDockCollapse() {
    var btn = document.getElementById('dsh-dock-collapse');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'dsh-dock-collapse';
    btn.type = 'button';
    btn.className = 'dsh-chip';
    btn.textContent = 'Ocultar';
    btn.setAttribute('aria-label', 'Ocultar comandos y teclas');
    btn.style.cssText = 'position:fixed;z-index:71;right:8px;top:auto;bottom:auto;display:none;min-height:44px;min-width:44px;padding:0 10px;border-radius:22px;box-shadow:0 2px 10px rgba(0,0,0,0.45);';
    preventFocusLoss(btn);
    btn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      haptic('tick');
      dockCompactOpen = false;
      updateComposerDockVisibility();
    };
    (document.body || document.documentElement).appendChild(btn);
    return btn;
  }

  /** Coloca el boton «Ocultar» justo encima del dock clasico (vertical), sin
   * tapar el texto ni los chips: si no cabe arriba, se ancla arriba del todo. */
  function positionDockCollapse(btn, dock, editor) {
    if (!btn) return;
    var rect = dock.getBoundingClientRect();
    var height = 44;
    var top = Math.round(rect.top - height - 6);
    var limit = visibleBottomEdge() - height - 6;
    if (top > limit) top = limit;
    if (top < 4) top = 4;
    btn.style.top = 'auto';
    btn.style.bottom = Math.max(4, Math.round(window.innerHeight - top - height)) + 'px';
    btn.style.display = 'inline-flex';
    paintDockSurface(btn, editor);
  }

`;
