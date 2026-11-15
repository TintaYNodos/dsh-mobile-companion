/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
import http from "node:http";
import { HOST, PORT, accessKey, authHeader } from "./_harness.mjs";
import { generateQrSvg } from "../src/qr.mjs";
import { generateQrSvg as qrFromViews } from "../src/pairing-views.mjs";
import { generateQrSvg as qrFromPairing, approvalPage } from "../src/pairing.mjs";
import { MOBILE_STYLES } from "../src/mobile-styles.mjs";
import { NOTIFICATION_BRIDGE_SCRIPT } from "../src/mobile-client.mjs";

const KEY = accessKey();
const basic = (user, pass) => "Basic " + Buffer.from(`${user}:${pass}`, "utf8").toString("base64");

function request(pathname, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: HOST, port: PORT, path: pathname, method, headers, timeout: 10000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers || {}, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("timeout", () => { req.destroy(); resolve({ status: 0, headers: {}, body: "timeout" }); });
    req.on("error", (e) => resolve({ status: 0, headers: {}, body: e.code || "" }));
    if (body) req.write(body);
    req.end();
  });
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};

// ============================================================================
// 1. GENERADOR DE CÓDIGO QR NATIVO SVG
// ============================================================================
const testBunkerUrl = `http://${HOST}:${PORT}`;
const qrSvg = generateQrSvg(testBunkerUrl, { size: 180, margin: 2 });

check("generateQrSvg genera SVG valido", typeof qrSvg === "string" && qrSvg.startsWith("<svg") && qrSvg.endsWith("</svg>"), `tamano=${qrSvg.length}`);
check("generateQrSvg contiene rect de fondo", qrSvg.includes("<rect"));
check("generateQrSvg contiene path de modulos", qrSvg.includes("<path") && qrSvg.includes("d=\"M"));
check("generateQrSvg exportado desde pairing-views.mjs", typeof qrFromViews === "function");
check("generateQrSvg exportado desde pairing.mjs", typeof qrFromPairing === "function");

const panelHtml = approvalPage({ bunkerUrl: testBunkerUrl });
check("panel /pair contiene SVG de codigo QR", panelHtml.includes("<svg") && panelHtml.includes("Codigo QR"));
check("panel /pair contiene texto explicativo exacto", panelHtml.includes("Escanea con la cámara del teléfono para conectar al instante"));
check("panel /pair incluye la URL del bunker", panelHtml.includes(testBunkerUrl));

// ============================================================================
// 2. ENDPOINT DE TERMINAL REMOTA SEGURA (POST /dsh-companion/terminal)
// ============================================================================
// 2.0 La terminal remota esta APAGADA por defecto (DSH_ENABLE_TERMINAL=1 para
// activarla). El contrato cambia con la configuracion, asi que se detecta primero.
const probeTerm = await request("/dsh-companion/terminal", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: basic("dsh", KEY) },
  body: JSON.stringify({ command: "echo probe" }),
});
const TERMINAL_ENABLED = probeTerm.status !== 501;

if (!TERMINAL_ENABLED) {
  check("terminal deshabilitada por defecto responde 501", probeTerm.status === 501, `status=${probeTerm.status}`);
  let probeJson = {};
  try { probeJson = JSON.parse(probeTerm.body); } catch {}
  check("terminal deshabilitada explica como activarla", String(probeJson.detail || "").includes("DSH_ENABLE_TERMINAL"), String(probeJson.detail || "").slice(0, 60));
  console.log("  (terminal apagada: se omiten las pruebas de ejecucion 2.1-2.6)");
} else {
  // 2.1 Peticion sin autorizacion debe responder 403
  const unauthTerm = await request("/dsh-companion/terminal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "echo test" }),
  });
  check("terminal sin autorizacion rechazada con 403", unauthTerm.status === 403, `status=${unauthTerm.status}`);

  // 2.2 Peticion con clave incorrecta rechazada con 403
  const badKeyTerm = await request("/dsh-companion/terminal", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basic("dsh", "clave-falsa-12345") },
    body: JSON.stringify({ command: "echo test" }),
  });
  check("terminal con clave incorrecta rechazada con 403", badKeyTerm.status === 403, `status=${badKeyTerm.status}`);

  // 2.3 Peticion con clave valida pero JSON invalido responde 400
  const badJsonTerm = await request("/dsh-companion/terminal", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basic("dsh", KEY) },
    body: "invalido{json",
  });
  check("terminal con JSON invalido responde 400", badJsonTerm.status === 400, `status=${badJsonTerm.status}`);

  // 2.4 Peticion con comando vacio responde 400
  const emptyTerm = await request("/dsh-companion/terminal", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basic("dsh", KEY) },
    body: JSON.stringify({ command: "" }),
  });
  check("terminal con comando vacio responde 400", emptyTerm.status === 400, `status=${emptyTerm.status}`);

  // 2.5 Ejecucion exitosa de comando
  const cmdEcho = process.platform === "win32" ? "Write-Output 'Subagente_A_OK'" : "echo 'Subagente_A_OK'";
  const goodTerm = await request("/dsh-companion/terminal", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basic("dsh", KEY) },
    body: JSON.stringify({ command: cmdEcho }),
  });
  check("terminal autorizada responde 200", goodTerm.status === 200, `status=${goodTerm.status}`);
  let termJson = {};
  try { termJson = JSON.parse(goodTerm.body); } catch {}
  check("terminal retorna ok: true", termJson.ok === true);
  check("terminal retorna stdout esperado", typeof termJson.stdout === "string" && termJson.stdout.includes("Subagente_A_OK"), `stdout=${termJson.stdout?.trim()}`);
  check("terminal retorna exitCode 0", termJson.exitCode === 0, `exitCode=${termJson.exitCode}`);

  // 2.6 Acotamiento de salida a maximo 32 KB
  const cmdLarge = process.platform === "win32"
    ? "Write-Output ('X' * 50000)"
    : "python3 -c 'print(\"X\" * 50000)' 2>/dev/null || perl -e 'print \"X\" x 50000'";
  const largeTerm = await request("/dsh-companion/terminal", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: basic("dsh", KEY) },
    body: JSON.stringify({ command: cmdLarge }),
  });
  let largeJson = {};
  try { largeJson = JSON.parse(largeTerm.body); } catch {}
  const outputBytes = Buffer.byteLength(largeJson.stdout || "", "utf8");
  check("terminal acota salida a maximo 32 KB (<= 32768 bytes)", outputBytes <= 32768, `bytes=${outputBytes}`);
}

// ============================================================================
// 3. TEMA "INK" EN mobile-styles.mjs
// ============================================================================
check("mobile-styles define body[data-ds-theme=\"ink-oled\"]", MOBILE_STYLES.includes('body[data-ds-theme="ink-oled"]'));
check("mobile-styles define html.ink-oled", MOBILE_STYLES.includes("html.ink-oled"));
check("mobile-styles define fondo OLED #050505", MOBILE_STYLES.includes("#050505"));
check("mobile-styles define superficies OLED #111111", MOBILE_STYLES.includes("#111111"));
check("mobile-styles define bordes OLED #222222", MOBILE_STYLES.includes("#222222"));
check("mobile-styles define texto primario OLED #E2E8F0", MOBILE_STYLES.includes("#E2E8F0"));
check("mobile-styles define acento azul noche #388BFD", MOBILE_STYLES.includes("#388BFD"));

check("mobile-styles define body[data-ds-theme=\"ink-paper\"]", MOBILE_STYLES.includes('body[data-ds-theme="ink-paper"]'));
check("mobile-styles define html.ink-paper", MOBILE_STYLES.includes("html.ink-paper"));
check("mobile-styles define fondo papel calido #F9F8F6", MOBILE_STYLES.includes("#F9F8F6"));
check("mobile-styles define tarjetas papel #FFFFFF", MOBILE_STYLES.includes("#FFFFFF"));
check("mobile-styles define bordes papel #E5E2DC", MOBILE_STYLES.includes("#E5E2DC"));
check("mobile-styles define texto tinta #1A1A1A", MOBILE_STYLES.includes("#1A1A1A"));

// ============================================================================
// 4. BARRA DE TECLAS RÁPIDAS DE PROGRAMACIÓN EN mobile-client.mjs
// ============================================================================
check("mobile-client define barra dsh-code-keys", NOTIFICATION_BRIDGE_SCRIPT.includes("dsh-code-keys"));
const essentialKeys = ["Tab", "Esc", "/", "{ }", "[ ]", "( )", "|", "~", "`"];
const allKeysIncluded = essentialKeys.every((k) => NOTIFICATION_BRIDGE_SCRIPT.includes(k));
check("mobile-client contiene todas las teclas requeridas", allKeysIncluded, essentialKeys.join(" "));
check("mobile-client inserta 2 espacios en Tab", NOTIFICATION_BRIDGE_SCRIPT.includes("'  '"));
check("mobile-client inserta {  } con cursor dentro para { }", NOTIFICATION_BRIDGE_SCRIPT.includes("'{ '") && NOTIFICATION_BRIDGE_SCRIPT.includes("' }'"));
check("mobile-client conecta haptic feedback performHaptic", NOTIFICATION_BRIDGE_SCRIPT.includes("window.AndroidCompanion.performHaptic"));

// ============================================================================
// 5. REGLAS ESTRICTAS: CERO EMOJIS EN ARCHIVOS MODIFICADOS
// ============================================================================
const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
check("mobile-client no contiene emojis", !emojiRegex.test(NOTIFICATION_BRIDGE_SCRIPT));
check("mobile-styles no contiene emojis", !emojiRegex.test(MOBILE_STYLES));
check("panelHtml no contiene emojis", !emojiRegex.test(panelHtml));

console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length} pruebas correctas`);
if (checks.some((c) => !c)) process.exitCode = 1;
