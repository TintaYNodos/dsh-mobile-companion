/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */

// Tablas de Galois Field GF(256) con polinomio primitivo 0x11d (285)
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
let val = 1;
for (let i = 0; i < 255; i++) {
  EXP[i] = val;
  EXP[i + 255] = val;
  LOG[val] = i;
  val <<= 1;
  if (val & 256) val ^= 0x11d;
}

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGen(n) {
  let g = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(g.length + 1);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= gfMul(g[j], EXP[i]);
      next[j + 1] ^= g[j];
    }
    g = next;
  }
  return g;
}

function rsCompute(data, n) {
  const gen = rsGen(n);
  const out = new Uint8Array(n);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ out[0];
    for (let j = 0; j < n - 1; j++) {
      out[j] = out[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    out[n - 1] = gfMul(gen[n], factor);
  }
  return out;
}

// Especificación para Nivel L (Error Correction Level L - 7%)
const VERSIONS = [
  { ver: 1, size: 21, data: 19, ec: 7, align: [] },
  { ver: 2, size: 25, data: 34, ec: 10, align: [18] },
  { ver: 3, size: 29, data: 55, ec: 15, align: [22] },
  { ver: 4, size: 33, data: 80, ec: 20, align: [26] },
  { ver: 5, size: 37, data: 108, ec: 26, align: [30] },
  { ver: 6, size: 41, data: 136, ec: 36, align: [34] },
];

/**
 * Generador nativo de códigos QR en SVG puro mediante matriz matemática.
 * Sin dependencias externas ni librerías de terceros.
 *
 * @param {string} text Contenido a codificar (p.ej. http://<VPN_IP>:57420)
 * @param {object} [options] Opciones de visualización (size, margin, bg, fg)
 * @returns {string} Código SVG vectorial puro y nítido
 */
export function generateQrSvg(text, options = {}) {
  const {
    size = 200,
    margin = 3,
    bgColor = "#ffffff",
    fgColor = "#000000",
  } = options;

  const rawBytes = Buffer.from(String(text || ""), "utf8");
  let chosen = null;
  for (const v of VERSIONS) {
    if (rawBytes.length <= v.data - 2) {
      chosen = v;
      break;
    }
  }
  if (!chosen) chosen = VERSIONS[VERSIONS.length - 1];

  const { ver, size: modCount, data: dataLen, ec: ecLen, align } = chosen;

  // Codificación Byte Mode (0100) + conteo de caracteres (8 bits para ver 1-9)
  const bitBuf = [];
  const pushBits = (num, len) => {
    for (let i = len - 1; i >= 0; i--) bitBuf.push((num >>> i) & 1);
  };

  pushBits(0b0100, 4); // Indicador de modo Byte
  pushBits(rawBytes.length, 8); // Conteo
  for (let i = 0; i < rawBytes.length; i++) {
    pushBits(rawBytes[i], 8);
  }

  // Terminador y alineación a múltiplos de 8 bits
  const totalDataBits = dataLen * 8;
  const termLen = Math.min(4, totalDataBits - bitBuf.length);
  pushBits(0, termLen);
  while (bitBuf.length % 8 !== 0) bitBuf.push(0);

  // Bytes de relleno (0xEC, 0x11)
  const padPatterns = [0xec, 0x11];
  let pIdx = 0;
  while (bitBuf.length < totalDataBits) {
    pushBits(padPatterns[pIdx % 2], 8);
    pIdx++;
  }

  // Conversión a bytes de datos
  const dataBytes = new Uint8Array(dataLen);
  for (let i = 0; i < dataLen; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bitBuf[i * 8 + j];
    dataBytes[i] = b;
  }

  // Corrección de errores Reed-Solomon
  const ecBytes = rsCompute(dataBytes, ecLen);
  const codewords = new Uint8Array(dataLen + ecLen);
  codewords.set(dataBytes, 0);
  codewords.set(ecBytes, dataLen);

  // Inicialización de la matriz
  const matrix = Array.from({ length: modCount }, () => new Int8Array(modCount).fill(-1));
  const isFunc = Array.from({ length: modCount }, () => new Uint8Array(modCount));

  // Patrones de búsqueda (Finders)
  const setFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = r0 + r;
        const nc = c0 + c;
        if (nr < 0 || nr >= modCount || nc < 0 || nc >= modCount) continue;
        isFunc[nr][nc] = 1;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const dark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          matrix[nr][nc] = dark ? 1 : 0;
        } else {
          matrix[nr][nc] = 0;
        }
      }
    }
  };

  setFinder(0, 0);
  setFinder(0, modCount - 7);
  setFinder(modCount - 7, 0);

  // Patrones de temporización (Timing patterns)
  for (let i = 8; i < modCount - 8; i++) {
    if (!isFunc[6][i]) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      isFunc[6][i] = 1;
    }
    if (!isFunc[i][6]) {
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
      isFunc[i][6] = 1;
    }
  }

  // Patrón de alineación (Alignment pattern) para versión >= 2
  if (align.length > 0) {
    const pos = align[0];
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const nr = pos + r;
        const nc = pos + c;
        if (!isFunc[nr][nc]) {
          isFunc[nr][nc] = 1;
          const dark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          matrix[nr][nc] = dark ? 1 : 0;
        }
      }
    }
  }

  // Módulo oscuro obligatorio (Dark module)
  matrix[4 * ver + 9][8] = 1;
  isFunc[4 * ver + 9][8] = 1;

  // Reserva de posiciones para la información de formato
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunc[8][i] = 1;
      isFunc[i][8] = 1;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8][modCount - 1 - i] = 1;
    isFunc[modCount - 1 - i][8] = 1;
  }

  // Colocación de bits de datos y EC en zigzag
  let dir = -1;
  let row = modCount - 1;
  let col = modCount - 1;
  let bitPos = 0;
  const totalCodewordBits = codewords.length * 8;

  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < 2; i++) {
      const c = col - i;
      if (!isFunc[row][c]) {
        let b = 0;
        if (bitPos < totalCodewordBits) {
          b = (codewords[Math.floor(bitPos / 8)] >>> (7 - (bitPos % 8))) & 1;
          bitPos++;
        }
        matrix[row][c] = b;
      }
    }
    row += dir;
    if (row < 0 || row >= modCount) {
      dir = -dir;
      row += dir;
      col -= 2;
    }
  }

  // Evaluación y selección de la mejor máscara matemática
  const maskFns = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  const evaluateMask = (maskIdx) => {
    const fn = maskFns[maskIdx];
    let penalty = 0;

    for (let r = 0; r < modCount; r++) {
      let run = 0;
      let last = -1;
      for (let c = 0; c < modCount; c++) {
        const val = isFunc[r][c] ? matrix[r][c] : matrix[r][c] ^ (fn(r, c) ? 1 : 0);
        if (val === last) {
          run++;
        } else {
          if (run >= 5) penalty += 3 + (run - 5);
          run = 1;
          last = val;
        }
      }
      if (run >= 5) penalty += 3 + (run - 5);
    }

    for (let c = 0; c < modCount; c++) {
      let run = 0;
      let last = -1;
      for (let r = 0; r < modCount; r++) {
        const val = isFunc[r][c] ? matrix[r][c] : matrix[r][c] ^ (fn(r, c) ? 1 : 0);
        if (val === last) {
          run++;
        } else {
          if (run >= 5) penalty += 3 + (run - 5);
          run = 1;
          last = val;
        }
      }
      if (run >= 5) penalty += 3 + (run - 5);
    }

    return penalty;
  };

  let bestMask = 0;
  let minPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    const p = evaluateMask(m);
    if (p < minPenalty) {
      minPenalty = p;
      bestMask = m;
    }
  }

  // Aplicar la máscara óptima elegida
  const chosenMaskFn = maskFns[bestMask];
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (!isFunc[r][c]) {
        matrix[r][c] ^= chosenMaskFn(r, c) ? 1 : 0;
      }
    }
  }

  // Codificación de formato (Nivel L = 01 en binario)
  const data5 = (0b01 << 3) | bestMask;
  let d = data5 << 10;
  for (let i = 14; i >= 10; i--) {
    if ((d >>> i) & 1) d ^= 0x537 << (i - 10);
  }
  const fmt = ((data5 << 10) | d) ^ 0x5412;

  const fmtCoordsTL = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
    [2, 8], [1, 8], [0, 8],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (fmt >>> i) & 1;
    const [r, c] = fmtCoordsTL[i];
    matrix[r][c] = bit;
  }

  for (let i = 0; i < 7; i++) {
    matrix[modCount - 1 - i][8] = (fmt >>> i) & 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][modCount - 8 + i] = (fmt >>> (7 + i)) & 1;
  }

  // Generación de trazado SVG de máxima nitidez (crispEdges)
  const fullSize = modCount + margin * 2;
  let pathD = "";
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (matrix[r][c] === 1) {
        pathD += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullSize} ${fullSize}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="Codigo QR para conexion movil"><rect width="100%" height="100%" fill="${bgColor}"/><path d="${pathD}" fill="${fgColor}"/></svg>`;
}
