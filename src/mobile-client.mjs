/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

// El cliente movil viaja dentro de UN solo <script> inyectado en el <head>.
// Para que este archivo no crezca sin control, el cuerpo del cliente se parte en
// modulos que exportan plantillas de string y aqui se concatenan en tiempo de
// construccion: no se sirven como archivos aparte ni usan import en el
// navegador. El resultado sigue siendo el mismo IIFE de siempre.
import { MOBILE_CLIENT_CORE } from "./mobile-client-core.mjs";
import { MOBILE_CLIENT_DIAGNOSTICS } from "./mobile-client-diagnostics.mjs";
import { MOBILE_CLIENT_UI } from "./mobile-client-ui.mjs";
import { MOBILE_CLIENT_EDITOR } from "./mobile-client-editor.mjs";
import { MOBILE_CLIENT_DOCK } from "./mobile-client-dock.mjs";
import { MOBILE_CLIENT_DOCK_UI } from "./mobile-client-dock-ui.mjs";
import { MOBILE_CLIENT_CODE_KEYS } from "./mobile-client-code-keys.mjs";
import { MOBILE_CLIENT_OFFLINE } from "./mobile-client-offline.mjs";

const SCRIPT_OPEN = "\n<script id=\"dsh-companion-notifications\">\n(function() {\n";
const SCRIPT_CLOSE = "})();\n</script>\n";

const CLIENT_BODY = [
  MOBILE_CLIENT_CORE,
  MOBILE_CLIENT_DIAGNOSTICS,
  MOBILE_CLIENT_UI,
  MOBILE_CLIENT_EDITOR,
  MOBILE_CLIENT_DOCK,
  MOBILE_CLIENT_DOCK_UI,
  MOBILE_CLIENT_CODE_KEYS,
  MOBILE_CLIENT_OFFLINE,
].join("");

export const NOTIFICATION_BRIDGE_SCRIPT = SCRIPT_OPEN + CLIENT_BODY + SCRIPT_CLOSE;
