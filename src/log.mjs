/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import fs from "node:fs";
import util from "node:util";

/**
 * Log del puente y rotacion EN CALIENTE de bridge.log.
 *
 * P25: bridge.log lo abre `run-hidden.vbs` con `cmd /c node bridge.mjs >> bridge.log 2>&1`
 * y cmd lo mantiene abierto mientras vive node. En Windows ese handle no comparte
 * escritura ni borrado, asi que no se puede renombrar ni reabrir para truncar (EBUSY).
 * La rotacion que funciona COPIA el contenido a bridge.log.1 y trunca a traves del
 * descriptor heredado (`ftruncate` sobre fd 1/2). Se trunca con el fd y no reabriendo
 * la ruta porque reabrir daria EBUSY y, si la ruta se reemplazo, truncaria un archivo
 * ajeno. Sin redireccion (o sin handle confirmado) se renombra: es atomico.
 * Rotacion en caliente (5.1.5): antes solo se rotaba al arrancar y un puente de semanas
 * llenaba el disco. Ahora se instala un escritor POSICIONADO (`writeSync` con posicion
 * propia: el puntero que dejo cmd apunta al tamano previo y dejaria un hueco de ceros al
 * truncar), se mira el tamano acumulado tras cada linea y, si alcanza DSH_LOG_MAX_MB, se
 * rota; un temporizador de 30 s cubre los bytes ajenos al escritor. Todo el camino es
 * sincrono (un solo hilo): copiar a temporal -> desplazar .1->.2, .2->.3... -> renombrar
 * -> truncar. Ninguna linea queda a medias ni se duplica; si algo falla antes del
 * truncado el archivo actual queda intacto y se reintenta en 60 s.
 * DSH_LOG_MAX_MB (MB, por defecto 5, minimo 1) y DSH_LOG_KEEP (rotados retenidos, por
 * defecto 3, entre 1 y 10): un valor invalido solo avisa y usa el default, nunca impide
 * arrancar.
 */

const MB = 1024 * 1024;
const DEFAULT_MAX_MB = 5;
const DEFAULT_KEEP = 3;
const MIN_MAX_MB = 1;
const MAX_KEEP = 10;
const CHECK_INTERVAL_MS = 30_000;
const RETRY_AFTER_MS = 60_000;
const STDOUT_METHODS = ["log", "info", "debug"];
const STDERR_METHODS = ["warn", "error", "trace"];
const stamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** H5: el log elimina saltos de linea y caracteres de control de datos que
 * controla el cliente, y trunca a 200 los mensajes de error que reflejan su
 * texto: evita inyectar lineas falsas en bridge.log. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
export const sanitizeLogText = (value) => String(value ?? "").replace(CONTROL_CHARS, "");
export const sanitizeLogMessage = (value, maxLength = 200) => {
  const clean = sanitizeLogText(value);
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
};

export const log = (scope, message) => console.log(`[${stamp()}] [${scope}] ${sanitizeLogText(message)}`);
export const warn = (scope, message) => console.warn(`[${stamp()}] [${scope}] ${sanitizeLogText(message)}`);

const fileStat = (file) => {
  try { const stat = fs.statSync(file); return stat.isFile() ? stat : null; } catch { return null; }
};

const fdStat = (fd) => {
  try { const stat = fs.fstatSync(fd); return stat.isFile() ? stat : null; } catch { return null; }
};

/** Mismo archivo fisico segun device/inodo; ino 0 no permite confirmarlo. */
const sameFile = (left, right) =>
  Boolean(left && right && left.dev === right.dev && left.ino > 0 && left.ino === right.ino);

const archiveName = (logFile, index) => `${logFile}.${index}`;

const safeUnlink = (file) => {
  try { fs.rmSync(file, { force: true }); } catch {}
};

/** Desplaza bridge.log.1 -> .2, .2 -> .3 ... y borra el mas viejo. */
const shiftArchives = (logFile, keep) => {
  for (let index = keep; index >= 1; index -= 1) {
    const target = archiveName(logFile, index);
    const source = index === 1 ? null : archiveName(logFile, index - 1);
    fs.rmSync(target, { force: true });
    if (source && fileStat(source)) fs.renameSync(source, target);
  }
};

/** Avisa de valores de entorno invalidos sin detener el arranque. */
const emitWarnings = (warnings) => {
  for (const message of warnings) console.warn(`[${stamp()}] [log] aviso: ${sanitizeLogText(message)}`);
};

/**
 * Lee y valida DSH_LOG_MAX_MB y DSH_LOG_KEEP. Siempre devuelve valores utilizables: un
 * valor invalido se avisa en `warnings` y se usa el default; un valor positivo por debajo
 * del minimo se eleva al minimo.
 */
export function readLogLimits(env = process.env) {
  const source = env ?? {};
  const warnings = [];
  let maxMb = DEFAULT_MAX_MB;
  const rawMax = String(source.DSH_LOG_MAX_MB ?? "").trim();
  if (rawMax !== "") {
    const parsed = Number(rawMax);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      warnings.push(`DSH_LOG_MAX_MB="${rawMax}" no es un numero positivo; se usa el default ${DEFAULT_MAX_MB} MB`);
    } else if (parsed < MIN_MAX_MB) {
      warnings.push(`DSH_LOG_MAX_MB="${rawMax}" es menor que el minimo ${MIN_MAX_MB} MB; se usa ${MIN_MAX_MB} MB`);
      maxMb = MIN_MAX_MB;
    } else {
      maxMb = parsed;
    }
  }
  let keep = DEFAULT_KEEP;
  const rawKeep = String(source.DSH_LOG_KEEP ?? "").trim();
  if (rawKeep !== "") {
    const parsed = Number(rawKeep);
    if (!Number.isInteger(parsed) || parsed < 1) {
      warnings.push(`DSH_LOG_KEEP="${rawKeep}" no es un entero entre 1 y ${MAX_KEEP}; se usa el default ${DEFAULT_KEEP}`);
    } else if (parsed > MAX_KEEP) {
      warnings.push(`DSH_LOG_KEEP="${rawKeep}" supera el maximo ${MAX_KEEP}; se usa ${MAX_KEEP}`);
      keep = MAX_KEEP;
    } else {
      keep = parsed;
    }
  }
  return { maxBytes: Math.max(1, Math.round(maxMb * MB)), maxMb, keep, warnings };
}

/**
 * Controlador de rotacion de un bridge.log: escribe por el descriptor heredado con
 * posicion propia (modo "positioned") o rota renombrando (modo "rename").
 */
const createController = ({ logFile, maxBytes, keep, mode, fd, position }) => {
  const state = {
    logFile, maxBytes, keep, mode, fd, position,
    rotations: 0, bytesRotated: 0, nextAttemptAt: 0, lastError: "", timer: null, restoreConsole: () => {},
  };
  const labelMb = () => `${Math.round((state.maxBytes / MB) * 100) / 100} MB`;
  const failure = (error) => error.code || error.message || String(error);

  const writeLine = (text) => {
    const buffer = Buffer.from(text.endsWith("\n") ? text : `${text}\n`, "utf8");
    let done = 0;
    while (done < buffer.length) {
      done += fs.writeSync(state.fd, buffer, done, buffer.length - done, state.position + done);
    }
    state.position += buffer.length;
  };
  const notice = (message) => writeLine(`[${stamp()}] [log] ${message}`);

  /**
   * Rotacion con el archivo abierto: copiar a temporal -> desplazar -> .1 -> truncar por
   * el fd heredado. Si falla antes del truncado, bridge.log queda intacto.
   */
  const rotateOpenFile = () => {
    const stat = fileStat(state.logFile);
    const size = stat ? stat.size : 0;
    if (size === 0) {
      state.position = 0;
      return { ok: true, size };
    }
    const temporary = `${state.logFile}.1.tmp`;
    try {
      safeUnlink(temporary);
      // Se copia por ruta a un temporal: cmd abre con permiso de lectura, asi que leer
      // funciona, y el temporal evita dejar un .1 a medias si la copia falla.
      fs.copyFileSync(state.logFile, temporary);
    } catch (error) {
      safeUnlink(temporary);
      return { ok: false, size, error: failure(error) };
    }
    try {
      shiftArchives(state.logFile, state.keep);
      fs.renameSync(temporary, archiveName(state.logFile, 1));
    } catch (error) {
      safeUnlink(temporary);
      return { ok: false, size, error: failure(error) };
    }
    try {
      fs.ftruncateSync(state.fd, 0);
      const after = fdStat(state.fd);
      if (!after || after.size !== 0) throw new Error("el descriptor heredado no apunta a bridge.log");
    } catch (error) {
      // El archivo actual sigue intacto: se retira la copia para no duplicarla.
      safeUnlink(archiveName(state.logFile, 1));
      return { ok: false, size, error: failure(error) };
    }
    state.position = 0;
    state.rotations += 1;
    state.bytesRotated += size;
    notice(
      `bridge.log superaba ${labelMb()}: ${size} bytes movidos a bridge.log.1 ` +
        `(archivo actual vaciado y en uso; se conservan ${state.keep} archivos rotados)`
    );
    return { ok: true, size };
  };

  /** Barato mientras no se alcanza el limite; se llama tras cada escritura. */
  const maybeRotate = () => {
    if (state.mode !== "positioned" || state.position < state.maxBytes) return { ok: true, skipped: true };
    const now = Date.now();
    if (now < state.nextAttemptAt) return { ok: false, deferred: true };
    const result = rotateOpenFile();
    if (result.ok) {
      state.lastError = "";
      state.nextAttemptAt = 0;
      return result;
    }
    state.nextAttemptAt = now + RETRY_AFTER_MS;
    const message = `bridge.log (${result.size} bytes) no se pudo rotar: ${result.error}. ` +
      "Se sigue escribiendo en el archivo actual; se reintenta en 60 s.";
    if (message !== state.lastError) {
      state.lastError = message;
      notice(message);
    }
    return result;
  };

  /** Rotacion sin archivo abierto: desplazar y renombrar (atomico). */
  const rotateByRename = () => {
    const stat = fileStat(state.logFile);
    if (!stat || stat.size < state.maxBytes) {
      state.nextAttemptAt = 0;
      return { ok: true, skipped: true, size: stat ? stat.size : 0 };
    }
    const now = Date.now();
    if (now < state.nextAttemptAt) return { ok: false, deferred: true, size: stat.size };
    try {
      shiftArchives(state.logFile, state.keep);
      fs.renameSync(state.logFile, archiveName(state.logFile, 1));
    } catch (error) {
      state.nextAttemptAt = now + RETRY_AFTER_MS;
      const message = `bridge.log (${stat.size} bytes) no se pudo rotar: ${failure(error)}. Se reintenta en 60 s.`;
      if (message !== state.lastError) {
        state.lastError = message;
        console.warn(`[${stamp()}] [log] ${message}`);
      }
      return { ok: false, error: failure(error), size: stat.size };
    }
    state.rotations += 1;
    state.bytesRotated += stat.size;
    state.lastError = "";
    console.warn(`[${stamp()}] [log] bridge.log superaba ${labelMb()}: ${stat.size} bytes movidos a bridge.log.1 ` +
      `(se conservan ${state.keep} archivos rotados)`);
    return { ok: true, size: stat.size };
  };

  /** Red de seguridad cada 30 s: cubre bytes que no pasaron por el escritor. */
  const check = () => {
    try {
      if (state.mode === "positioned") {
        const stat = fdStat(state.fd);
        if (!stat) return;
        // Si algo escribio sin pasar por el escritor, se adopta su tamano para no
        // pisar esas lineas con nuestra posicion.
        if (stat.size !== state.position) state.position = stat.size;
        maybeRotate();
      } else {
        rotateByRename();
      }
    } catch {}
  };

  const timer = setInterval(check, CHECK_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  state.timer = timer;

  return {
    state,
    writeText: (text) => {
      writeLine(text);
      maybeRotate();
    },
    rotateOpenFile,
    maybeRotate,
    rotateByRename,
    stop: () => {
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
    },
  };
};

/** Reemplaza console.* por escrituras posicionadas que disparan la rotacion. */
const applyConsole = (controller, methods) => {
  const originals = new Map();
  for (const method of methods) {
    const original = console[method];
    if (typeof original !== "function") continue;
    originals.set(method, original);
    console[method] = (...args) => {
      try {
        controller.writeText(util.format(...args));
      } catch {
        try {
          original.apply(console, args);
        } catch {}
      }
    };
  }
  return () => {
    for (const [method, original] of originals) console[method] = original;
  };
};

/** Controlador activo (bridge.mjs llama una sola vez). */
let activeController = null;

/** Detiene el temporizador y devuelve console.* a su implementacion original. */
export function stopLogRotation() {
  if (!activeController) return;
  try {
    activeController.stop();
    activeController.state.restoreConsole();
  } catch {}
  activeController = null;
}

/**
 * Rota bridge.log si supera el limite y deja instalada la rotacion en caliente. Nunca
 * lanza: si falla, se sigue escribiendo en el archivo actual y el resumen trae `error`.
 * Devuelve { rotated, mode, bytes, maxBytes, keep, hot, hotMode, warnings, already?, error? }.
 */
export function rotateBridgeLog(logFile, options = {}) {
  const limits = readLogLimits(options.env ?? process.env);
  const maxBytes = options.maxBytes ?? limits.maxBytes;
  const keep = options.keep ?? limits.keep;
  const warnings = limits.warnings.slice();

  try {
    if (activeController && activeController.state.logFile === logFile) {
      const mode = activeController.state.mode === "positioned" ? "copy-truncate" : "rename";
      const current = activeController.state;
      return { rotated: false, mode, bytes: 0, maxBytes: current.maxBytes, keep: current.keep, hot: true, already: true, warnings };
    }
    if (activeController) stopLogRotation();

    const stat = fileStat(logFile);
    if (!stat) {
      emitWarnings(warnings);
      return { rotated: false, mode: "none", bytes: 0, maxBytes, keep, hot: false, warnings };
    }

    const stdoutIsLog = sameFile(fdStat(1), stat);
    const stderrIsLog = sameFile(fdStat(2), stat);

    // Sin redireccion: renombrar es atomico y no pierde nada. Se instala igual la rotacion
    // en caliente por si el archivo crece mientras el puente vive.
    if (!stdoutIsLog && !stderrIsLog) {
      let rotated = false;
      let error = "";
      if (stat.size >= maxBytes) {
        try {
          shiftArchives(logFile, keep);
          fs.renameSync(logFile, archiveName(logFile, 1));
          rotated = true;
        } catch (renameError) {
          error = renameError.code || renameError.message;
        }
      }
      activeController = createController({ logFile, maxBytes, keep, mode: "rename", fd: null, position: 0 });
      if (warnings.length) emitWarnings(warnings);
      const summary = { rotated, mode: rotated ? "rename" : "none", bytes: stat.size, maxBytes, keep, hot: true, hotMode: "rename", warnings };
      if (error) summary.error = error;
      return summary;
    }

    // Con la redireccion de cmd.exe: escritor posicionado + ftruncate.
    const controller = createController({
      logFile, maxBytes, keep, mode: "positioned", fd: stdoutIsLog ? 1 : 2, position: stat.size,
    });
    const methods = [];
    if (stdoutIsLog) methods.push(...STDOUT_METHODS);
    if (stderrIsLog) methods.push(...STDERR_METHODS);
    const rotation = stat.size >= maxBytes ? controller.rotateOpenFile() : { ok: true, size: stat.size };
    controller.state.restoreConsole = applyConsole(controller, methods);
    activeController = controller;
    if (warnings.length) emitWarnings(warnings);

    const rotated = rotation.ok && rotation.size > 0;
    const summary = {
      rotated,
      mode: rotated ? "copy-truncate" : "none",
      bytes: rotation.size,
      maxBytes,
      keep,
      hot: true,
      hotMode: "positioned",
      warnings,
    };
    if (!rotation.ok) summary.error = rotation.error;
    return summary;
  } catch (error) {
    return { rotated: false, mode: "none", bytes: 0, maxBytes, keep, hot: Boolean(activeController), warnings, error: error.code || error.message };
  }
}
