#!/usr/bin/env bash
# ==============================================================================
# DSH Mobile Companion - Desinstalador de Servicio Systemd (Linux)
# Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes
# SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
# ==============================================================================
set -euo pipefail

SERVICE_FILE="${HOME}/.config/systemd/user/dsh-companion.service"

echo "Deteniendo servicio dsh-companion..."
systemctl --user stop dsh-companion.service 2>/dev/null || true
systemctl --user disable dsh-companion.service 2>/dev/null || true

if [ -f "${SERVICE_FILE}" ]; then
  rm -f "${SERVICE_FILE}"
  systemctl --user daemon-reload
  echo "Archivo de servicio eliminado: ${SERVICE_FILE}"
fi

echo "DSH Mobile Companion ha sido desinstalado de systemd correctamente."
