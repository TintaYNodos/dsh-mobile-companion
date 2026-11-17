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
COPY --chown=node:node src/ ./src/

USER node

# Exponer puertos: 57420 (puente móvil) y 57421 (panel de autorización)
EXPOSE 57420 57421

VOLUME ["/home/node/.dsh", "/app/synced_chats"]

# P49/5.2.0: healthcheck real contra /healthz, que distingue los tres estados:
#  - 200 `ok`:         puente arriba y DeepSeek Harness confirmado por identidad.
#  - 200 `degraded`:   puente y Harness arriba, pero alguna pieza del contrato de
#                      Harness cambio (la funcion afectada queda degradada).
#  - 503 `down`:       el puente responde pero Harness no; el contenedor queda
#                      "unhealthy" en vez de fingir que todo esta bien.
# Antes se consultaba /dsh-companion/status, que responde 200 aunque Harness este
# caido: un contenedor "sano" con el telefono incomunicado.
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const p=process.env.DSH_LISTEN_PORT||57420;require('http').get('http://127.0.0.1:'+p+'/healthz',(r)=>{let b='';r.setEncoding('utf8');r.on('data',(c)=>b+=c);r.on('end',()=>{let j=null;try{j=JSON.parse(b)}catch{};process.exit(r.statusCode===200&&j&&j.service==='dsh-companion'&&j.status!=='down'?0:1)});}).on('error',()=>process.exit(1))"]

CMD ["node", "bridge.mjs"]
