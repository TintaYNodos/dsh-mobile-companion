/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BUSL-1.1
 * See LICENSE file in repository root for full terms.
 */
/**
 * Reparacion del "mojibake": UTF-8 que un cliente o el portapapeles ya entrego
 * leido como Latin-1/cp1252. El patron tipico es una `Ã`/`Â` seguida de un
 * caracter del rango U+0080-U+00BF, o una `â` seguida de un simbolo cp1252 (el
 * prefijo de 3 bytes); por ejemplo `r` U+00C3 U+00A1 `pido` en vez de `rápido`.
 *
 * `repairMojibake` es una funcion pura: convierte cada caracter al byte que
 * representa (Latin-1 y tabla cp1252 para los simbolos 0x80-0x9F) y decodifica
 * con UTF-8 ESTRICTO. Solo sustituye el texto cuando la decodificacion es
 * valida, no vacia y el resultado ya no parece mojibake (nunca se repara dos
 * veces). Si el texto contiene Unicode legitimo que no cabe en un byte o si
 * tras una pasada sigue pareciendo mojibake, queda intacto con
 * `unambiguous: false`: el llamador no debe tocarlo. El contrato de retorno es
 * `{ text, repaired, unambiguous }`; el llamador decide que hacer (ver
 * notes-format.mjs: reparto y rechazo 400 son fail-closed).
 */

/** Decodificador UTF-8 estricto: lanza si los bytes no son UTF-8 valido. */
const STRICT_UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Patron de mojibake: prefijo de 2 bytes leido como Latin-1 (`Â`/`Ã` + byte de
 * continuacion 0x80-0xBF) o `â` (prefijo de 3 bytes) seguido de un byte de
 * continuacion o del simbolo cp1252 en que quedo ese byte.
 */
const MOJIBAKE_RE =
  /[\u00C2\u00C3][\u0080-\u00BF]|\u00E2(?:[\u0080-\u00BF]|[\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122])/;

/** Punto de codigo cp1252 de cada byte 0x80-0x9F (-1 = byte sin caracter). */
const CP1252_HIGH = [
  0x20ac, -1, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, -1, 0x017d, -1,
  -1, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, -1, 0x017e, 0x0178,
];
const CP1252_BYTES = new Map();
CP1252_HIGH.forEach((code, index) => {
  if (code > 0) CP1252_BYTES.set(String.fromCharCode(code), 0x80 + index);
});

/**
 * Bytes que representa el texto segun Latin-1/cp1252, o null si contiene
 * Unicode real (CJK, emoji...) que no corresponde a un byte concreto.
 */
const toBytes = (value) => {
  const bytes = [];
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_BYTES.get(char);
    if (mapped === undefined) return null;
    bytes.push(mapped);
  }
  return Uint8Array.from(bytes);
};

/**
 * Repara `value` si es mojibake inequivoco. Devuelve `{ text, repaired,
 * unambiguous }`: `text` es lo que hay que usar (igual a `value` si no se toco).
 * `unambiguous: true` con `repaired: false` significa patron claro pero
 * irreparable (UTF-8 invalido): el llamador lo rechaza. `unambiguous: false`
 * significa ambiguo (Unicode mezclado o doble codificado): no se toca.
 */
export const repairMojibake = (value) => {
  if (typeof value !== "string" || !MOJIBAKE_RE.test(value)) {
    return { text: value, repaired: false, unambiguous: true };
  }
  const bytes = toBytes(value);
  if (bytes === null) return { text: value, repaired: false, unambiguous: false };
  let decoded;
  try {
    decoded = STRICT_UTF8.decode(bytes);
  } catch {
    // El patron es claro pero los bytes no forman UTF-8: no se puede reparar.
    return { text: value, repaired: false, unambiguous: true };
  }
  // Una sola pasada: si el resultado sigue pareciendo mojibake esta doblemente
  // codificado y no se toca; una decodificacion vacia tampoco es una reparacion.
  if (decoded === "" || MOJIBAKE_RE.test(decoded)) {
    return { text: value, repaired: false, unambiguous: false };
  }
  return { text: decoded, repaired: true, unambiguous: true };
};

/** true si el texto contiene el patron tipico de mojibake. */
export const hasMojibakePattern = (value) => typeof value === "string" && MOJIBAKE_RE.test(value);
