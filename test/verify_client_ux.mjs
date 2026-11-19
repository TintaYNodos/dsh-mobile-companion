/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Regresiones de la 5.4.0 que no se pueden ejercitar sin dispositivo. Son
 * comprobaciones estaticas sobre las fuentes reales (CSS/constantes del dock,
 * logica del selector de archivos, orden del kill switch y contraste):
 *
 *   - chip/tecla de 44 dp tambien en la fila compacta y el boton que la abre;
 *   - el selector nativo de archivos oculta el dock y lo restaura al volver
 *     (con archivo, cancelado o cuando el lanzamiento falla);
 *   - el kill switch borra la copia sin conexion SOLO con el 2xx confirmado y
 *     su texto dice que afecta solo a ESTA computadora;
 *   - el rojo de peligro cumple contraste AA (>= 4,5:1) en ambos temas.
 *
 * No necesita el puente ni DSH:
 *
 *   node test/verify_client_ux.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOBILE_STYLES } from "../src/mobile-styles.mjs";
import { MOBILE_CLIENT_DOCK } from "../src/mobile-client-dock.mjs";
import { MOBILE_CLIENT_DOCK_UI } from "../src/mobile-client-dock-ui.mjs";
import { MOBILE_CLIENT_DOCK_CONTROLS } from "../src/mobile-client-dock-controls.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// ---------------------------------------------------------------------------
// 1. Contraste del rojo de peligro (AA 4,5:1 en los dos temas)
// ---------------------------------------------------------------------------
const palette = read("android_src/ThemePalette.java");
const hexOf = (constant) => {
  const match = palette.match(new RegExp(`${constant}\\s*=\\s*0x[Ff]{2}([0-9A-Fa-f]{6})`));
  return match ? match[1].toUpperCase() : null;
};
const darkHex = hexOf("DANGER_DARK");
const lightHex = hexOf("DANGER_LIGHT");
const linear = (channel) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (hex) => {
  const n = Number.parseInt(hex, 16);
  return 0.2126 * linear((n >> 16) & 0xff) + 0.7152 * linear((n >> 8) & 0xff) + 0.0722 * linear(n & 0xff);
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
check("ThemePalette declara DANGER_DARK y DANGER_LIGHT", Boolean(darkHex && lightHex), `${darkHex} / ${lightHex}`);
const contrastPairs = [
  ["oscuro sobre raised", darkHex, "21262D"],
  ["oscuro sobre surface", darkHex, "161B22"],
  ["claro sobre raised", lightHex, "F6F8FA"],
  ["claro sobre surface", lightHex, "FFFFFF"],
];
for (const [label, fg, bg] of contrastPairs) {
  if (!fg) {
    check(`contraste ${label}`, false, "color ausente");
    continue;
  }
  const value = ratio(fg, bg);
  check(`contraste AA ${label} (>= 4,5)`, value >= 4.5, `${fg} sobre #${bg} = ${value.toFixed(2)}:1`);
}
if (darkHex && lightHex) {
  const oldDark = ratio("EF4444", "21262D");
  const oldLight = ratio("EF4444", "F6F8FA");
  check("el #EF4444 retirado incumplia AA (4,04 / 3,53)", oldDark < 4.5 && oldLight < 4.5,
    `${oldDark.toFixed(2)} / ${oldLight.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 2. Objetivo tactil de 44 dp (CSS y constantes del dock)
// ---------------------------------------------------------------------------
const chipRule = (MOBILE_STYLES.match(/\.dsh-chip\s*\{[^}]*\}/) || [""])[0];
check("chip del dock mide 44 dp de ancho", /min-width:\s*44px/.test(chipRule));
check("chip del dock mide 44 dp de alto", /min-height:\s*44px/.test(chipRule));
check("boton que abre el dock mide 44 dp", /COMPACT_LATCH_HEIGHT\s*=\s*44\b/.test(MOBILE_CLIENT_DOCK));
check("latch del dock dibuja 44 px de alto", /min-height:44px/.test(MOBILE_CLIENT_DOCK_CONTROLS));
check("boton Ocultar vertical dibuja 44 px", /dsh-dock-collapse[\s\S]{0,400}min-height:44px/.test(MOBILE_CLIENT_DOCK_CONTROLS));
check("chip Archivo en la fila compacta", /Archivo/.test(MOBILE_CLIENT_DOCK_UI) && /dshOpenAttachMenu/.test(MOBILE_CLIENT_DOCK_CONTROLS));
check("boton compacto exige 44 px de ancho", /min-width:44px/.test(MOBILE_CLIENT_DOCK_UI));
check("filas de menu tactiles de 44 px", /role="menuitem"[\s\S]{0,120}min-height:\s*44px/.test(MOBILE_STYLES));

// ---------------------------------------------------------------------------
// 3. Selector de archivos: oculta el dock y lo restaura al volver
// ---------------------------------------------------------------------------
const hideStart = MOBILE_CLIENT_DOCK.indexOf("function dshHideDockForFilePicker()");
check("existe dshHideDockForFilePicker", hideStart >= 0);
if (hideStart >= 0) {
  const body = MOBILE_CLIENT_DOCK.slice(hideStart, hideStart + 400);
  check("el selector oculta el dock", /setDockDisplay\(dock, false\)/.test(body));
  check("el selector oculta latch y fila compacta", /dsh-dock-latch/.test(body) && /dsh-dock-compact/.test(body));
}
check("__DSH_SET_FILE_PICKER__ guarda el estado y repinta el dock",
  /__DSH_SET_FILE_PICKER__\s*=\s*function\(open\)\s*\{[\s\S]{0,200}dshFilePickerOpen\s*=\s*Boolean\(open\)[\s\S]{0,120}updateComposerDockVisibility\(\)/.test(MOBILE_CLIENT_DOCK));
check("con el selector abierto el dock se queda oculto",
  /if\s*\(dshFilePickerOpen\)\s*return\s+dshHideDockForFilePicker\(\)/.test(MOBILE_CLIENT_DOCK_UI));
const chrome = read("android_src/CompanionChromeClient.java");
const pickerTrue = chrome.indexOf("__DSH_SET_FILE_PICKER__(true)");
const pickerStart = chrome.indexOf("a.startActivityForResult(intent, REQUEST_FILE)");
check("el APK avisa del selector antes de abrir la actividad", pickerTrue >= 0 && pickerTrue < pickerStart);
const pickerFalse = (chrome.match(/__DSH_SET_FILE_PICKER__\(false\)/g) || []).length;
check("restaura el dock al elegir/cancelar y si el lanzamiento falla", pickerFalse >= 2, `${pickerFalse} llamadas`);

// ---------------------------------------------------------------------------
// 4. Kill switch: orden del borrado y alcance por computadora
// ---------------------------------------------------------------------------
const kill = read("android_src/KillSwitchUi.java");
const clearIdx = kill.indexOf("OfflineChatStore.clear(a)");
const confirmedIdx = kill.indexOf("if (confirmed)");
check("existe el borrado de la copia sin conexion", clearIdx >= 0);
check("la copia se borra solo tras el 2xx confirmado", confirmedIdx >= 0 && clearIdx > confirmedIdx,
  `clear@${clearIdx} > confirmed@${confirmedIdx}`);
check("el texto limita el kill switch a ESTA computadora", kill.includes("ESTA computadora"));
check("el texto avisa de que las demas PCs no se tocan", /las demás PCs no se tocan/.test(kill));
check("el texto menciona la copia sin conexion", kill.includes("copia sin conexión"));
check("el dialogo nombra la accion como de esta PC", kill.includes("Revocar esta PC"));
check("KillSwitchUi usa el rojo con contraste", kill.includes("ThemePalette.danger(a)"));
check("no queda el #EF4444 retirado en el kill switch", !kill.includes('#EF4444'));

// ---------------------------------------------------------------------------
// 5. El arrastre del Hub usa la politica aislada y probada
// ---------------------------------------------------------------------------
const hub = read("android_src/HubSheet.java");
check("HubSheet delega el arrastre en HubDragPolicy", /HubDragPolicy\.dropAction/.test(hub) &&
  /HubDragPolicy\.dismissAfterPx/.test(hub));

// ---------------------------------------------------------------------------
// 6. Inserción en el compositor: true solo si el texto está de verdad dentro
// ---------------------------------------------------------------------------
const editor = read("src/mobile-client-editor.mjs");
check("el editor comprueba el texto tras execCommand",
  /editorText\(el\)/.test(editor) && /execCommand\('insertText'/.test(editor));
check("si execCommand no commitea se reintenta con beforeinput sintético",
  /new InputEvent\('beforeinput'[\s\S]{0,120}inputType:\s*'insertText'/.test(editor));
check("la comprobación diferida espera 80 ms y se acota a 1 s",
  /setTimeout\(function\(\) \{ check\(false\); \}, 80\)/.test(editor) && /Date\.now\(\) \+ 1000/.test(editor));
check("__DSH_INSERT_INTO_COMPOSER__ devuelve true solo si el texto consta",
  /if \(!immediate \|\| !attempt\.done \|\| !attempt\.ok\) return false;/.test(editor) &&
    /attempt\.ok = ok === true && editorText\(editor\)\.indexOf\(text\) >= 0;/.test(editor));
check("un reintento con el mismo texto no duplica la inserción", /previous\.text === text/.test(editor));
const bridge = read("android_src/WebBridge.java");
const draftFn = bridge.slice(bridge.indexOf("checkAndInjectOfflineOutbox(MainActivity a)"), bridge.indexOf("captureDraftIfOffline"));
check("el borrador pendiente solo se borra cuando la inserción consta",
  /if \("true"\.equals\(res\)[\s\S]{0,160}remove\("pending_outbox_draft"\)/.test(draftFn));
const sharedFn = bridge.slice(bridge.indexOf("injectSharedTextIfReady(MainActivity a)"));
check("el texto compartido pendiente solo se borra cuando la inserción consta",
  /if \("true"\.equals\(res\)\)[\s\S]{0,200}pendingSharedText = null/.test(sharedFn));

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length} pruebas correctas`);
if (checks.some((c) => !c)) process.exitCode = 1;
