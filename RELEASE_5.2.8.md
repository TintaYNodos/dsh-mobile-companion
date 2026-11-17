# DSH Mobile Companion 5.2.8 (`versionCode` 52) — notas locales, sin modo satélite

Versión de producto de la serie 5.2. **Se retira el modo satélite** y entran las **notas locales**:
se guardan solo en el teléfono, funcionan con la PC apagada y sin Internet, y se envían a la
computadora cuando hay conexión.

## Qué se quita

- **El modo satélite completo**: la pestaña de la página offline, el cliente Android que hablaba con
  el servicio externo, sus estilos y su JS, y los ajustes que guardaban la clave.
- **La clave de API de DeepSeek en el teléfono** y el almacén cifrado que la conservaba: el
  dispositivo deja de tener credenciales de terceros y de ser el único punto que salía del perímetro.
- **La ruta de absorción** `POST /dsh-companion/absorb-satellite` y el almacén `satellite_notes/` del
  puente.
- La pestaña de satélite de la página offline: la página queda con **Estado** y **Lector**.

El motivo es el mismo que se documentó al añadirlo: solo funcionaba con la PC encendida, así que no
servía para el caso que decía cubrir y añadía superficie y una credencial en el teléfono.

## Qué se agrega

Notas completas para escritores y programadores: perfiles con tipos propios, proyecto u obra, personaje o módulo, etiquetas, estado, prioridad, filtros y chat destino; el envío a la PC incluye todos los metadatos (front matter + `inbox.jsonl`).

- **Notas locales** en la app: crear, editar, borrar y compartir con el selector de Android. Se
  guardan en el teléfono y funcionan con la PC apagada, sin Internet y sin clave de API.
- **Envío a la PC**: con el puente accesible, *Enviar a la PC* deja la nota en
  `synced_chats/notes/` de la computadora. Si la PC está apagada, la nota sigue en el teléfono y se
  puede enviar más tarde.
- El **lector offline de chats** no cambia en su requisito: los chats los sirve el puente, así que
  sigue necesitando la PC encendida.

## Cómo se instala

1. Instala el APK **5.2.8** (`versionCode` 52) **encima de la 5.2.0** (`versionCode` 51): no hace
   falta desinstalar y la firma no cambia desde la 5.1.7. La clave de API que hubiera guardada se
   borra durante la actualización.
2. Actualiza el puente desde el repositorio y reinícialo (`stop.bat` + `start.bat`, o deja que el
   autoarranque lo levante).
3. Comprueba la versión en Ajustes del teléfono y en `http://<IP-PRIVADA>:57420/dsh-companion/status`
   (`version` y `apkVersionCode`); después prueba una nota con la PC apagada y el envío con la PC
   encendida.

Si vienes de la 5.1.x, actualiza APK y puente juntos; la firma de release es la misma desde la
5.1.7, pero conviene actualizar ambos para que las notas y el puente hablen el mismo contrato.

## Verificación

- `npm test` contra un puente en vivo y la suite de CI; las cifras vigentes se publican en el
  [README](README.md) y en el propio resultado de la suite.
- `node tools/audit-repo.mjs`: sin hallazgos (codificación, enlaces, tablas, versiones y secretos).
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Búsqueda del árbol para confirmar que no queda código ni documento de producto del modo retirado:
  `git grep -n -i "satellite"` fuera de notas históricas. Detalle en
  [AUDITORIA-EXTERNA.md](AUDITORIA-EXTERNA.md).

## La serie 5.2 sigue

La 5.2.8 no es un parche de seguridad: es la siguiente versión de la serie 5.2, con cambio de
producto. La política de soporte de la línea (correcciones de seguridad, sin promesas de funciones)
sigue en [SUPPORT.md](SUPPORT.md); esta versión es la actual y se instala sobre la 5.2.0 sin
desinstalar.

## APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 52` / `versionName 5.2.8` |
| Tamaño | 251 912 bytes (246 KB) |
| SHA-256 | `6592adaa6579c4320d23cb96e46ac71cc3a54776e637d8c47736bc79f20fbddd` |
| Firma | v2+v3, certificado de release RSA 4096 (sin cambios desde 5.1.7: se instala encima de 5.2.0) |

## Verificación de esta entrega

- **17 suites / 328 comprobaciones** en local (254 en CI, 3 SKIP justificados por entorno).
- **Tests Java puros**: 61 watchdog + 16 cleartext + 14 bridgeguard + 25 apkdigest + 189 notas = **305**.
- `node tools/audit-repo.mjs`: sin hallazgos.
- `node test/verify_notes.mjs`: 28/28; `verify_battery_and_landscape.mjs`: 12/12.
- `doctor.ps1 -Json -Report` + recibo válido.
