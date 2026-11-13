#!/usr/bin/env bash
# ==============================================================================
# DSH Mobile Companion - Instalador de Servicio Systemd (Linux)
# Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes
# SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_PATH="${SCRIPT_DIR}/bridge.mjs"

if [ ! -f "${BRIDGE_PATH}" ]; then
  echo "Error: No se encontró bridge.mjs en ${SCRIPT_DIR}" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "${NODE_BIN}" ]; then
  echo "Error: Node.js no está instalado o no se encuentra en el PATH." >&2
  exit 1
fi

SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SERVICE_DIR}/dsh-companion.service"

mkdir -p "${SERVICE_DIR}"

cat <<EOF > "${SERVICE_FILE}"
[Unit]
Description=DSH Mobile Companion (Puente Móvil Soberano)
After=network.target

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${NODE_BIN} ${BRIDGE_PATH}
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable dsh-companion.service
systemctl --user restart dsh-companion.service

echo ""
echo "========================================================"
echo "  DSH Mobile Companion instalado con éxito en Linux"
echo "========================================================"
echo "Servicio: dsh-companion.service (systemd user)"
echo "Estado:   systemctl --user status dsh-companion"
echo "Logs:     journalctl --user -u dsh-companion -f"
echo "Detener:  systemctl --user stop dsh-companion"
echo "========================================================"
