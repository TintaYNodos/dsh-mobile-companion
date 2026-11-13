/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
const buckets = new Map();
let lastSweep = Date.now();

const MAX_BUCKETS = 4096;

const sweep = (now) => {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > 300_000) buckets.delete(key);
  }
  // Tope duro: si un atacante genera claves unicas, se descarta lo mas viejo.
  while (buckets.size > MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
};

/**
 * Limitador de cubo de fichas por clave (IP + ruta). Suficiente para frenar
 * bucles de reintento y abuso trivial sin necesitar estado persistente.
 */
export function consumeAllowance(key, { capacity = 30, refillPerSecond = 0.5 } = {}) {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
  bucket.updatedAt = now;

  const allowed = bucket.tokens >= 1;
  if (allowed) bucket.tokens -= 1;

  buckets.set(key, bucket);
  return allowed;
}
