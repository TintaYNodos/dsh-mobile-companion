/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
export const MOBILE_STYLES = `
/*
 * Regla de esta hoja: NO se redefine la geometría de los componentes de DSH.
 *
 * DSH coloca sus menús, listas y paneles con CSS Anchor Positioning y CSS
 * Modules (por ejemplo ModelSelect.module.css declara
 * "position: fixed; position-anchor: ...; bottom: calc(anchor(top) + 8px)").
 * Cualquier "position/inset/overflow" con !important sobre un comodín de clase
 * parcial (del estilo "toda clase que contenga menu") anula ese cálculo y deja
 * el menú clavado en la parte superior de la pantalla, descolgado de su botón.
 * Aquí solo se corrige lo que es propio del móvil: área táctil, desbordes y las
 * vistas propias del Companion (temas Ink y modo libro).
 */
:root {
  --dshc-safe-top: env(safe-area-inset-top, 0px);
  --dshc-safe-right: env(safe-area-inset-right, 0px);
  --dshc-safe-bottom: env(safe-area-inset-bottom, 0px);
  --dshc-safe-left: env(safe-area-inset-left, 0px);
}

/* "clip" recorta el desborde lateral sin crear un contenedor de scroll: con
   "hidden" se rompen position:sticky y la compensación de scroll de anchor(). */
html {
  overflow-x: clip;
}

body {
  margin: 0;
  min-height: 100dvh;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  touch-action: manipulation;
}

*, *::before, *::after {
  -webkit-tap-highlight-color: transparent;
}

button, [role="button"], a, input, select, textarea {
  touch-action: manipulation;
}

/* Contención del overscroll en los scrollers internos de DSH. :where() deja la
   especificidad en cero y solo añade una propiedad: no altera geometría. */
:where([class*="_groups"], [class*="_list"], [class*="_paneBody"], [class*="_scrollable_"]) {
  overscroll-behavior: contain;
}

/* Solo el contenido de los mensajes se limita al ancho disponible. No se toca
   img/svg global: los iconos de DSH se dimensionan por atributo y un
   "height: auto" los colapsa. */
article img,
[class*="markdown"] img,
[class*="message"] img,
[class*="attachment"] img {
  max-width: 100%;
  height: auto;
}

/* Objetivo táctil mínimo en filas de menú desplegable. No mueve el menú: solo
   garantiza 44px de alto por fila, que es el mínimo recomendado con el dedo. */
@media (pointer: coarse) {
  [role="menuitem"],
  [role="menuitemcheckbox"],
  [role="menuitemradio"],
  [role="option"] {
    min-height: 44px;
  }
}

body:not([data-ds-dark-theme]),
html[data-theme="light"],
html.light,
body.light {
  color-scheme: light;
}

body:not([data-ds-dark-theme]) {
  background-color: var(--dsw-alias-bg-base, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
}

body[data-ds-dark-theme] {
  color-scheme: dark;
  background-color: var(--dsw-alias-bg-base, #151517);
  color: var(--dsw-alias-label-primary, #e6edf3);
}

/* Modo Tablet, Plegables y Pantallas Grandes (>= 600px y >= 768px).
   Solo se limita el ancho del contenido; el compositor de DSH se mide solo y
   no se redimensiona desde aquí. */
@media (min-width: 600px) {
  [class*="chat"], [class*="conversation"], article, .message {
    max-width: min(880px, 92vw) !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
}

@media (min-width: 768px) {
  [class*="chat"], [class*="conversation"], article, .message {
    max-width: min(960px, 90vw) !important;
  }
}

/* Modo Apaisado / Horizontal en Smartphones con Altura Reducida.
   El compositor, el sidebar y el panel derecho se dimensionan para vertical y
   en 360dp de alto dejan el textarea tapado (HOJA_ERRORES_CAPTURAS.md:65-110).
   Aquí se contiene el overscroll y se aplica el Plan 2 de esa hoja SOLO bajo
   esta media query: portrait no se toca. */
@media (orientation: landscape) and (max-height: 520px) {
  :where([class*="_groups"], [class*="_paneBody"]) {
    overscroll-behavior: contain;
  }

  /* ==================================================================
     H-14 · Bloque delimitado: adaptación de landscape en teléfono.
     Implementa el Plan 2 de HOJA_ERRORES_CAPTURAS.md (líneas 161-214):
     sidebar como drawer, panel derecho modal, compositor compacto y menú
     trigger con max-height corto.

     Del propuesto se omiten a propósito los selectores genéricos 'aside' y
     'aside:last-of-type': son demasiado amplios y podrían fijar como modal un
     panel de DSH que no es el de herramientas (el propio encabezado de esta
     hoja advierte de no redefinir geometría por comodines de clase). Se usan
     solo ganchos de clase/atributo específicos.

     NO VERIFICABLE sin dispositivo: hay que probarlo en un teléfono real en
     horizontal con el teclado abierto (capturas 02-07 de la hoja). Si DSH
     cambia sus nombres de clase, estos overrides dejan de aplicar y no rompen
     nada.
     ================================================================== */

  /* Sidebar izquierdo: drawer emergente, nunca columna fija que estrangule
     el chat (capturas 04 y 05). */
  [class*="_sidebar_"], [data-sidebar] {
    position: fixed !important;
    top: 0 !important;
    bottom: 0 !important;
    left: -100% !important;
    width: min(320px, 80vw) !important;
    z-index: 10050 !important;
    transition: left 0.25s ease-in-out !important;
  }
  [class*="_sidebar_"][data-expanded="true"],
  [data-sidebar][data-expanded="true"] {
    left: 0 !important;
  }

  /* Panel derecho de herramientas: modal superpuesto en vez de tercera
     columna cortada por el borde (captura 06). */
  [class*="_right_panel_"], [class*="_tool_panel_"] {
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: min(340px, 85vw) !important;
    z-index: 10040 !important;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.3) !important;
  }

  /* Compositor en apaisado con teclado (lo marca el cliente al detectarlo).
     La franja util baja a ~70-100 px y el asiento del compositor es sticky al
     fondo: si la pila mide mas que el scroller se recorta por ARRIBA y el
     campo de texto (lo primero de la tarjeta) desaparece aunque la fila de
     botones se siga viendo. Se compacta a una linea de escritura + botones y
     se oculta la fila de estadisticas de DSH, que es lo unico prescindible. */
  html[data-dshc-keyboard="1"] [data-composer-dock] {
    display: none !important;
  }
  html[data-dshc-keyboard="1"] [data-composer-card] {
    padding-top: 2px !important;
    gap: 6px !important;
  }
  html[data-dshc-keyboard="1"] [data-composer-card] > :last-child {
    padding: 0 6px !important;
  }
  /* Botones (+, modelo, enviar) a 28 px: la fila y la tarjeta bajan de alto. */
  html[data-dshc-keyboard="1"] [data-composer-card] > :last-child button {
    width: 28px !important;
    height: 28px !important;
    min-height: 28px !important;
    transform: none !important;
  }
  /* El scrollport del borrador es el unico tope: ~una linea visible y el resto
     se desplaza dentro (DSH revela el caret). Asi el texto no empuja la
     tarjeta fuera de la franja; el cliente afina el alto segun el hueco real. */
  html[data-dshc-keyboard="1"] [data-input-scroll] {
    max-height: 30px !important;
  }
  html[data-dshc-keyboard="1"] [data-composer-input] {
    min-height: 24px !important;
    padding-top: 0 !important;
    overscroll-behavior: contain;
  }
  /* Miniaturas de adjuntos en fila mínima para no comerse el alto útil. */
  [class*="thumbnail"], [class*="attachment_preview"], [class*="preview_card"] {
    max-height: 36px !important;
    max-width: 36px !important;
  }

  /* Menú trigger / slash: no debe invadir cabecera y pestañas (captura 02);
     con scroll interno si hay más opciones de las que caben. */
  [data-trigger-menu], [class*="pc3rQa_menu"] {
    max-height: 120px !important;
    overflow-y: auto !important;
    bottom: calc(100% + 2px) !important;
  }
}

/* Movimiento reducido: se acortan las transiciones, pero se conservan las
   animaciones (los indicadores de "generando" son información, no adorno). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: .001ms !important;
  }
}

/* Modo Libro / E-Reader */
.ereader-mode {
  --ereader-bg: #F4ECD8;
  --ereader-ink: #2C2416;
  --ereader-line: #E2D7BE;
  --ereader-dim: #60513B;
  --ereader-user-bg: #EAE0C8;
}

.ereader-mode.ereader-dark,
.ereader-mode[data-reader-theme="dark"],
body[data-ds-dark-theme] .ereader-mode:not([data-reader-theme="sepia"]) {
  --ereader-bg: #1A1815;
  --ereader-ink: #D4C5A9;
  --ereader-line: #2E2A23;
  --ereader-dim: #9C8E76;
  --ereader-user-bg: #24211C;
}

.ereader-mode,
.ereader-mode .editorial-doc,
.ereader-mode .editorial-body,
.ereader-mode [class*="chat"],
.ereader-mode [class*="conversation"],
.ereader-mode article,
.ereader-mode .editorial-text {
  font-family: Georgia, Merriweather, serif !important;
  line-height: 1.65 !important;
  text-align: justify !important;
  hyphens: auto !important;
  background-color: var(--ereader-bg, #F4ECD8) !important;
  color: var(--ereader-ink, #2C2416) !important;
}

.ereader-mode p,
.ereader-mode .editorial-text p {
  font-family: Georgia, Merriweather, serif !important;
  line-height: 1.65 !important;
  text-align: justify !important;
  hyphens: auto !important;
  color: var(--ereader-ink, #2C2416) !important;
  margin-bottom: 1.35em !important;
}

.ereader-mode .editorial-title,
.ereader-mode h1,
.ereader-mode h2,
.ereader-mode h3 {
  font-family: Georgia, Merriweather, serif !important;
  color: var(--ereader-ink, #2C2416) !important;
}

.ereader-mode blockquote {
  border-left-color: var(--ereader-dim, #60513B) !important;
  color: var(--ereader-dim, #60513B) !important;
}

/* Tema Ink: Ink OLED Dark & Ink Warm Paper Light */
body[data-ds-theme="ink-oled"],
html.ink-oled,
html.ink-oled body,
body.ink-oled,
[data-ds-theme="ink-oled"] {
  color-scheme: dark !important;
  --dsw-alias-bg-base: #050505 !important;
  --dsw-alias-bg-surface: #111111 !important;
  --dsw-alias-bg-subtle: #111111 !important;
  --dsw-alias-border-default: #222222 !important;
  --dsw-alias-border-subtle: #222222 !important;
  --dsw-alias-label-primary: #E2E8F0 !important;
  --dsw-alias-label-secondary: #94A3B8 !important;
  --dsw-alias-accent: #388BFD !important;
  --ink-bg: #050505;
  --ink-surface: #111111;
  --ink-border: #222222;
  --ink-text: #E2E8F0;
  --ink-accent: #388BFD;
  background-color: #050505 !important;
  color: #E2E8F0 !important;
}

body[data-ds-theme="ink-oled"] [class*="_surface_"],
body[data-ds-theme="ink-oled"] [class*="card"],
body[data-ds-theme="ink-oled"] [class*="panel"],
body[data-ds-theme="ink-oled"] article,
body[data-ds-theme="ink-oled"] form:has(textarea),
body[data-ds-theme="ink-oled"] [class*="composer"],
body[data-ds-theme="ink-oled"] [role="menu"],
body[data-ds-theme="ink-oled"] [data-anchored],
html.ink-oled [class*="_surface_"],
html.ink-oled [class*="card"],
html.ink-oled [class*="panel"],
html.ink-oled article,
html.ink-oled form:has(textarea),
html.ink-oled [class*="composer"],
html.ink-oled [role="menu"],
html.ink-oled [data-anchored] {
  background-color: #111111 !important;
  border: 1px solid #222222 !important;
  color: #E2E8F0 !important;
}

body[data-ds-theme="ink-oled"] *,
html.ink-oled * {
  border-color: #222222;
}

body[data-ds-theme="ink-oled"] a,
body[data-ds-theme="ink-oled"] [class*="accent"],
html.ink-oled a,
html.ink-oled [class*="accent"] {
  color: #388BFD !important;
}

body[data-ds-theme="ink-paper"],
html.ink-paper,
html.ink-paper body,
body.ink-paper,
[data-ds-theme="ink-paper"] {
  color-scheme: light !important;
  --dsw-alias-bg-base: #F9F8F6 !important;
  --dsw-alias-bg-surface: #FFFFFF !important;
  --dsw-alias-bg-subtle: #FFFFFF !important;
  --dsw-alias-border-default: #E5E2DC !important;
  --dsw-alias-border-subtle: #E5E2DC !important;
  --dsw-alias-label-primary: #1A1A1A !important;
  --dsw-alias-label-secondary: #555555 !important;
  --paper-bg: #F9F8F6;
  --paper-card: #FFFFFF;
  --paper-border: #E5E2DC;
  --paper-text: #1A1A1A;
  background-color: #F9F8F6 !important;
  color: #1A1A1A !important;
}

body[data-ds-theme="ink-paper"] [class*="_surface_"],
body[data-ds-theme="ink-paper"] [class*="card"],
body[data-ds-theme="ink-paper"] [class*="panel"],
body[data-ds-theme="ink-paper"] article,
body[data-ds-theme="ink-paper"] form:has(textarea),
body[data-ds-theme="ink-paper"] [class*="composer"],
body[data-ds-theme="ink-paper"] [role="menu"],
body[data-ds-theme="ink-paper"] [data-anchored],
html.ink-paper [class*="_surface_"],
html.ink-paper [class*="card"],
html.ink-paper [class*="panel"],
html.ink-paper article,
html.ink-paper form:has(textarea),
html.ink-paper [class*="composer"],
html.ink-paper [role="menu"],
html.ink-paper [data-anchored] {
  background-color: #FFFFFF !important;
  border: 1px solid #E5E2DC !important;
  color: #1A1A1A !important;
}

body[data-ds-theme="ink-paper"] *,
html.ink-paper * {
  border-color: #E5E2DC;
}
`.trim();
