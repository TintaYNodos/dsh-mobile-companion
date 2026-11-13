#!/usr/bin/env bash
# ==============================================================================
# DSH Mobile Companion - Desinstalador de LaunchAgent (macOS)
# Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes
# SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
# ==============================================================================
set -euo pipefail

PLIST_FILE="${HOME}/Library/LaunchAgents/com.tintaynodos.dsh-companion.plist"

echo "Descargando servicio launchd..."
launchctl unload -w "${PLIST_FILE}" 2>/dev/null || true

if [ -f "${PLIST_FILE}" ]; then
  rm -f "${PLIST_FILE}"
  echo "Archivo eliminado: ${PLIST_FILE}"
fi

echo "DSH Mobile Companion ha sido desinstalado de launchd correctamente."
