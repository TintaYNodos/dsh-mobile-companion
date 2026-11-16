# DSH Mobile Companion 5.2.1 — parche de seguridad (solo puente)

Versión estable de la serie 5.2. **El APK no cambia**: sigue siendo 5.2.0 (`versionCode` 51),
con el mismo SHA-256 y la misma firma; se instala encima sin desinstalar.

## Qué corrige

- **`/healthz` ya no revela topología fuera de loopback.** El healthcheck del contenedor y la PC
  reciben el detalle completo; el resto de equipos de la red privada recibe solo
  `{ service, version, status, ok, time }`. Antes cualquier miembro de la VPN podía leer la IP de
  enlace (`bindHost`), el puerto interno de Harness y el detalle del contrato.
- **Contrato de turnos estricto**: si hay `turn/start` sin `turn/end` en las sesiones recientes,
  el contrato se marca `degraded` y `/healthz` lo refleja (los avisos por turno pueden perderse).
  Sin turnos recientes sigue siendo `ok`.

## Verificación

- Suite del puente y pruebas de `/healthz`: verificación completa en la rama `stable/5`.
- `doctor.ps1 -Json -Report` + `tools/verify-receipt.mjs`: recibo válido.
- APK servido por el puente con el SHA-256 de 5.2.0:
  `cbf157126b565054e4931f1820562887030d6867ca7c34c866cb9995fc4906fd`.

## Cómo usar

- Si ya tienes 5.2.0 instalado: **solo actualiza el puente** (reinícialo o deja que el
  autoarranque lo levante). El teléfono no necesita instalar nada.
- Si vienes de 5.1.x: instala el APK 5.2.0 adjunto a este release y actualiza el puente.

Serie 5.2 congelada: a partir de aquí solo correcciones de seguridad.
