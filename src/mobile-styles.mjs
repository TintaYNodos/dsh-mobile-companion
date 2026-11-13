/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
export const MOBILE_STYLES = `
:root {
  --dshc-safe-top: env(safe-area-inset-top, 0px);
  --dshc-safe-right: env(safe-area-inset-right, 0px);
  --dshc-safe-bottom: env(safe-area-inset-bottom, 0px);
  --dshc-safe-left: env(safe-area-inset-left, 0px);
}

html, body {
  width: 100% !important;
  height: 100% !important;
  min-height: 100dvh !important;
  margin: 0 !important;
  padding: 0 !important;
  -webkit-text-size-adjust: 100%;
  touch-action: manipulation;
  overflow-x: hidden;
}

*, *::before, *::after {
  -webkit-tap-highlight-color: transparent;
  box-sizing: border-box;
}

[class*="_frame"], main, #root, #app {
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
}

[class*="chat"], [class*="conversation"], article, .message {
  width: 100% !important;
  max-width: 100% !important;
}

form:has(textarea), [class*="composer"] {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

form:has(textarea) [class*="actionRow"],
form:has(textarea) [class*="toolbar"],
form:has(textarea) [class*="footer"],
[class*="composer"] [class*="actionRow"],
[class*="composer"] [class*="toolbar"],
[class*="composer"] [class*="footer"] {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 6px !important;
}

[role="menu"], [data-anchored], [data-context-menu], [class*="_list_"], [class*="_surface_"], [class*="_scrollable_"] {
  max-height: min(48dvh, calc(100dvh - 160px)) !important;
  max-height: min(48vh, calc(100vh - 160px)) !important;
  max-width: calc(100vw - 16px) !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch !important;
  z-index: 10000 !important;
}

[data-trigger-menu], [class*="pc3rQa_menu"] {
  position: absolute !important;
  bottom: calc(100% + 4px) !important;
  left: 0 !important;
  right: 0 !important;
  max-height: min(42dvh, calc(100dvh - 160px)) !important;
  max-height: min(42vh, calc(100vh - 160px)) !important;
  overflow: hidden !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5) !important;
  z-index: 1000 !important;
}

[data-trigger-menu] [class*="pc3rQa_viewport"], [class*="pc3rQa_menu"] [class*="pc3rQa_viewport"] {
  max-height: inherit !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  -webkit-overflow-scrolling: touch !important;
}

button, [role="button"], a, input, select, textarea {
  touch-action: manipulation;
}

img, video, canvas, svg {
  max-width: 100%;
  height: auto;
}

::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
* {
  scrollbar-width: none;
}
html, body {
  -webkit-overflow-scrolling: touch;
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

/* Modo Tablet, Plegables y Pantallas Grandes (>= 600px y >= 768px) */
@media (min-width: 600px) {
  [class*="_frame"], main, #root, #app {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
  }

  [class*="chat"], [class*="conversation"], article, .message,
  form:has(textarea), [class*="composer"] {
    max-width: min(880px, 92vw) !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  [role="menu"], [data-anchored], [data-context-menu], [class*="_list_"], [class*="_surface_"] {
    max-width: 480px !important;
    border-radius: 14px !important;
  }
}

@media (min-width: 768px) {
  [class*="chat"], [class*="conversation"], article, .message,
  form:has(textarea), [class*="composer"] {
    max-width: min(960px, 90vw) !important;
  }

  /* Distribución de barra de acciones en tablet */
  form:has(textarea) [class*="actionRow"],
  [class*="composer"] [class*="actionRow"] {
    justify-content: space-between !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
`.trim();
