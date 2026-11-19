/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
export const MOBILE_STYLES = `
/* Regla de esta hoja: NO se redefine la geometría de los componentes de DSH
   (CSS Anchor Positioning y CSS Modules; un comodín de clase anula su cálculo
   y descolga menús). Solo se corrige lo propio del móvil: área táctil,
   desbordes, el dock de comandos y las vistas del Companion. */
:root {
  --dshc-safe-top: env(safe-area-inset-top, 0px);
  --dshc-safe-right: env(safe-area-inset-right, 0px);
  --dshc-safe-bottom: env(safe-area-inset-bottom, 0px);
  --dshc-safe-left: env(safe-area-inset-left, 0px);
  /* Defecto 5: contorno >= 3:1 y relleno >= 1,5:1 sobre #1b1b1f. */
  --dshc-chip-bg: rgba(148, 158, 172, 0.34); --dshc-chip-border: rgba(203, 213, 225, 0.90);
  --dshc-chip-text: var(--dsw-alias-label-primary, #e6edf3); --dshc-separator: rgba(203, 213, 225, 0.45);
}

/* Tema claro: los mismos ratios, compuestos sobre blanco. */
body:not([data-ds-dark-theme]) { --dshc-chip-bg: rgba(70, 80, 95, 0.28); --dshc-chip-border: rgba(60, 70, 85, 0.78); --dshc-chip-text: #1f2328; --dshc-separator: rgba(60, 70, 85, 0.42); }

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

/* Objetivo táctil mínimo en filas de menú desplegable. */
@media (pointer: coarse) {
  [role="menuitem"],
  [role="menuitemcheckbox"],
  [role="menuitemradio"],
  [role="option"] {
    min-height: 44px;
  }
}

/* --- Dock del compositor: comandos y teclas ------------------------------
   Defecto 4: chip/tecla de 44 dp de alto y 44 dp de ancho minimo (objetivo
   tactil comodo sin gastar franja). Contraste intacto (defecto 5) y filas con
   scroll horizontal y degradado (defecto 3). Densidad final: gap 5 px, padding
   interno 8 px y fuente 11 px; caben mas chips en la misma franja. */
.dsh-chip { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--dshc-chip-border); background: var(--dshc-chip-bg); color: var(--dshc-chip-text); font-size: 10.5px; font-weight: 600; line-height: 1.1; white-space: nowrap; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
/* La fila compacta del apaisado va un punto mas apretada de aspecto (misma
   zona tactil de 44 px): el chip se ve mas pequeno sin perder precision. */
#dsh-dock-compact .dsh-chip { font-size: 10px; padding: 0 5px; border-radius: 7px; }
/* Fila con scroll horizontal: scroll-padding + snap suave para que un chip no
   quede a medias, y mascara de degradado SOLO por el lado que tiene contenido
   oculto (al inicio nunca hay degradado izquierdo: «Escena» se ve entera). */
.dsh-row { box-sizing: border-box; overscroll-behavior-x: contain; scroll-padding: 0 8px; scroll-snap-type: x proximity; }
.dsh-row > .dsh-chip { scroll-snap-align: start; }
.dsh-row[data-overflow-start="1"]:not([data-overflow-end="1"]) { -webkit-mask-image: linear-gradient(to right, transparent 0, #000 18px); mask-image: linear-gradient(to right, transparent 0, #000 18px); }
.dsh-row[data-overflow-end="1"]:not([data-overflow-start="1"]) { -webkit-mask-image: linear-gradient(to right, #000 0 calc(100% - 18px), transparent 100%); mask-image: linear-gradient(to right, #000 0 calc(100% - 18px), transparent 100%); }
.dsh-row[data-overflow-start="1"][data-overflow-end="1"] { -webkit-mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%); mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%); }

/* --- Hoja inferior del chip "+" -----------------------------------------
   Defecto 2: ancho útil completo, cabecera fija, cuerpo con scroll propio y
   "Cerrar" fijo, siempre dentro del viewport. Cada fila mide 48 dp. */
.dsh-sheet-overlay { background: rgba(0, 0, 0, 0.42); }
.dsh-sheet { display: flex; flex-direction: column; box-sizing: border-box; width: 100%; max-width: 100%; max-height: min(88vh, 520px); padding: 0; border-radius: 16px 16px 0 0; background: var(--dsw-alias-bg-surface, #1b1b1f); color: var(--dsw-alias-label-primary, #e6edf3); }
.dsh-sheet-title { flex: 0 0 auto; padding: 12px 14px 8px; border-bottom: 1px solid var(--dshc-separator); font-size: 15px; font-weight: 700; }
.dsh-sheet-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 0 14px 18px; scrollbar-width: thin; }
.dsh-sheet-body[data-overflow="1"] { -webkit-mask-image: linear-gradient(to bottom, #000 0 calc(100% - 20px), transparent 100%); mask-image: linear-gradient(to bottom, #000 0 calc(100% - 20px), transparent 100%); }
.dsh-sheet-group { margin: 10px 0 4px; font-size: 10.5px; font-weight: 700; letter-spacing: .08em; color: var(--dsw-alias-label-secondary, #8c959f); }
.dsh-sheet-item { display: block; box-sizing: border-box; width: 100%; min-height: 48px; margin: 4px 0; padding: 10px 12px; border: 1px solid var(--dshc-chip-border); border-radius: 10px; background: var(--dshc-chip-bg); color: inherit; font-size: 13px; line-height: 1.35; text-align: left; touch-action: manipulation; }
.dsh-sheet-item:focus-visible { outline: 2px solid var(--dsw-alias-accent, #388bfd); outline-offset: 2px; }
.dsh-sheet-close { flex: 0 0 auto; width: auto; margin: 8px 14px calc(10px + env(safe-area-inset-bottom, 0px)); }

/* Apaisado con poco alto: la hoja usa la franja útil y el cierre sigue fijo. */
@media (orientation: landscape) and (max-height: 520px) {
  .dsh-sheet { max-height: calc(100% - 4px); border-radius: 12px 12px 0 0; }
  .dsh-sheet-title { padding: 6px 12px 4px; font-size: 13px; }
  .dsh-sheet-body { padding: 0 12px 14px; }
  .dsh-sheet-item { margin: 3px 0; padding: 6px 10px; font-size: 12.5px; }
  .dsh-sheet-close { margin: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px)); }
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

/* Modo Tablet, Plegables y Pantallas Grandes: solo se limita el ancho del
   contenido; el compositor de DSH se mide solo y no se redimensiona aquí. */
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
   Implementa el Plan 2 de HOJA_ERRORES_CAPTURAS.md bajo esta media query:
   sidebar como drawer, panel derecho modal, compositor compacto y menú con
   max-height corto. Se omiten los selectores genéricos 'aside': son demasiado
   amplios y fijarían como modal un panel que no es el de herramientas. */
@media (orientation: landscape) and (max-height: 520px) {
  :where([class*="_groups"], [class*="_paneBody"]) {
    overscroll-behavior: contain;
  }

  /* Sidebar izquierdo: drawer emergente, nunca columna fija. */
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

  /* Panel derecho de herramientas: modal superpuesto. */
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
     La franja útil baja a ~70-100 px y el asiento del compositor es sticky al
     fondo: se compacta a una línea de escritura + botones y se oculta la fila
     de estadísticas de DSH, que es lo único prescindible. */
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
  /* El scrollport del borrador es el único tope: ~una línea visible y el resto
     se desplaza dentro (DSH revela el caret). El cliente afina el alto. */
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

  /* Menú trigger / slash: no debe invadir cabecera y pestañas; con scroll
     interno si hay más opciones de las que caben. */
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
