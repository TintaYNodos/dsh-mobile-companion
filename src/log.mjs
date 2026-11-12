/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
const stamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

export const log = (scope, message) => console.log(`[${stamp()}] [${scope}] ${message}`);
export const warn = (scope, message) => console.warn(`[${stamp()}] [${scope}] ${message}`);
