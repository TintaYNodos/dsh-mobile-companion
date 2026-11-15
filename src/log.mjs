/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
import fs from "node:fs";
import util from "node:util";

/**
 * Log del puente y rotacion de bridge.log.
 *
 * P25: bridge.log no lo escribimos nosotros: lo abre `run-hidden.vbs` con
 * `cmd /c node bridge.mjs >> bridge.log 2>&1` y lo mantiene abierto mientras
 * vive el proceso. En Windows ese handle de cmd no comparte escritura ni
 * borrado, asi que al arrancar NO se puede renombrar ni truncar bridge.log con
 * una apertura nueva (siempre da EBUSY) y el `renameSync` de antes fallaba en
 * silencio: el archivo crecia sin limite.
 *
 * La rotacion que si funciona tiene dos caminos:
 *  1. Sin redireccion (stdout en consola, POSIX, o el archivo no esta abierto):
 *     se renombra a `bridge.log.1`, que es atomico y no pierde nada.
 *  2. Con la redireccion de cmd.exe (fd 1/2 apuntando al propio bridge.log):
 *     se copia el contenido a `bridge.log.1` (copiar si esta permitido) y se
 *     trunca el archivo a traves del descriptor YA ABIERTO que heredamos
 *     (`ftruncate` sobre fd 1/2), no abriendo el archivo de nuevo. A partir de
 *     ahi las lineas se escriben con `writeSync(fd, ..., posicion)` llevando
 *     nuestra propia posicion, porque el puntero compartido que dejo cmd
 *     apunta al final anterior y dejaria un hueco de ceros.
 *
 * Todo esto ocurre en `rotateBridgeLog()`, que bridge.mjs llama antes de su
 * primer log: la rotacion siempre es previa a la primera linea nueva.
 */

const LOG_MAX_BYTES = 5 * 1024 * 1024;
const ROTATED_SUFFIX = ".1";

/** Metodos de console que redirigimos cuando stdout/stderr son bridge.log. */
const CONSOLE_METHODS = ["log", "info", "debug", "warn", "error"];

const stamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export const log = (scope, message) => console.log(`[${stamp()}] [${scope}] ${message}`);
export const warn = (scope, message) => console.warn(`[${stamp()}] [${scope}] ${message}`);

const fileStat = (file) => {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
};

const fdStat = (fd) => {
  try {
    const stat = fs.fstatSync(fd);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
};

/** Mismo archivo fisico segun device/inodo del handle abierto y del path. */
const sameFile = (left, right) => {
  if (!left || !right) return false;
  if (left.dev !== right.dev) return false;
  // En Windows y Linux el inodo identifica el archivo; ino 0 no permite
  // confirmarlo y en ese caso no se toca nada (fail-closed).
  return left.ino > 0 && left.ino === right.ino;
};

/**
 * Reemplaza console.* por escrituras posicionadas sobre el descriptor de
 * bridge.log. Compartimos una unica posicion para que log/warn/error sigan
 * saliendo en orden aunque el handle lo hayan heredado de cmd.
 */
const installPositionedConsole = (fd, methods) => {
  let position = 0;

  const writePositioned = (text) => {
    const buffer = Buffer.from(text, "utf8");
    let done = 0;
    while (done < buffer.length) {
      done += fs.writeSync(fd, buffer, done, buffer.length - done, position + done);
    }
    position += buffer.length;
  };

  for (const method of methods) {
    const original = console[method];
    console[method] = (...args) => {
      try {
        writePositioned(`${util.format(...args)}\n`);
      } catch {
        try {
          original.apply(console, args);
        } catch {}
      }
    };
  }

  return writePositioned;
};

/**
 * Rota bridge.log si supera `maxBytes`.
 *
 * Devuelve un resumen para que el arranque pueda informar del resultado sin
 * lanzar excepciones ni ensuciar el log con trazas.
 *
 * @param {string} logFile ruta absoluta de bridge.log
 * @param {{ maxBytes?: number }} [options]
 * @returns {{ rotated: boolean, mode: "none" | "rename" | "copy-truncate", bytes: number, error?: string }}
 */
export function rotateBridgeLog(logFile, { maxBytes = LOG_MAX_BYTES } = {}) {
  const stat = fileStat(logFile);
  if (!stat) return { rotated: false, mode: "none", bytes: 0 };
  if (stat.size < maxBytes) return { rotated: false, mode: "none", bytes: stat.size };

  const previous = `${logFile}${ROTATED_SUFFIX}`;

  // Camino 1: la redireccion del .vbs (u otra) esta escribiendo EN bridge.log.
  // Solo se toca el archivo si el handle heredado (fd 1 o 2) es de VERDAD el
  // mismo bridge.log: si no, un `node bridge.mjs > otro.log` truncaria un
  // archivo ajeno. Copiar + truncar por el fd abierto conserva el archivo vivo
  // para cmd.exe y funciona igual en Windows y POSIX.
  const stdoutStat = fdStat(1);
  const stderrStat = fdStat(2);
  const stdoutIsLog = sameFile(stdoutStat, stat);
  const stderrIsLog = sameFile(stderrStat, stat);
  if (!stdoutIsLog && !stderrIsLog) {
    // Camino 2: nadie escribe bridge.log desde este proceso: renombrar.
    try {
      if (fileStat(previous)) fs.unlinkSync(previous);
      fs.renameSync(logFile, previous);
      return { rotated: true, mode: "rename", bytes: stat.size };
    } catch (error) {
      return {
        rotated: false,
        mode: "none",
        bytes: stat.size,
        error: error.code || "el archivo esta abierto por otro proceso",
      };
    }
  }

  const truncateFd = stdoutIsLog ? 1 : 2;
  try {
    fs.copyFileSync(logFile, previous);
  } catch (error) {
    return { rotated: false, mode: "none", bytes: stat.size, error: error.code || "copia fallida" };
  }

  try {
    fs.ftruncateSync(truncateFd, 0);
    const after = fileStat(logFile);
    if (!after || after.size !== 0) {
      throw new Error("el descriptor heredado no apunta a bridge.log");
    }
  } catch (error) {
    return { rotated: false, mode: "none", bytes: stat.size, error: error.code || error.message };
  }

  // El .vbs manda stdout y stderr al mismo archivo (2>&1): ambos metodos se
  // escriben por el mismo descriptor, con una sola posicion, para conservar el
  // orden. Si solo uno de los dos fds es bridge.log, se redirigen solo sus
  // metodos y el otro stream sigue yendo a donde el usuario lo mando.
  const methods = [];
  if (stdoutIsLog) methods.push("log", "info", "debug");
  if (stderrIsLog) methods.push("warn", "error");
  const writeRotated = installPositionedConsole(truncateFd, methods);
  writeRotated(
    `[${stamp()}] [log] bridge.log superaba ${Math.round(maxBytes / (1024 * 1024))} MB: ` +
      `${stat.size} bytes movidos a ${previous.split(/[\\/]/).pop()} (archivo actual vaciado y en uso)\n`
  );

  return { rotated: true, mode: "copy-truncate", bytes: stat.size };
}
