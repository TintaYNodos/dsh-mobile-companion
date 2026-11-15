# ==============================================================================
# DSH Mobile Companion - Dockerfile Ligero Multi-Arquitectura
# Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes
# SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
# ==============================================================================

# P10: Node >=22.15 tiene zstd nativo en node:zlib (src/pc-events.mjs usa
# zstdDecompressSync sobre session.v4.jsonl.zstd). node:20-alpine no lo tiene,
# asi que el descompresor de eventos fallaba dentro del contenedor.
FROM node:22-alpine

# Cero dependencias npm externas: Node.js nativo puro (node:http, node:crypto, etc.)
ENV NODE_ENV=production
ENV DSH_HOME=/home/node/.dsh

WORKDIR /app

# Crear directorio de datos para usuario node
RUN mkdir -p /home/node/.dsh /app/synced_chats && chown -R node:node /home/node /app

# Copiar código fuente. offline.html carga sus hojas y scripts por separado:
# si no se copian, /offline se sirve sin estilos y sin lógica.
COPY --chown=node:node bridge.mjs offline.html ./
COPY --chown=node:node icon.svg manifest.webmanifest ./
COPY --chown=node:node offline.css offline-reader.css offline-satellite.css ./
COPY --chown=node:node offline-core.js offline-reader.js offline-satellite.js ./
COPY --chown=node:node src/ ./src/

USER node

# Exponer puertos: 57420 (puente móvil) y 57421 (panel de autorización)
EXPOSE 57420 57421

VOLUME ["/home/node/.dsh", "/app/synced_chats"]

# P49: healthcheck real contra /dsh-companion/status: es la unica ruta que
# responde 200 sin credenciales a un cliente que no pide HTML (el resto, como
# /offline, devuelve 403 o la pagina de espera de aprobacion). Ademas de exigir
# 200 se comprueba que el cuerpo identifique al puente, para no dar por sano el
# 200 de otro servidor que hubiera ocupado el puerto.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["node", "-e", "require('http').get('http://127.0.0.1:57420/dsh-companion/status', (r) => { let b = ''; r.setEncoding('utf8'); r.on('data', (c) => b += c); r.on('end', () => process.exit(r.statusCode === 200 && b.includes('dsh-companion') ? 0 : 1)); }).on('error', () => process.exit(1))"]

CMD ["node", "bridge.mjs"]
