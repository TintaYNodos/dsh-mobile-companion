# DSH Mobile Companion 5.4.0 (`versionCode` 67) — versión estable final de la serie 5

Cierre de la serie 5. La 5.4.0 recoge todo lo publicado desde la 5.2.9: las correcciones de la
5.2.10 (integridad de las notas, acceso, QR y operación) y el trabajo de producto de la línea 5.3:
comandos y teclas por perfil, compositor con tope, dock compacto de 44 dp, pantalla de «sin
conexión», Hub desplazable, copia del chat sin conexión (ahora opt-in), índice
`synced_chats/notes/INDICE.md`, reenvío corregido, «Copiar para el chat» y multi-PC con kill switch
por computadora.

## Qué cambia

### Comandos y teclas por perfil

- Cada perfil (General, Escritor, Programador, Docente, Periodista, Jurídico y Diseño) trae sus
  comandos rápidos y sus teclas de código; en Ajustes se eligen los que aparecen en el dock y la
  elección se conserva por perfil.
- El signo `$` del catálogo ya no rompe la inyección del cliente (patrón `\$'` en
  `String.replace`).

### Compositor y dock

- **Tope del compositor**: el área de texto se limita al 35 % del alto visible y a 160 px en
  vertical (72 px en apaisado); lo que no cabe se desplaza dentro en vez de empujar el dock.
- **Dock compacto de 44 dp**: chips con objetivo táctil de 44 × 44 dp, una fila compacta en
  apaisado con teclado y un botón de 44 dp para abrirla cuando no cabe sobre el compositor. El
  compositor cede espacio; el dock no lo tapa.

### Teléfono

- **Pantalla de «sin conexión»** a pantalla completa en lugar de la página de error de Chromium,
  con reintentar y abrir Ajustes; se retira al recuperar la conexión.
- **QR sin callejón**: si no hay lector instalado, la última dirección se muestra como texto
  seleccionable para copiarla a mano.
- **Hub desplazable con cierre por arrastre**: estado, equipos, sistema y mantenimiento hacen
  scroll, tienen botón de cerrar y se cierran arrastrando hacia abajo.
- **Copia del chat sin conexión DESACTIVADA por defecto**: guardar el último chat para leerlo con la
  PC apagada pasa a ser opt-in en Ajustes; al desactivarla o usar el kill switch se borra del
  teléfono. La copia nativa va cifrada con el `AndroidKeyStore`.
- **Reenvío corregido**: guardar la nota sin cambios ya no pierde la marca `synced`; «Enviar todas»
  no vuelve a POSTear la misma nota.
- **«Copiar para el chat»**: copia una referencia de una línea
  (`@companion/synced_chats/notes/<archivo>.md`) para pegar en cualquier chat de Harness.

### Notas en la PC

- **`synced_chats/notes/INDICE.md`**: índice en Markdown con fecha, título, perfil/tipo, estado y
  archivo de cada nota, para que un agente sepa qué leer. Se rehace al guardar, al podar y al
  arrancar; la poda lo excluye.
- **Rate limit**: cubo de fichas por IP + credencial. `POST` admite 30 de ráfaga y 0,5/s; `GET`,
  120 de ráfaga y 2/s. Al agotarse responde `429` con `Retry-After`.

### Puente y seguridad

- **`/status` no bloqueante**: telemetría desde instantánea cacheada (2 s) y refresco en segundo
  plano; antes la petición lanzaba PowerShell de forma síncrona (hasta 2 s).
- **Ancla del APK desde la raíz** (`config.root`, no el directorio de trabajo): `apkAnchorStatus`
  distingue anclado de sin ancla y publica `apkAnchorMissing`; una descarga sin ancla queda marcada
  como no verificada, no como comprobada.
- **Codificación endurecida**: reparación de mojibake inequívoco antes de guardar y **rechazo con
  400** si el texto sigue roto o mezcla Unicode real; nunca se repara dos veces.
- **Multi-PC**: el kill switch revoca solo la PC activa (dispositivos, túneles y clave de esa PC) y
  ya no bloquea «Abrir panel» ni el reemparejamiento. Cada computadora conserva su propio registro.

## Qué no cambia

- Los siete perfiles de nota, la fecha límite, la privacidad local, «Solo en el teléfono», la
  bandeja del panel, la accesibilidad y el lector offline de chats sin PC.
- El modelo de confianza: HTTP en claro **dentro de la VPN**, panel solo en loopback y puente nunca
  expuesto a Internet.
- La firma de release: el mismo certificado desde 5.1.7, así que se instala encima sin desinstalar.

## Cómo se instala

1. Instala el APK **5.4.0** (`versionCode` 67) **encima de la 5.3.7** (`versionCode` 65): no hace
   falta desinstalar ni volver a emparejar.
2. Actualiza el puente y reinícialo (`stop.bat` + `start.bat`, o deja que el autoarranque lo
   levante). Puente y APK deben hablar el mismo contrato.
3. Comprueba la versión en Ajustes y en `http://<IP-PRIVADA>:57420/dsh-companion/status`
   (`version`, `apkVersionCode`).
4. Prueba lo nuevo: activa la copia sin conexión en Ajustes, usa «Copiar para el chat» en una nota
   enviada, abre el Hub y ciérralo arrastrando, y con varias PCs comprueba que el kill switch solo
   afecta a la activa.

## Verificación

- **18 suites** en total (**13 en CI** + 3 omitidas con motivo; healthz y backup aparte), **418
  comprobaciones en total**: 416 se ejecutan en CI y 2 se omiten por el APK no
  versionado y 1 por la ventana del panel, exclusiva de Windows), más **915 comprobaciones Java** puras ejecutadas en local (watchdog, cleartext, bridgeguard, apkdigest,
  notas, reenvío, copia para el chat, comandos, versiones y lector offline).
- `node tools/audit-repo.mjs`: sin hallazgos.
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Suite aislada: `synced_chats/` y `bridge.log` del repositorio sin cambios (comprobado por
  huella).

## APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 67` / `versionName 5.4.0` |
| Tamaño | 189,536 bytes (185 KB) |
| SHA-256 | `e13c5ba7415e97d64c66ac759449022af37ca6f64d66303c98101452371873dc` |
| Firma | v2+v3, certificado de release RSA 4186 (sin cambios desde 5.1.7: se instala encima de 5.3.7) |

## Build

- APK firmado con el keystore de release: **189,536 bytes (185 KB)**, SHA-256
  `e13c5ba7415e97d64c66ac759449022af37ca6f64d66303c98101452371873dc`.
- Commit de origen: `61dc4f4` (el sello del registro se anota en
  el commit siguiente, que es el que se etiqueta).
- Registro completo en `RELEASES.json`: versión, `versionCode`, canal, fecha, commit, `apkSha256` y
  `certSha256`.
- Verificación sobre el binario publicado: **418 comprobaciones en total**, 416 ejecutadas en CI (**2 en
  CI**: 3 omitidas con motivo —2 por el binario no versionado y 1 por ser exclusiva de Windows—) y
  **915 comprobaciones Java ejecutadas en local**.
