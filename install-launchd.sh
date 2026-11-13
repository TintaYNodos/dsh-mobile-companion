#!/usr/bin/env bash
# ==============================================================================
# DSH Mobile Companion - Instalador de LaunchAgent (macOS)
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
  if [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
  else
    echo "Error: Node.js no está instalado o no se encuentra en el PATH." >&2
    exit 1
  fi
fi

AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_FILE="${AGENTS_DIR}/com.tintaynodos.dsh-companion.plist"
LOG_DIR="${HOME}/Library/Logs"

mkdir -p "${AGENTS_DIR}" "${LOG_DIR}"

cat <<EOF > "${PLIST_FILE}"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.tintaynodos.dsh-companion</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${BRIDGE_PATH}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${SCRIPT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/dsh-companion.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/dsh-companion.error.log</string>
</dict>
</plist>
EOF

launchctl unload "${PLIST_FILE}" 2>/dev/null || true
launchctl load -w "${PLIST_FILE}"

echo ""
echo "========================================================"
echo "  DSH Mobile Companion instalado con éxito en macOS"
echo "========================================================"
echo "Servicio: com.tintaynodos.dsh-companion (LaunchAgent)"
echo "Estado:   launchctl list | grep dsh-companion"
echo "Logs:     tail -f ~/Library/Logs/dsh-companion.log"
echo "Detener:  launchctl unload ~/Library/LaunchAgents/com.tintaynodos.dsh-companion.plist"
echo "========================================================"
