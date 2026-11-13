# ==============================================================================
# DSH Mobile Companion - Dockerfile Ligero Multi-Arquitectura
# Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes
# SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
# ==============================================================================

FROM node:20-alpine

# Cero dependencias npm externas: Node.js nativo puro (node:http, node:crypto, etc.)
ENV NODE_ENV=production
ENV DSH_HOME=/home/node/.dsh

WORKDIR /app

# Crear directorio de datos para usuario node
RUN mkdir -p /home/node/.dsh /app/synced_chats && chown -R node:node /home/node /app

# Copiar código fuente
COPY --chown=node:node bridge.mjs offline.html ./
COPY --chown=node:node src/ ./src/

USER node

# Exponer puertos: 57420 (puente móvil) y 57421 (panel de autorización)
EXPOSE 57420 57421

VOLUME ["/home/node/.dsh", "/app/synced_chats"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e 'require("http").get("http://127.0.0.1:57420/dsh-companion/status", (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1))'

CMD ["node", "bridge.mjs"]
