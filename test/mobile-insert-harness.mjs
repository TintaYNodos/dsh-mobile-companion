/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Arnés headless de la inserción en el compositor (solo lectura: carga la
 * página, escribe en el compositor y NO envía nada). Usa Chrome/Edge headless
 * por CDP contra el puente vivo y el Lexical real:
 *
 *   node test/mobile-insert-harness.mjs
 *
 * 1. ANTES: carga la página servida por el puente (JS que tiene el puente en
 *    memoria) y llama a su `__DSH_INSERT_INTO_COMPOSER__` en frío para dejar
 *    constancia del fallo (true sin texto).
 * 2. DESPUÉS: recarga en frío, inyecta `MOBILE_CLIENT_EDITOR` del repo (el JS
 *    nuevo, sin reiniciar el puente) y comprueba: true solo con el texto dentro,
 *    inserción única en frío, reintento sin duplicar, foco y editor intactos.
 *
 * Variables: DSH_TEST_HOST/DSH_TEST_PORT (por defecto 127.0.0.1:57420),
 * DSH_MOBILE_URL, DSH_ACCESS_KEY o ~/.dsh/companion-access-key, DSH_CHROME.
 * No forma parte de `run-suite` (necesita Chrome y un puente real).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { MOBILE_CLIENT_EDITOR } from "../src/mobile-client-editor.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const HOST = process.env.DSH_TEST_HOST || "127.0.0.1";
const PORT = Number(process.env.DSH_TEST_PORT || 57420);
const URL_TARGET = process.env.DSH_MOBILE_URL || `http://${HOST}:${PORT}/?dshc=on`;
const EVIDENCE_DIR = process.env.DSH_INSERT_EVIDENCE_DIR || path.join(os.tmpdir(), "dsh-mobile-insert-harness");
const EDITOR = '[data-lexical-editor="true"]';
const MARKS = { antes: "DSH-ANTES-1", despues: "DSH-DESPUES-1", otro: "DSH-DESPUES-2" };

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  ->  " + detail : ""}`);
};
const occurrences = (text, needle) => String(text || "").split(needle).length - 1;

const chromePath = () => {
  const candidates = [
    process.env.DSH_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const authHeader = () => {
  if (process.env.AUTH_HEADER) return process.env.AUTH_HEADER;
  let key = String(process.env.DSH_ACCESS_KEY || "").trim();
  if (!key) {
    try { key = fs.readFileSync(path.join(os.homedir(), ".dsh", "companion-access-key"), "utf8").trim(); } catch {}
  }
  return key ? "Basic " + Buffer.from("dsh:" + key, "utf8").toString("base64") : "";
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

const httpJson = (port, pathname) =>
  new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: pathname, timeout: 2000, agent: false }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { reject(new Error("json invalido")); } });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout CDP")); });
  });

const openWs = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("timeout WebSocket")), 15000);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("error WebSocket")); };
  });

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.navCount = 0;
    ws.onmessage = (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
        return;
      }
      if (message.method === "Page.frameNavigated" && message.params.frame.parentId === undefined) this.navCount += 1;
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error("timeout " + method));
      }, 20000);
    });
  }
}

const start = async () => {
  const chrome = chromePath();
  if (!chrome) return null;
  const cdpPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-insert-harness-"));
  const proc = spawn(chrome, [
    "--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`,
    "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    "--disable-extensions", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=360,800", "about:blank",
  ], { stdio: "ignore" });
  const cleanup = () => {
    try { spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  let version = null;
  for (let i = 0; i < 100 && !version; i++) {
    try { version = await httpJson(cdpPort, "/json/version"); } catch { await sleep(200); }
  }
  if (!version) { cleanup(); throw new Error("no arrancó Chrome headless"); }
  const cdp = new CDP(await openWs(version.webSocketDebuggerUrl));
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  const auth = authHeader();
  if (auth) await send("Network.setExtraHTTPHeaders", { headers: { Authorization: auth } });
  await send("Network.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    platform: "Linux armv8l",
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 360, height: 800, deviceScaleFactor: 1, mobile: true, screenWidth: 360, screenHeight: 800,
  });
  const evalJs = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) {
      const exception = result.exceptionDetails.exception;
      return { __error: (exception && (exception.description || exception.value)) || result.exceptionDetails.text };
    }
    return result.result ? result.result.value : undefined;
  };
  return { cdp, send, evalJs, cleanup };
};

const freshLoad = async (browser) => {
  const { cdp, send, evalJs } = browser;
  try { await evalJs("(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} return true; })()"); } catch {}
  const before = cdp.navCount;
  await send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  await send("Page.navigate", { url: URL_TARGET });
  for (let i = 0; i < 80 && cdp.navCount < before + 2; i++) await sleep(100);
  for (let i = 0; i < 100; i++) {
    const ready = await evalJs(`document.readyState === 'complete' && !!document.querySelector('${EDITOR}')`);
    if (ready === true) break;
    await sleep(250);
  }
  await sleep(1800);
  return evalJs(`(() => {
    const e = document.querySelector('${EDITOR}');
    if (!e) return { present: false, text: '', active: false, editable: false };
    const active = document.activeElement;
    return {
      present: true,
      text: e.innerText || '',
      active: Boolean(active && (active === e || e.contains(active))),
      editable: e.isContentEditable === true,
    };
  })()`);
};

const stateOf = (browser) =>
  browser.evalJs(`(() => {
    const e = document.querySelector('${EDITOR}');
    if (!e) return { present: false, text: '', active: false, editable: false };
    const active = document.activeElement;
    return {
      present: true,
      text: e.innerText || '',
      active: Boolean(active && (active === e || e.contains(active))),
      editable: e.isContentEditable === true,
    };
  })()`);

const callInsert = (browser, text) =>
  browser.evalJs(`(() => {
    try {
      if (typeof window.__DSH_INSERT_INTO_COMPOSER__ !== 'function') return 'sin-funcion';
      return window.__DSH_INSERT_INTO_COMPOSER__(${JSON.stringify(text)});
    } catch (e) { return 'ERR:' + ((e && e.message) || e); }
  })()`);

const injectNewEditor = (browser) =>
  browser.evalJs(`(function(){ window.__DSH_EDITOR_INJECTED__ = true; try { ${MOBILE_CLIENT_EDITOR}\n } catch (e) { window.__DSH_EDITOR_INJECT_ERROR__ = String((e && e.message) || e); } })()`);

const main = async () => {
  console.log(`[arnes] ${URL_TARGET}`);
  let browser = null;
  try {
    browser = await start();
  } catch (error) {
    console.log(`SKIP  no se pudo arrancar el navegador headless: ${error.message}`);
    return 0;
  }
  if (!browser) {
    console.log("SKIP  sin Chrome/Edge: define DSH_CHROME.");
    return 0;
  }
  const evidence = { url: URL_TARGET, startedAt: new Date().toISOString(), before: null, after: null };
  const finish = () => {
    browser.cleanup();
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, "result.json"), JSON.stringify(evidence, null, 2));
    console.log(`[arnes] evidencia en ${path.join(EVIDENCE_DIR, "result.json")}`);
  };
  try {
    // 1. ANTES: JS viejo que el puente tiene cargado (diagnóstico, no cuenta).
    const beforeLoad = await freshLoad(browser);
    const beforeReturn = await callInsert(browser, MARKS.antes);
    await sleep(1400);
    const beforeState = await stateOf(browser);
    evidence.before = {
      return: beforeReturn,
      text: beforeState.text,
      occurrences: occurrences(beforeState.text, MARKS.antes),
      bugReproduced: beforeReturn === true && occurrences(beforeState.text, MARKS.antes) === 0,
    };
    console.log(`[antes] return=${JSON.stringify(beforeReturn)} texto=${JSON.stringify(beforeState.text)} ` +
      `apariciones=${evidence.before.occurrences} falloReproducido=${evidence.before.bugReproduced}`);
    if (!beforeLoad.present) console.log("[antes] el compositor no se dibujó en la primera carga");

    // 2. DESPUÉS: recarga en frío e inyecta el módulo del repo (sin reiniciar).
    const afterLoad = await freshLoad(browser);
    check("el compositor Lexical se dibuja en frío", afterLoad.present && afterLoad.editable);
    await injectNewEditor(browser);
    const hasFunction = await browser.evalJs("typeof window.__DSH_INSERT_INTO_COMPOSER__");
    const injected = await browser.evalJs("window.__DSH_EDITOR_INJECTED__ === true");
    check("el JS nuevo del repo queda inyectado en la página", injected === true && hasFunction === "function",
      String(hasFunction));
    const injectError = await browser.evalJs("window.__DSH_EDITOR_INJECT_ERROR__ || ''");

    const freshReturn = await callInsert(browser, MARKS.despues);
    const immediatelyPresent = occurrences((await stateOf(browser)).text, MARKS.despues) > 0;
    check("en frío devuelve true solo si el texto ya está dentro", freshReturn !== true || immediatelyPresent,
      `return=${JSON.stringify(freshReturn)}`);
    evidence.after = { injectError: injectError || "", freshReturn, immediatelyPresent };
    await sleep(1600);
    const coldState = await stateOf(browser);
    const coldHits = occurrences(coldState.text, MARKS.despues);
    check("en frío el texto acaba dentro una sola vez (beforeinput sintético)", coldHits === 1,
      `texto=${JSON.stringify(coldState.text)} apariciones=${coldHits}`);

    // Reintento del llamador con el mismo texto: true y sin duplicar.
    const retryReturn = await callInsert(browser, MARKS.despues);
    await sleep(300);
    const retryState = await stateOf(browser);
    const retryHits = occurrences(retryState.text, MARKS.despues);
    check("el reintento con el mismo texto devuelve true", retryReturn === true, `return=${JSON.stringify(retryReturn)}`);
    check("el reintento no duplica lo ya insertado", retryHits === 1, `apariciones=${retryHits}`);

    // Editor ya asentado: un segundo texto distinto entra y no pisa al primero.
    const secondReturn = await callInsert(browser, MARKS.otro);
    await sleep(1300);
    const finalState = await stateOf(browser);
    const bothHits = occurrences(finalState.text, MARKS.otro);
    check("con el editor asentado el segundo texto entra una sola vez", bothHits === 1,
      `return=${JSON.stringify(secondReturn)} apariciones=${bothHits}`);
    check("el primer texto sigue una sola vez tras el segundo", occurrences(finalState.text, MARKS.despues) === 1);
    check("el compositor conserva el foco y sigue editable", finalState.present && finalState.editable && finalState.active,
      `present=${finalState.present} editable=${finalState.editable} focus=${finalState.active}`);
    evidence.after.retryReturn = retryReturn;
    evidence.after.retryHits = retryHits;
    evidence.after.finalText = finalState.text;
    evidence.after.focus = finalState;
    evidence.after.checks = checks.slice();
  } finally {
    finish();
  }
  console.log(`\nRESULTADO: ${checks.filter(Boolean).length}/${checks.length} comprobaciones correctas`);
  return checks.every(Boolean) ? 0 : 1;
};

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`[arnes] ERROR: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
}
