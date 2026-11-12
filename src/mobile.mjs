/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import { MOBILE_STYLES } from "./mobile-styles.mjs";
import { NOTIFICATION_BRIDGE_SCRIPT } from "./mobile-client.mjs";

const VIEWPORT = "width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes,viewport-fit=cover";

const META_BLOCK = [
  NOTIFICATION_BRIDGE_SCRIPT,
  `<meta name="viewport" content="${VIEWPORT}">`,
  `<meta name="theme-color" content="#151517" media="(prefers-color-scheme: dark)">`,
  `<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">`,
  `<meta name="apple-mobile-web-app-capable" content="yes">`,
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
  `<meta name="mobile-web-app-capable" content="yes">`,
  `<link rel="manifest" href="/companion.webmanifest">`,
  `<style id="dsh-companion-mobile">${MOBILE_STYLES}</style>`,
].join("\n");

const VIEWPORT_PATTERN = /<meta[^>]+name=["']viewport["'][^>]*>/i;
const HEAD_PATTERN = /<\/head>/i;
const MANIFEST_PATTERN = /rel=["']manifest["']/i;

export function injectMobileShell(html) {
  if (typeof html !== "string" || !html.length) return html;
  if (!HEAD_PATTERN.test(html)) return html;

  const block = MANIFEST_PATTERN.test(html)
    ? META_BLOCK.replace(/<link rel="manifest"[^>]*>\n?/, "")
    : META_BLOCK;

  const withoutViewport = VIEWPORT_PATTERN.test(html) ? html.replace(VIEWPORT_PATTERN, "") : html;
  return withoutViewport.replace(HEAD_PATTERN, `${block}\n</head>`);
}

export const mobileStylesheet = () => MOBILE_STYLES;
