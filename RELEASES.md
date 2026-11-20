# Historial de versiones

Notas de release de todas las versiones publicadas, en un solo documento. El detalle de cambios
técnicos está en [CHANGELOG.md](CHANGELOG.md), los datos verificables (commit, SHA-256 del APK,
certificado) en [RELEASES.json](RELEASES.json) y las notas de cada publicación en GitHub Releases.

Versiones: [5.4.0](#540) · [5.2.10](#5210) · [5.2.9](#529) · [5.2.8](#528) · [5.2.1](#521) · [5.2.0](#520) · [5.1.10](#5110)

---

## 5.4.0

**DSH Mobile Companion 5.4.0 (`versionCode` 68) — versión 5.4.0, cierre de la serie 5**

Cierre de la serie 5. La 5.4.0 recoge todo lo publicado desde la 5.2.9: las correcciones de la
5.2.10 (integridad de las notas, acceso, QR y operación) y el trabajo de producto de la línea 5.3:
comandos y teclas por perfil, compositor con tope, dock compacto de 44 dp, pantalla de «sin
conexión», Hub desplazable, copia del chat sin conexión (ahora opt-in), índice
`synced_chats/notes/INDICE.md`, reenvío corregido, «Copiar para el chat» y multi-PC con kill switch
por computadora.

### Qué cambia

#### Comandos y teclas por perfil

- Cada perfil (General, Escritor, Programador, Docente, Periodista, Jurídico y Diseño) trae sus
  comandos rápidos y sus teclas de código; en Ajustes se eligen los que aparecen en el dock y la
  elección se conserva por perfil.
- El signo `$` del catálogo ya no rompe la inyección del cliente (patrón `\$'` en
  `String.replace`).

#### Compositor y dock

- **Tope del compositor**: el área de texto se limita al 35 % del alto visible y a 160 px en
  vertical (72 px en apaisado); lo que no cabe se desplaza dentro en vez de empujar el dock.
- **Dock compacto de 44 dp**: chips con objetivo táctil de 44 × 44 dp, una fila compacta en
  apaisado con teclado y un botón de 44 dp para abrirla cuando no cabe sobre el compositor. El
  compositor cede espacio; el dock no lo tapa.

#### Teléfono

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

#### Notas en la PC

- **`synced_chats/notes/INDICE.md`**: índice en Markdown con fecha, título, perfil/tipo, estado y
  archivo de cada nota, para que un agente sepa qué leer. Se rehace al guardar, al podar y al
  arrancar; la poda lo excluye.
- **Rate limit**: cubo de fichas por IP + credencial. `POST` admite 30 de ráfaga y 0,5/s; `GET`,
  120 de ráfaga y 2/s. Al agotarse responde `429` con `Retry-After`.

#### Puente y seguridad

- **`/status` no bloqueante**: telemetría desde instantánea cacheada (2 s) y refresco en segundo
  plano; antes la petición lanzaba PowerShell de forma síncrona (hasta 2 s).
- **Ancla del APK desde la raíz** (`config.root`, no el directorio de trabajo): `apkAnchorStatus`
  distingue anclado de sin ancla y publica `apkAnchorMissing`; una descarga sin ancla queda marcada
  como no verificada, no como comprobada.
- **Codificación endurecida**: reparación de mojibake inequívoco antes de guardar y **rechazo con
  400** si el texto sigue roto o mezcla Unicode real; nunca se repara dos veces.
- **Multi-PC**: el kill switch revoca solo la PC activa (dispositivos, túneles y clave de esa PC) y
  ya no bloquea «Abrir panel» ni el reemparejamiento. Cada computadora conserva su propio registro.

### Qué no cambia

- Los siete perfiles de nota, la fecha límite, la privacidad local, «Solo en el teléfono», la
  bandeja del panel, la accesibilidad y el lector offline de chats sin PC.
- El modelo de confianza: HTTP en claro **dentro de la VPN**, panel solo en loopback y puente nunca
  expuesto a Internet.
- La firma de release: el mismo certificado desde 5.1.7, así que se instala encima sin desinstalar.

### Cómo se instala

1. Instala el APK **5.4.0** (`versionCode` 68) **encima de la 5.3.7** (`versionCode` 65): no hace
   falta desinstalar ni volver a emparejar.
2. Actualiza el puente y reinícialo (`stop.bat` + `start.bat`, o deja que el autoarranque lo
   levante). Puente y APK deben hablar el mismo contrato.
3. Comprueba la versión en Ajustes y en `http://<IP-PRIVADA>:57420/dsh-companion/status`
   (`version`, `apkVersionCode`).
4. Prueba lo nuevo: activa la copia sin conexión en Ajustes, usa «Copiar para el chat» en una nota
   enviada, abre el Hub y ciérralo arrastrando, y con varias PCs comprueba que el kill switch solo
   afecta a la activa.

### Verificación

- **18 suites** en total (**13 en CI** + 3 omitidas con motivo; healthz y backup aparte), **418
  comprobaciones en total**: 416 se ejecutan en CI y 2 se omiten por el APK no
  versionado y 1 por la ventana del panel, exclusiva de Windows), más **915 comprobaciones Java** puras ejecutadas en local (watchdog, cleartext, bridgeguard, apkdigest,
  notas, reenvío, copia para el chat, comandos, versiones y lector offline).
- `node tools/audit-repo.mjs`: sin hallazgos.
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Suite aislada: `synced_chats/` y `bridge.log` del repositorio sin cambios (comprobado por
  huella).

### APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 68` / `versionName 5.4.0` |
| Tamaño | 189,536 bytes (185 KB) |
| SHA-256 | `7f0e6922033a04c4d8da55037a99c4e4821e7b5b5633d17697f5a456ac74760e` |
| Firma | v2+v3, certificado de release RSA 4186 (sin cambios desde 5.1.7: se instala encima de 5.3.7) |

### Build

- APK firmado con el keystore de release: **189,536 bytes (185 KB)**, SHA-256
  `7f0e6922033a04c4d8da55037a99c4e4821e7b5b5633d17697f5a456ac74760e`.
- Commit de origen: `61dc4f4` (el sello del registro se anota en
  el commit siguiente, que es el que se etiqueta).
- Registro completo en `RELEASES.json`: versión, `versionCode`, canal, fecha, commit, `apkSha256` y
  `certSha256`.
- Verificación sobre el binario publicado: **418 comprobaciones en total**, 416 ejecutadas en CI (**2 en
  CI**: 3 omitidas con motivo —2 por el binario no versionado y 1 por ser exclusiva de Windows—) y
  **915 comprobaciones Java ejecutadas en local**.

---

## 5.2.10

**DSH Mobile Companion 5.2.10 (`versionCode` 54) — Correcciones de la auditoría**

Versión de **solo correcciones** de la serie 5.2. No añade funciones. Cierra los hallazgos de la
auditoría técnica sobre la 5.2.9: integridad de las notas ante cortes, acceso y kill switch,
emparejamiento, QR, modo apaisado y operación en Windows.

### Qué se corrige

#### Notas: los datos no se pierden ni se duplican

- La nota se escribe en un temporal y se renombra: un corte de corriente o un `SIGKILL` ya no deja
  un `.md` de 0 bytes.
- El nombre se reserva en `ids.json` **antes** del contenido. Si el proceso muere entre ambos pasos,
  reenviar la misma nota actualiza en vez de crear un duplicado.
- La poda de `inbox.jsonl` entra en la misma cola que las escrituras: se acaban los `EPERM` y los
  `.tmp` huérfanos que aparecían con envíos concurrentes en Windows.
- `GET /dsh-companion/notes` devuelve las 500 notas que retiene la poda (antes se quedaba en 200).

#### Acceso

- **Kill switch**: si la clave la fija `DSH_ACCESS_KEY`, la respuesta es `rotated: false` con el
  motivo, en vez de anunciar una rotación que no ocurrió. Con clave en archivo, rota de verdad.
- La comprobación de clave deja de aceptar un `Authorization` cualquiera cuando no hay clave.
- Un rechazo afecta solo a la solicitud rechazada, no a todos los equipos detrás de la misma IP.
- `/healthz` pasa por la misma frontera de `Host`/`Origin` que el resto del puente.

#### QR y emparejamiento

- Si la URL no cabe en el QR, se muestra en texto; nunca se genera un QR truncado (dos URL
  distintas ya no producen el mismo código).
- En el teléfono, el lector de QR vuelve a resolverse en Android 11+ (`<queries>` en el manifest).

#### Teléfono

- Un solo envío en vuelo: doble toque en «Enviar» ya no duplica la nota en la PC.
- `5.2.9-rc1` ya no se considera más nuevo que `5.2.9`.
- «Limpiar caché» conserva la cookie de emparejamiento: no hay que volver a aprobar el teléfono.
- Notas conserva filtros, orden y búsqueda al girar; modo apaisado con drawer y compositor compacto.
- Avisos: el interruptor maestro cubre la desconexión, la visibilidad es coherente y el permiso de
  batería se re-sincroniza al volver del diálogo.

#### Operación

- Cierre ordenado en Windows por bandera (`companion.stop`): `stop.bat` espera hasta 5 s y solo
  fuerza si el puente no cerró.
- Las variables de entorno inválidas avisan con el valor rechazado y el default aplicado.
- La suite queda aislada del `synced_chats/` y del `bridge.log` del repositorio.

### Qué no cambia

- Las funciones de la 5.2.9: perfiles, fecha límite, privacidad local, «Solo en el teléfono»,
  bandeja del panel, accesibilidad y lector offline.
- La política de la línea: correcciones de seguridad y mantenimiento, sin promesas de fechas.

### Cómo se instala

1. Instala el APK **5.2.10** (`versionCode` 54) **encima de la 5.2.9** (`versionCode` 53): no hace
   falta desinstalar ni volver a emparejar; la firma no cambia desde la 5.1.7.
2. Actualiza el puente y reinícialo (`stop.bat` + `start.bat`, o deja que el autoarranque lo
   levante). Puente y APK deben hablar el mismo contrato.
3. Comprueba la versión en Ajustes y en `http://<IP-PRIVADA>:57420/dsh-companion/status`
   (`version`, `apkVersionCode`).
4. En Notas, prueba lo que cambió: envía una nota dos veces (no debe duplicarse), marca una
   «Solo en el teléfono», y en el Hub usa «Limpiar caché» y comprueba que sigues dentro sin
   re-aprobar.

### Verificación

- **17 suites, 418 comprobaciones** en local; **344 en CI** (`run-suite`, 12 suites + 3 omitidas con
  motivo); **628** comprobaciones Java (61 watchdog + 14 bridgeguard + 16 cleartext + 25 apkdigest +
  481 notas + 26 versiones + 5 guard de envío).
- Caos: 20 rondas de `SIGKILL` a mitad de escritura y reenvío del mismo `id` → 0 archivos de 0 bytes
  y 0 duplicados; 6 rondas de poda concurrente → 0 `.tmp` y 0 `EPERM`; 100 POST concurrentes.
- `node tools/audit-repo.mjs`: sin hallazgos.
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Suite aislada: `synced_chats/` y `bridge.log` del repositorio sin cambios (comprobado por huella).

### APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 54` / `versionName 5.2.10` |
| Tamaño | 268 296 bytes (262 KB) |
| SHA-256 | `c476f212131de48e90855d7ada97ec543cb72d70523304ae86dae5d215a17eee` |
| Firma | v2+v3, certificado de release RSA 4096 (sin cambios desde 5.1.7: se instala encima de 5.2.9) |

---

## 5.2.9

**DSH Mobile Companion 5.2.9 (`versionCode` 53) — Notas por área, fecha límite y privacidad**

Versión de producto de la serie 5.2. **Notas** deja de ser una función secundaria: pasa a tener
perfiles por área, fecha límite, orden y filtros nuevos, cifrado en reposo, modo privado y una
bandeja de notas recibidas en el panel de la PC. Se retira el **chat de destino** porque nunca
entregaba la nota al chat.

### Qué cambia

- **7 perfiles declarativos**: General, Escritor, Programador, Docente, Periodista, Jurídico y
  Diseño. Cada perfil trae sus tipos y estados propios, y la etiqueta de sus dos campos:
  Materia/Grupo o alumno, Caso o tema/Fuente, Expediente/Cliente, Cliente/Proyecto,
  Obra/Personaje, Proyecto/Módulo o archivo y Proyecto/Detalle.
- **Fecha límite (`dueDate`)** con selector de fecha, **orden por vencimiento** y filtros
  **«Con fecha»** y **«Prioridad»**.
- **Búsqueda sin acentos ni mayúsculas**: `garcia` encuentra `García`.
- **Privacidad**: `notes.json` se guarda **cifrado en reposo** (AES-256-GCM con clave del
  AndroidKeyStore), la pantalla de Notas usa **FLAG_SECURE** (sin capturas ni miniaturas) y una
  nota se puede marcar **«Solo en el teléfono»**: no se envía nunca, queda fuera de «Enviar todas»
  y compartirla pide confirmación.
- **Envío a la PC idempotente por `id`**: reenviar una nota actualiza el mismo archivo en la PC en
  vez de duplicarlo. Se permite una **nota de solo título** (el cuerpo puede ir vacío). El envío
  nunca borra nada del teléfono.
- **Front matter del archivo `.md`**: incluye `id`, `dueDate` y `updatedAt`, además del perfil,
  tipo, proyecto, personaje/módulo, etiquetas, estado y prioridad. **Sin `chatTarget`.**
- **Bandeja «Notas recibidas» en el panel de la PC**: las **últimas 10 notas**, en **solo lectura**
  (título, tipo, proyecto y fecha). La lista completa de metadatos, sin cuerpos, está en
  `GET /dsh-companion/notes`.
- **Accesibilidad**: editor desplazable con el teclado abierto, objetivos táctiles de 48 dp o más,
  selección de chips anunciada a TalkBack, región viva de autoguardado, contraste AA en las
  insignias, tarjeta con descripción accesible y título de 2 líneas.

### Se retira el chat de destino

El campo de chat de destino **desaparece de la interfaz, del payload y del puente**. No servía: la
nota no se entregaba al chat, solo se anotaba un nombre. El puente **ignora `chatTarget`** si llega
de una versión anterior y ya no lo valida, no lo escribe en el front matter y no lo usa en el
nombre del archivo. Una nota es un archivo en la PC, no un mensaje de una conversación.

### Qué queda para después

Los **adjuntos** y los **recordatorios del sistema operativo** no entran en la 5.2.9. La fecha
límite de esta versión es un dato de la nota: se ve, se ordena y se filtra, pero no programa avisos.

### Cómo se instala

1. Instala el APK **5.2.9** (`versionCode` 53) **encima de la 5.2.8** (`versionCode` 52): no hace
   falta desinstalar y la firma de release no cambia desde la 5.1.7.
   Si vienes de una versión anterior a la 5.1.7, desinstala una vez.
2. Actualiza el puente desde el repositorio y reinícialo (`stop.bat` + `start.bat`, o deja que el
   autoarranque lo levante). El puente y el APK deben hablar el mismo contrato de notas.
3. Comprueba la versión en Ajustes del teléfono y en
   `http://<IP-PRIVADA>:57420/dsh-companion/status` (`version` y `apkVersionCode`).
4. Abre *Notas* y prueba: crear una nota con fecha límite, marcar otra como «Solo en el teléfono»,
   enviar una nota de solo título y verla en la bandeja del panel.

La política de soporte de la línea sigue en [SUPPORT.md](SUPPORT.md): correcciones de seguridad y
mantenimiento de la serie 5.2, sin promesas de funciones. La comprobación desde el teléfono está en
[CHECKLIST-VERIFICACION.md](CHECKLIST-VERIFICACION.md), y el detalle de seguridad de las notas en
[SECURITY.md](SECURITY.md).

### Verificación

- `npm test` contra un puente en vivo y la suite de CI (las cifras vigentes las publica el propio
  resultado de la suite y las fija el responsable de la release en el README).
- `node tools/audit-repo.mjs`: sin hallazgos (codificación, enlaces, tablas, versiones y secretos).
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Revisión de la suite de notas: autorización, nota de solo título, idempotencia por `id`, bandeja
  `inbox.jsonl` y `GET /dsh-companion/notes`.
- Comprobación de que no queda `chatTarget` en el payload, el front matter, la bandeja ni el nombre
  del archivo.

### La serie 5.2 sigue

La 5.2.9 no es un parche de seguridad: es la siguiente versión de la serie 5.2, con cambio de
producto. Se instala sobre la 5.2.8 sin desinstalar y mantiene el lector offline de chats, que sigue
necesitando la PC. El historial completo está en [CHANGELOG.md](CHANGELOG.md).

### APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 53` / `versionName 5.2.9` |
| Tamaño | 268 296 bytes (262 KB) |
| SHA-256 | `06e0af8f9727a76d6588deaa983b11bcb1688e4e90eac38af4ccd22e4a1bb83d` |
| Firma | v2+v3, certificado de release RSA 4096 (sin cambios desde 5.1.7: se instala encima de 5.2.8) |

---

## 5.2.8

**DSH Mobile Companion 5.2.8 (`versionCode` 52) — notas locales, sin modo satélite**

Versión de producto de la serie 5.2. **Se retira el modo satélite** y entran las **notas locales**:
se guardan solo en el teléfono, funcionan con la PC apagada y sin Internet, y se envían a la
computadora cuando hay conexión.

### Qué se quita

- **El modo satélite completo**: la pestaña de la página offline, el cliente Android que hablaba con
  el servicio externo, sus estilos y su JS, y los ajustes que guardaban la clave.
- **La clave de API de DeepSeek en el teléfono** y el almacén cifrado que la conservaba: el
  dispositivo deja de tener credenciales de terceros y de ser el único punto que salía del perímetro.
- **La ruta de absorción** `POST /dsh-companion/absorb-satellite` y el almacén `satellite_notes/` del
  puente.
- La pestaña de satélite de la página offline: la página queda con **Estado** y **Lector**.

El motivo es el mismo que se documentó al añadirlo: solo funcionaba con la PC encendida, así que no
servía para el caso que decía cubrir y añadía superficie y una credencial en el teléfono.

### Qué se agrega

Notas completas para escritores y programadores: perfiles con tipos propios, proyecto u obra, personaje o módulo, etiquetas, estado, prioridad, filtros y chat destino; el envío a la PC incluye todos los metadatos (front matter + `inbox.jsonl`).

- **Notas locales** en la app: crear, editar, borrar y compartir con el selector de Android. Se
  guardan en el teléfono y funcionan con la PC apagada, sin Internet y sin clave de API.
- **Envío a la PC**: con el puente accesible, *Enviar a la PC* deja la nota en
  `synced_chats/notes/` de la computadora. Si la PC está apagada, la nota sigue en el teléfono y se
  puede enviar más tarde.
- El **lector offline de chats** no cambia en su requisito: los chats los sirve el puente, así que
  sigue necesitando la PC encendida.

### Cómo se instala

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

### Verificación

- `npm test` contra un puente en vivo y la suite de CI; las cifras vigentes se publican en el
  [README](README.md) y en el propio resultado de la suite.
- `node tools/audit-repo.mjs`: sin hallazgos (codificación, enlaces, tablas, versiones y secretos).
- `doctor.ps1 -Json -Report` con recibo verificado por `tools/verify-receipt.mjs`.
- Búsqueda del árbol para confirmar que no queda código ni documento de producto del modo retirado:
  `git grep -n -i "satellite"` fuera de notas históricas. Detalle en
  [AUDITORIA-EXTERNA.md](AUDITORIA-EXTERNA.md).

### La serie 5.2 sigue

La 5.2.8 no es un parche de seguridad: es la siguiente versión de la serie 5.2, con cambio de
producto. La política de soporte de la línea (correcciones de seguridad, sin promesas de funciones)
sigue en [SUPPORT.md](SUPPORT.md); esta versión es la actual y se instala sobre la 5.2.0 sin
desinstalar.

### APK

| Dato | Valor |
| --- | --- |
| Versión | `versionCode 52` / `versionName 5.2.8` |
| Tamaño | 251 912 bytes (246 KB) |
| SHA-256 | `6592adaa6579c4320d23cb96e46ac71cc3a54776e637d8c47736bc79f20fbddd` |
| Firma | v2+v3, certificado de release RSA 4096 (sin cambios desde 5.1.7: se instala encima de 5.2.0) |

### Verificación de esta entrega

- **17 suites / 328 comprobaciones** en local (254 en CI, 3 SKIP justificados por entorno).
- **Tests Java puros**: 61 watchdog + 16 cleartext + 14 bridgeguard + 25 apkdigest + 189 notas = **305**.
- `node tools/audit-repo.mjs`: sin hallazgos.
- `node test/verify_notes.mjs`: 28/28; `verify_battery_and_landscape.mjs`: 12/12.
- `doctor.ps1 -Json -Report` + recibo válido.

---

## 5.2.1

**DSH Mobile Companion 5.2.1 — parche de seguridad (solo puente)**

Versión actual de la serie 5.2. **El APK no cambia**: sigue siendo 5.2.0 (`versionCode` 51),
con el mismo SHA-256 y la misma firma; se instala encima sin desinstalar.

### Qué corrige

- **`/healthz` ya no revela topología fuera de loopback.** El healthcheck del contenedor y la PC
  reciben el detalle completo; el resto de equipos de la red privada recibe solo
  `{ service, version, status, ok, time }`. Antes cualquier miembro de la VPN podía leer la IP de
  enlace (`bindHost`), el puerto interno de Harness y el detalle del contrato.
- **Contrato de turnos estricto**: si hay `turn/start` sin `turn/end` en las sesiones recientes,
  el contrato se marca `degraded` y `/healthz` lo refleja (los avisos por turno pueden perderse).
  Sin turnos recientes sigue siendo `ok`.

### Verificación

- Suite del puente y pruebas de `/healthz`: verificación completa en la rama `stable/5`.
- `doctor.ps1 -Json -Report` + `tools/verify-receipt.mjs`: recibo válido.
- APK servido por el puente con el SHA-256 de 5.2.0:
  `cbf157126b565054e4931f1820562887030d6867ca7c34c866cb9995fc4906fd`.

### Cómo usar

- Si ya tienes 5.2.0 instalado: **solo actualiza el puente** (reinícialo o deja que el
  autoarranque lo levante). El teléfono no necesita instalar nada.
- Si vienes de 5.1.x: instala el APK 5.2.0 adjunto a este release y actualiza el puente.

Serie 5.2 congelada: a partir de aquí solo correcciones de seguridad.

---

## 5.2.0

**DSH Mobile Companion 5.2.0 (versionCode 51) — versión actual**

Esta es la **versión actual** de la serie 5. Congela la línea: a partir de aquí solo se publican
**correcciones de seguridad**, no funciones nuevas. No hay cambios de configuración, formato de
datos ni API: la 5.1.10 se actualiza a la 5.2.0 encima, sin desinstalar (la firma no cambió desde la
5.1.7).

El trabajo de esta versión es de **fortalecimiento**: salud real, contrato con DeepSeek Harness,
copias de seguridad verificables y documentación de operación. Todas las funciones actuales siguen
igual.

### Qué cambia

#### Salud real: `/healthz` y healthcheck de Docker

- `GET /healthz` distingue tres estados: `ok` (puente y Harness confirmados), `degraded` (ambos
  arriba pero alguna pieza del contrato cambió) y `down` (HTTP 503: Harness no responde). No exige
  credenciales y no expone secretos.
- El **healthcheck de Docker** pasa a usar `/healthz`: antes preguntaba a
  `/dsh-companion/status`, que responde 200 aunque Harness esté caído, así que un contenedor
  "sano" podía tener el teléfono incomunicado.

#### Contrato con DeepSeek Harness

`src/dsh-contract.mjs` comprueba al arrancar (y cada 10 minutos) las piezas internas de Harness de
las que depende el puente: cookie `dsh-auth-*`, marcador `__DSH_BOOT__`, evento `turn/end`,
atributo `data-approval-key` y descubrimiento de puerto. Si una cambia, **degrada solo la función
afectada** con un aviso en `bridge.log`; el estado se expone como `contract` en
`/dsh-companion/status` y en `/healthz`.

#### Copias de seguridad

- `backup.bat` / `restore.bat` (y `backup.ps1` / `restore.ps1`): copian el registro de dispositivos,
  la clave de acceso y el token del panel a `%USERPROFILE%\.dsh\backups\AAAA-MM-DD-HHMMSS\` con un
  manifiesto de tamaños y SHA-256. `-DryRun` no escribe nada.
- La restauración es **fail-closed**: verifica los hashes antes de escribir; si el respaldo está
  manipulado se niega sin tocar nada. Antes de restaurar guarda el estado actual.
- El instalador respalda el registro antes de actualizar, y `doctor.ps1` avisa si no hay una copia
  reciente.

#### Operación y soporte

- `OPERACION.md` explica cómo aprobar un dispositivo nuevo, reiniciar el puente, revisar
  `bridge.log`, comprobar `/healthz` y restaurar copias sin estar delante de la computadora.
  Incluye la recomendación de **RustDesk** como soporte remoto opcional (servidor self-hosted o solo
  sobre ZeroTier/Tailscale, contraseña fuerte + 2FA, apagado cuando no se usa); **no es parte del
  producto ni se empaqueta**.
- `SUPPORT.md` fija la política: 5.2.0 publicada y solo correcciones de seguridad; 5.1.x anterior.
- `CHECKLIST-VERIFICACION.md`: comprobación de la versión actual **desde el teléfono**.
- `AUDITORIA-EXTERNA.md`: tres prompts listos para auditoría de seguridad, onboarding y APK.
- `RELEASES.json`: registro legible por máquina de cada build publicado (versión, `versionCode`,
  commit de origen, SHA-256, huella del certificado y fecha).

#### Revisión de permisos del APK

Cada permiso se contrastó con su uso real. `RECORD_AUDIO` se mantiene porque solo se concede al
frame del búnker cuando la página pide captura de audio (quitarlo rompería la entrada de voz en la
GUI). `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` solo se pide al activar el interruptor "Permitir en
segundo plano" de los avisos, nunca al arrancar. Detalle en `SECURITY.md`.

#### Limpieza

Notas `RELEASE_5.1.7/8/9` eliminadas (el `CHANGELOG` ya las cubre), las cuatro referencias de la
skill se fusionan en dos y se eliminan duplicados no referenciados.

### Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 51` / `versionName 5.2.0` |
| Tamaño | `227336` bytes (222 KB) |
| SHA-256 | `cbf157126b565054e4931f1820562887030d6867ca7c34c866cb9995fc4906fd` |
| Firma | APK Signature Scheme v2 + v3, certificado de release RSA 4096 |
| Huella del certificado (SHA-256) | `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23` |
| Requisitos | Android 8.0 (SDK 26) o superior |

Comprobado antes de publicar:

- **14 suites / 235 comprobaciones** en local (puente aislado enlazado a la red privada) y **203**
  en CI, todas correctas.
- Tests Java puros: **61** watchdog + **16** cleartext + **14** bridgeguard + **25** apkdigest,
  0 fallos; `javac` limpio.
- Verificaciones adicionales de 5.2.0: **22/22** de salud y contrato (`test/verify_healthz.mjs`) y
  **10/10** de respaldo/restauración (`test/verify_backup.mjs`), con una restauración real sobre un
  `DSH_HOME` aislado.
- `node tools/audit-repo.mjs`: **sin hallazgos**; `doctor.ps1 -Json -Report` con recibo válido
  (`tools/verify-receipt.mjs`).

### Antes de instalar

**Actualiza el APK y el puente juntos.** Un APK 5.2.0 con un puente 5.1.10 funciona para lo de
siempre, pero no tendrá `/healthz` ni el contrato; un puente 5.2.0 con un APK 5.1.10 funciona igual
que antes. Lo recomendable es actualizar los dos a la vez.

La firma de release es la definitiva **desde la 5.1.7**. Si vienes de una versión anterior a esa,
desinstala una vez; desde la 5.1.7 se instala encima sin problema.

### Política de esta línea

- **La 5.2.0 es la versión actual.** Solo un fallo de seguridad crítico produciría una 5.2.1.
- La rama `stable/5` conserva exactamente este árbol.
- El compromiso de mantenimiento a largo plazo se mantiene en un documento interno, fuera de este
  repositorio; aquí no se promete nada más allá de "publicada, solo correcciones de seguridad".

### Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo encima de la 5.1.10.
2. En la computadora: actualiza el árbol y reinicia el puente (`stop.bat` + `start.bat` o
   `install-autostart.bat`).
3. Comprueba la salud: `http://<IP-PRIVADA>:57420/healthz` debe responder `"status": "ok"`.
4. Haz una copia preventiva con `backup.bat` y revisa la guía de `OPERACION.md`.

---

## 5.1.10

**DSH Mobile Companion 5.1.10 (versionCode 50) — versión final de la serie 5**

Esta es la **versión final** de la serie 5. Sustituye a la 5.1.9, que llegó al QA con defectos:
esta build incorpora las diez correcciones del informe de calidad y deja la rama `stable/5` en su
estado definitivo. Tres de ellas (**D1**, **H1** y **H2**) justifican por sí solas el relanzamiento:
rompían la actualización desde la PC y abrían dos vías de privilegio.

### La serie 5, de un vistazo

#### 5.0.0 — cambio de modelo (incompatible con 4.x)
- Identidad del dispositivo por **cookie de sesión**, no por IP.
- El **kill switch rota la clave de acceso**.
- Panel con **boleto de un solo uso** + cookie `HttpOnly`.
- `/dsh-companion/action` responde **501**: no se finge aprobar herramientas.
- Caducidad de 30 días aplicada en el servidor; `DSH_ACCESS_DISABLE=1` exige loopback.

#### 5.1.0 — cierre de los 56 hallazgos del informe
- **JS bridge blindado por nonce** (`BridgeGuard`): un iframe ya no puede gastar la clave de API.
- Verificación **SHA-256** del APK contra el digest de GitHub.
- Panel con validación de `Host`; descubrimiento validado contra el JSON del puente.
- Proxy con lista de métodos y tope de subida; `CleartextPolicy` fail-closed.
- `pendingList` solo para el panel; la VPN corporativa ya no se toma por defecto.
- Sync con Markdown fiel y retención; telemetría perezosa (16 ms de arranque).
- Notificaciones honestas y una sola por turno.

#### 5.1.1 — residuales
- Terminal remota **eliminada**; modo satélite documentado y avisado.
- CSP y cabeceras de seguridad en páginas propias.

#### 5.1.2 — corrección del panel
- El panel no se llena de solicitudes duplicadas: se reutiliza la del mismo equipo.

#### 5.1.3 — auditoría final de publicación
- Cinco README recuperan la sección de compilación y la cola del árbol.
- `SECURITY.md`, `AI_SETUP_PROMPT.md` y `docker-compose.yml` dejan de mencionar la terminal.
- Tabla de variables completa, rutas y módulos completos, cifra de pruebas honesta (231).
- `panel.bat` respeta `DSH_PANEL_PORT`; `.lnk` de autoarranque con comillas correctas.
- Docker copia los assets del manifest y el healthcheck usa el puerto efectivo.

#### 5.1.4 — disponibilidad y avisos
- **Se reenlaza solo** cuando el túnel aparece o cambia de IP.
- **Supervisor de arranque**: si el puente cae, se vuelve a levantar; `stop.bat` deja
  `companion.stop` para que no lo resucite al detenerlo.
- **Excepciones no controladas** se registran y el supervisor recupera el proceso.
- **Límite de intentos de clave** por IP sin calcular el HMAC tras el umbral.
- **Exención de batería** en Ajustes del teléfono para que no maten el servicio de avisos.

#### 5.1.5 — ingeniería cerrada
- **La suite corre en CI**: 9 suites · 151 comprobaciones en cada push, en un puente
  aislado con `DSH_HOME` temporal y un doble de Harness.
- **Rotación de `bridge.log` en caliente** (`DSH_LOG_MAX_MB` 5, `DSH_LOG_KEEP` 3).

#### 5.1.6 — actualización desde la PC arreglada
- **La actualización desde la PC instalaba el APK equivocado**: el puente servía la copia de la
  raíz (atrasada) mientras `/status` anunciaba la versión compilada. Ahora sirve su propio APK.
- **SHA-256 del APK en `/status`** y verificación en el teléfono.
- **GitHub como vía sin túnel**: se fuerza la consulta si el puente no responde.

#### 5.1.7 — firma de release
- **El APK se firma con un keystore de release** (RSA 4096, 30 años). Certificado SHA-256:
  `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`.

#### 5.1.8 — roles, multi-instancia, watchdog y VPN
- **Roles por dispositivo** (`full`/`viewer`), **multi-instancia** por `targetPort`, **watchdog**
  de avisos y **VPN ampliada** (NetBird, Nebula, EasyTier, Tinc, SoftEther, Twingate, Headscale).
- Auditoría externa: **P1** (nonce), **P3** (notificación muerta), **P36** (`CleartextPolicy`).

#### 5.1.9 — watchdog configurable y arranque
- **Watchdog configurable**: silencio 1/3/5 min, reintentos 1/2/3, aviso on/off y "Probar ahora".
- **Arranque tras reiniciar el teléfono** (BootReceiver, solo si avisos y watchdog están activos).
- **P1 completo**: nonce en los 23 métodos del puente JS.
- **P22**: descubrimiento con identidad de DSH confirmada, no "algo responde".
- **P2**: respaldo con fsync del registro en la prueba (restaura si quedó a medias).
- **`AUDIT_CLOSURE.md`**: estado final de los 56 puntos del informe externo.

#### 5.1.10 — correcciones del QA final

| ID | Severidad | Defecto | Corrección |
| --- | --- | --- | --- |
| D1 | ALTA | La actualización desde la PC fallaba con `NullPointerException` porque la ruta del búnker no tiene digest de GitHub. | Usa como ancla el SHA-256 que publica el puente (`apkSha256`). |
| H1 | MEDIA | Con `DSH_ALLOW_PROXY_ACCESS=1`, una petición con cabeceras de proxy se trataba como loopback: podía autoaprobarse, abrir el panel y ver `pendingList`. | El flag solo permite pasar la guarda de red y nunca eleva privilegios. |
| H2 | MEDIA | Un dispositivo `viewer` podía abrir el WebSocket. | Se rechaza el upgrade de un viewer. |
| H3 | BAJA | Un symlink o hardlink dentro de `synced_chats/` permitía leer archivos del host como conversación. | Se rechazan los archivos no regulares y se comprueba la ruta real. |
| H4 | BAJA | El panel aceptaba `Origin: null`. | Lo rechaza como el resto de orígenes ajenos. |
| H5 | BAJA | Un JSON malformado en `/sync` podía inyectar texto arbitrario en `bridge.log`. | Se sanea (sin CR/LF ni caracteres de control, truncado). |
| D3 | BAJA | El kill switch borraba las cookies aunque la revocación no se hubiera confirmado. | Solo cierra la sesión local si el puente confirma. |
| D4 | BAJA | La biometría crítica llamaba a un hook JS inexistente. | Usa el hook real del cliente. |
| D5 | INFORMATIVA | `BootReceiver` era `exported=true`. | Ya no lo es: `BOOT_COMPLETED` es un broadcast protegido. |
| D6 | INFORMATIVA | El descubrimiento Android aceptaba el marcador por subcadena. | Exige JSON con `service == "dsh-companion"`. |

El detalle punto por punto y su estado quedan en [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md).

### ⚠️ Antes de instalar

**Actualiza el APK y el puente juntos.** La 5.1.10 mantiene el contrato del puente JS de la 5.1.9
(23 métodos piden nonce) y el arranque del servicio: un APK 5.1.10 con un puente anterior puede
perder borradores y latido. Actualiza los dos a la vez.

La firma de release es la definitiva **desde la 5.1.7**. Si vienes de una versión anterior a esa,
desinstala una vez; desde la 5.1.7 se instala encima sin problema.

### Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 50` / `versionName 5.1.10` |
| Tamaño | `c5f9e8f76e4003075bf51c7992f0091d21292ceb520a5b65494e78f8bdd5c8f6` bytes |
| SHA-256 | `c5f9e8f76e4003075bf51c7992f0091d21292ceb520a5b65494e78f8bdd5c8f6` |
| Firma | APK Signature Scheme v2 + v3, certificado de release RSA 4096 |
| Requisitos | Android 8.0 (SDK 26) o superior |

Comprobado en la corrida previa al empaquetado: **235/235** comprobaciones en 14 suites (203 en CI),
auditoría del repositorio sin hallazgos, un solo aviso por turno, `pendingList` fuera del `/status`
anónimo y las tres sondas de la pantalla de espera creando **una** solicitud.

### Política de esta línea

- **La serie 5 queda cerrada con la 5.1.10.** Solo un fallo de seguridad crítico produciría una 5.1.11.
- Lo siguiente sale como **pre-release** (5.2.0-pre.1...) hasta estabilizarse.
- La rama `stable/5` conserva exactamente este árbol.

### Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo.
2. En la computadora: `install-autostart.bat` (registra el arranque **y** levanta el puente).
3. En el teléfono: abre `http://<IP-PRIVADA>:57420` y aprueba el dispositivo desde `panel.bat`.
4. Avisos de la PC: Ajustes → *Notificaciones de la PC* → *Probar desde la PC*.

