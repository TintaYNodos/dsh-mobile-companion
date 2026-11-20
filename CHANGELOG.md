# Changelog

All notable changes to DSH Mobile Companion. The project follows `MAJOR.MINOR.PATCH` and the
Android `versionCode` increments once per published build.

## Sin publicar (rama `main`)

- **`doctor.ps1` deja de publicar un `apkSha256` vacío**: si el APK no está en la copia del repo (no se
  versiona), el informe lo declara con `apkSha256: null` y `apkAnchorMissing: true`, y la salida
  humana explica que el ancla es el SHA del release publicado. El recibo sigue siendo válido.
- **PowerShell 7 es opcional**: la base soportada es Windows PowerShell 5.1 (probada); `pwsh` 7 solo
  se usa si está instalado. No se instala como requisito.

Cambios de repositorio que **no** forman parte del APK publicado. La versión instalable sigue siendo la
5.4.0 / `versionCode` 68.

- **Retirados los archivos Docker** (`Dockerfile`, `docker-compose.yml`, `.dockerignore`). El puente
  necesita el loopback del host y el Harness local; la imagen nunca fue una vía soportada ni documentada.
- **Documentación de agentes unificada**: `AGENT_COMPAT.md` se fusionó en `AI_SETUP_PROMPT.md`
  (matriz de compatibilidad, skill y recibo del informe) para que solo haya un documento canónico.
- **Consolidado el historial de versiones** en [RELEASES.md](RELEASES.md): las siete notas
  `RELEASE_*.md` pasan a un solo documento con anclas por versión; el detalle técnico sigue aquí.
- **`install-agent.ps1` reescrito como vía oficial de instalación para agentes**: contrato JSON
  versionado (1.0.0), `-DryRun`, `-SkipClone`, `-RegisterAutostart`, `-Port` y `-Force`; preflight de
  Node/PowerShell/Harness, verificación de `/healthz`, `doctor.ps1` y recibo, log sin secretos y
  códigos de salida 0/1/2/3/4. Verificador propio en `test/verify_install_agent.ps1` (35/35).

## 5.4.0 — `versionCode` 68 (versión 5.4.0, cierre de la serie 5)



Cierre de la serie 5. La 5.4.0 consolida todo lo publicado desde la 5.2.9: las correcciones de la
5.2.10 (documentadas más abajo) y el trabajo de producto de la línea 5.3 (comandos por perfil, dock
compacto, lectura sin conexión, multi-PC). A partir de aquí la serie queda cerrada: solo correcciones
de seguridad y mantenimiento.

### Añadido — comandos y teclas configurables por perfil

- **Catálogo por perfil**: cada perfil (General, Escritor, Programador, Docente, Periodista,
  Jurídico y Diseño) trae sus comandos rápidos y sus teclas de código, y en Ajustes se eligen los
  que se muestran en el dock. La elección se conserva por perfil y se aplica al compositor.
- **Teclas de código por perfil**: símbolos y atajos propios de cada área (llaves para código,
  comillas y guiones para texto, etc.) sobre el compositor mientras se escribe.

### Añadido — compositor y dock compacto

- **Compositor con tope**: el borrador ya no crece sin límite. El área de texto se limita al **35 %
  del alto visible** y a 160 px en vertical (72 px en apaisado) y el resto se desplaza dentro; antes
  el dock y la tarjeta del compositor quedaban recortados por el scrollport.
- **Dock compacto de 44 dp**: los chips del dock miden 44 × 44 dp como objetivo táctil y en
  apaisado con teclado se usa una sola fila compacta; si no cabe sobre el compositor, aparece un
  botón de 44 dp para abrirla y se puede ocultar. El compositor cede espacio, no se tapa.
- **Densidad medida**: la geometría y el contraste del dock se corrigieron midiendo el alto real de
  la franja visible (35 % del alto, 160/72 px) en lugar de estimarlo.

### Añadido — teléfono

- **Pantalla de «sin conexión»**: cuando el frame principal no carga, una capa a pantalla completa
  sustituye a la página de error de Chromium (`net::ERR_*`), con botón para reintentar y otro para
  abrir Ajustes. Solo se muestra ante un fallo del frame principal y se retira al recuperar la
  conexión.
- **Diálogo QR sin callejón**: si no hay lector de QR instalado, el diálogo explica el motivo y
  muestra la última dirección como texto **seleccionable** (se puede copiar a mano o con el botón),
  en vez de dejar al usuario sin salida.
- **Hub desplazable con cierre por arrastre**: el panel inferior (estado, equipos, sistema y
  mantenimiento) hace scroll cuando el contenido no cabe, tiene botón de cerrar y se cierra
  arrastrándolo hacia abajo.
- **Copia del chat para uso sin conexión, DESACTIVADA por defecto**: el teléfono puede guardar el
  último chat (formato legible y cifrado con el `AndroidKeyStore`) y leerlo con la PC apagada, pero
  ahora es **opt-in**: se activa en Ajustes y, al desactivarla o usar el kill switch, la copia local
  se borra. Antes la copia se hacía sin pedir permiso.
- **«Copiar para el chat»**: deja en el portapapeles una referencia de una línea
  (`@companion/synced_chats/notes/<archivo>.md`) para pegar en cualquier chat de Harness y que el
  agente lea la nota en la PC. El nombre del archivo se guarda en un índice local por `id`, cifrado
  con `KeyStoreVault`, para poder copiar la referencia aunque la app se haya reiniciado. Las notas
  «Solo en el teléfono» no salen nunca.
- **Reenvío corregido**: guardar la nota sin cambios (abrir y cerrar el editor, o el autoguardado)
  ya no pierde la marca `synced`; la nota enviada no vuelve a la cola de pendientes y «Enviar
  todas» no la POSTea de nuevo a la PC.

### Añadido — notas en la PC

- **Índice legible `synced_chats/notes/INDICE.md`**: el puente mantiene, junto a las notas
  recibidas, un índice en Markdown con fecha, título, perfil/tipo, estado y archivo de cada nota,
  pensado para que un agente sepa qué leer sin abrir todas. Se rehace al guardar, al podar y al
  arrancar, y la poda lo excluye.

### Cambiado — multi-PC y kill switch por PC

- **Cada computadora es su propio perímetro**: el teléfono guarda varias PCs (registro, clave y
  cookie propios) y permite cambiar la activa desde el Hub.
- **El kill switch afecta solo a la PC activa**: revoca sus dispositivos, cierra sus túneles y rota
  su clave; las demás PCs conservan sus sesiones. Si se pierde el teléfono hay que ejecutarlo en
  cada PC.
- Usar el kill switch de una PC **ya no bloquea** «Abrir panel» ni el reemparejamiento de esa misma
  PC.

### Cambiado — puente

- **`/status` no bloqueante**: la telemetría se sirve desde una instantánea cacheada (2 s) y se
  refresca en segundo plano; la petición ya no lanza PowerShell de forma síncrona (hasta 2 s).
- **Ancla del APK desde la raíz**: el ancla SHA-256 se resuelve contra la raíz del repositorio
  (`config.root`), no contra el directorio de trabajo del proceso. `apkAnchorStatus` distingue
  «anclado» de «sin ancla» y publica `apkAnchorMissing`; una descarga sin ancla queda marcada como
  no verificada en vez de presentarse como comprobada.

### Seguridad

- **Rate limit de notas**: cubo de fichas por IP + credencial (resumen SHA-256, nunca la clave) para
  `POST`/`GET /dsh-companion/notes`: 30 de ráfaga y 0,5/s sostenidos al escribir; 120 de ráfaga y
  2/s al leer. Al agotarse responde `429` con `Retry-After`. La ráfaga de un teléfono ya no agota el
  cupo de otro equipo ni permite 40 POST seguidos.
- **Endurecimiento de codificación**: el puente repara el mojibake inequívoco (UTF-8 leído como
  Latin-1/cp1252) antes de guardar una nota; si el texto sigue pareciendo roto o mezcla Unicode
  real, lo **rechaza con 400** en vez de escribir basura. La reparación nunca se aplica dos veces.
- **Copia offline apagada por defecto** y borrada al desactivarla o al ejecutar el kill switch.

### Corregido

- El signo `$` del catálogo de comandos rompía la inyección del cliente (`$'` en
  `String.replace`); el patrón se escapa y el catálogo vuelve a mostrarse completo.

### Compatibilidad

- Se instala **encima de la 5.3.7** (`versionCode` 65) sin desinstalar: la firma no cambia desde la
  5.1.7. El APK 5.4.0 es `versionCode` 68 y el puente y el APK deben actualizarse juntos.
- Sin dependencias npm nuevas (cero dependencias) y sin cambios en el formato de datos: las notas,
  los chats sincronizados y el registro de dispositivos se conservan.
- La 5.4.0 es la versión actual de cierre de la serie 5; las publicaciones posteriores de la línea
  son solo de seguridad y mantenimiento. Una función nueva o una adaptación a un Harness
  incompatible saldría como línea nueva.

### Notas de la build

- APK: **189,536 bytes (185 KB)**, SHA-256
  `7f0e6922033a04c4d8da55037a99c4e4821e7b5b5633d17697f5a456ac74760e`. Commit de origen
  `dc231ccbe216ca810540bc2246b02c2506835e8d`; el registro completo está en `RELEASES.json`.
- Verificación sobre el binario publicado: **418 comprobaciones en total (416 en CI, 2 omitidas por el APK)** y **915 comprobaciones Java
  ejecutadas en local**.

## 5.2.10 — `versionCode` 54

Corrección de la línea 5.2 tras la auditoría técnica de la 5.2.9. **Sin funciones nuevas**: cierra
fallos de integridad de datos, de acceso y de operación, y alinea la documentación con el código.

### Corregido — datos de las notas

- **Escritura atómica de la nota**: el `.md` se escribe en temporal y se renombra; un corte de
  corriente o un `SIGKILL` ya no deja un archivo de 0 bytes.
- **Índice antes que contenido**: `ids.json` se reserva antes de escribir la nota, así que reenviar
  el mismo `id` tras un corte actualiza en vez de duplicar.
- **Poda de la bandeja serializada**: `inbox.jsonl` no se reescribe desde dos peticiones a la vez
  (fin de los `EPERM` y de los `.tmp` huérfanos en Windows).
- **`GET /dsh-companion/notes`** recorre las 500 líneas que retiene la poda (antes solo 200).

### Corregido — acceso y privacidad

- **Kill switch honesto**: si la clave viene de `DSH_ACCESS_KEY`, la rotación ya no finge: responde
  `rotated: false` con el motivo. Con clave en archivo, rota de verdad.
- **`hasValidAccessKey`** ya no acepta cualquier `Authorization` cuando no hay clave configurada.
- **Rechazo por solicitud, no por IP**: un rechazo deja de bloquear a todos los equipos tras el NAT.
- **`/healthz`** pasa por la misma frontera de `Host`/`Origin` que el resto de rutas.
- **QR**: si la URL no cabe, se muestra en texto en vez de generar un QR truncado e idéntico para
  textos distintos.

### Corregido — cliente Android

- **Un solo envío de nota en vuelo**: doble toque en «Enviar» ya no crea dos notas en la PC.
- **Comparador de versiones**: `5.2.9-rc1` deja de considerarse más nuevo que `5.2.9`.
- **`<queries>` en el manifest**: el lector de QR vuelve a resolverse en Android 11+.
- **«Limpiar caché» conserva la cookie de emparejamiento**: deja de mandar el teléfono a
  «Acceso pendiente» y de exigir re-aprobación.
- **Notas**: conserva filtros, orden y búsqueda al rotar; modo apaisado con drawer y compositor
  compacto.
- **Avisos**: el interruptor maestro cubre también la desconexión, la visibilidad es coherente y el
  permiso de batería se re-sincroniza al volver del diálogo del sistema.

### Corregido — operación

- **Cierre ordenado en Windows**: `stop.bat` crea la bandera `companion.stop`, el puente la vigila y
  sale con código 0; solo se fuerza si no cierra en 5 s.
- **Variables de entorno inválidas**: se avisa con el valor rechazado y el default aplicado.
- **Aislamiento de la suite**: `DSH_SYNC_DIR`, `DSH_LOG_FILE` y `DSH_STOP_FLAG` mantienen las
  pruebas fuera del `synced_chats/` y del `bridge.log` del repositorio.

### Compatibilidad

Se instala **encima de la 5.2.9** sin desinstalar (mismo certificado desde 5.1.7). El APK de 5.2.10
es `versionCode` 54; el puente y el APK deben actualizarse juntos.

## 5.2.9 — `versionCode` 53

Actualización de producto de la serie 5.2: **Notas** pasa a ser la función central del teléfono.
Se retira el campo de chat de destino (no entregaba nunca al chat) y entran **siete perfiles
declarativos**, la fecha límite, la privacidad local y una bandeja de notas recibidas en el panel.

### Añadido

- **7 perfiles declarativos de nota**: General, Escritor, Programador, Docente, Periodista,
  Jurídico y Diseño. Cada perfil aporta sus tipos, sus estados y la etiqueta de los campos propios
  (Materia/Grupo o alumno; Caso o tema/Fuente; Expediente/Cliente; Cliente/Proyecto;
  Obra/Personaje; Proyecto/Módulo o archivo; Proyecto/Detalle).
- **Fecha límite (`dueDate`)**: selector de fecha, orden por vencimiento y filtros «Con fecha» y
  «Prioridad».
- **Bandeja «Notas recibidas» en el panel de la PC**: las últimas 10 notas, en solo lectura.
- **`GET /dsh-companion/notes`**: metadatos de las notas recibidas (sin cuerpos) para la bandeja.
- **Marca «Solo en el teléfono»**: la nota no se envía nunca, queda fuera de «Enviar todas» y
  compartirla pide confirmación.
- **Cifrado en reposo de `notes.json`** con AES-256-GCM y una clave del AndroidKeyStore.
- **FLAG_SECURE en Notas**: sin capturas de pantalla y sin miniaturas en el selector de recientes.

### Cambiado

- **Se retira el chat de destino**: desaparece de la interfaz, del payload y del puente. El puente
  ignora el campo `chatTarget` si llega, y el nombre del archivo ya no lleva prefijo de chat.
- **Nota de solo título**: se puede enviar una nota sin cuerpo.
- **Idempotencia por `id`**: reenviar una nota actualiza el mismo archivo en la PC en vez de
  duplicarlo.
- **Front matter**: incluye `id`, `dueDate` y `updatedAt`; sin `chatTarget`.
- **Búsqueda sin acentos ni mayúsculas** (`garcia` encuentra `García`) y filtros por perfil, tipo,
  estado, proyecto y prioridad.

### Corregido

- Enviar una nota ya no deja dos archivos ni dos líneas en la bandeja de la PC.
- La nota que no se puede enviar se queda en el teléfono con un aviso que distingue el motivo (sin
  PC, sesión rechazada, nota rechazada, red).
- «Enviar todas» excluye las notas marcadas «Solo en el teléfono».

### Privacidad

- `notes.json` cifrado en reposo (AES-256-GCM, AndroidKeyStore); los archivos en texto plano de
  versiones anteriores se migran al leerlos.
- **FLAG_SECURE** en la pantalla de Notas.
- **«Solo en el teléfono»**: sin envío, fuera de «Enviar todas» y compartir pide confirmación.
- Las notas no hacen peticiones a Internet ni guardan cuentas ni claves de API.

### Accesibilidad

- Editor desplazable con el teclado abierto.
- Objetivos táctiles de 48 dp o más e insignias con contraste AA.
- Los chips anuncian la selección a TalkBack y el autoguardado usa una región viva.
- Tarjetas con descripción accesible y título de 2 líneas.

### Notas

- Se instala **encima de la 5.2.8** (`versionCode` 52) sin desinstalar; la firma no cambia desde la
  5.1.7.
- **La serie 5.2 continúa**: esta versión cambia producto, no solo seguridad.
- Los adjuntos y los recordatorios del sistema operativo quedan para después.

## 5.2.8 — `versionCode` 52

Actualización de producto de la serie 5.2: **se retira el modo satélite** (el chat en la nube que
solo funcionaba con la PC encendida) y entran las **notas locales**, que funcionan con la PC
apagada, sin Internet y sin clave de API.

### Eliminado

- **Modo satélite completo**: la pestaña de la página offline, su cliente Android
  (`CloudSatelliteClient`, `SatelliteUi`), sus estilos y su JS de la página offline y el panel de
  ajustes que configuraba la clave.
- **La clave de API de DeepSeek en el teléfono**: el almacén cifrado que la guardaba y el único
  tráfico del dispositivo a `api.deepseek.com`.
- **La ruta `POST /dsh-companion/absorb-satellite`** y el almacén `satellite_notes/` del puente.
- La pestaña de satélite en la página offline: queda con **Estado** y **Lector**.

### Añadido

- **Notas locales**: se guardan solo en el teléfono, se crean, editan, borran y comparten con el
  selector de Android; funcionan con la PC apagada, sin Internet y sin clave de API.
- **Envío a la PC**: con el puente accesible, *Enviar a la PC* escribe la nota en
  `synced_chats/notes/` de la computadora. Con la PC apagada la nota permanece en el teléfono.

### Seguridad

- Fuera el **único tráfico del teléfono a `api.deepseek.com`** y fuera el **almacén de esa clave**:
  el dispositivo ya no guarda credenciales de terceros.
- El **lector offline de chats** sigue necesitando la PC: los chats los sirve el puente.

### Notas

- Se instala **encima de la 5.2.0** (`versionCode` 51) sin desinstalar; la clave de API que hubiera
  guardada se borra al actualizar.
- La **serie 5.2 continúa**: esta versión cambia producto, no solo seguridad.

## 5.2.1 — parche de seguridad (solo puente; APK 5.2.0 / versionCode 51)

### Seguridad

- **`/healthz` deja de filtrar topología fuera de loopback.** El healthcheck del contenedor y
  la propia PC (loopback) siguen recibiendo el detalle (IP de enlace, puerto de Harness, estado
  del contrato); cualquier otro equipo de la red privada recibe solo
  `{ service, version, status, ok, time }`. Antes se exponía `bindHost` (la IP de la VPN) y el
  puerto interno de Harness a cualquier miembro de la red.
- **Contrato de `turn/end` estricto**: si en las sesiones recientes hay `turn/start` sin su
  `turn/end`, el contrato se marca `degraded` (los avisos por turno pueden perderse) en vez de
  `ok`. Sin turnos recientes sigue siendo `ok` (formato reconocido).

### Notas

- Cambio solo de puente: **el APK no cambia** (5.2.0 / versionCode 51) y se instala igual.
- Serie 5.2 congelada: este es el parche de seguridad previsto por la política de la línea.

## 5.2.0 — `versionCode` 51 (versión actual)

Versión de **fortalecimiento**, no de producto: se mantienen todas las funciones, la configuración
y el formato de datos de la 5.1.10. La 5.1.10 se puede actualizar a la 5.2.0 encima, sin
desinstalar (la firma no cambió desde la 5.1.7). A partir de aquí la línea queda congelada: solo
correcciones de seguridad.

### Añadido — salud real y contrato con Harness

- **`/healthz` real**: distingue `ok` (puente y DeepSeek Harness confirmados), `degraded` (ambos
  arriba, pero alguna pieza del contrato interno cambió) y `down` (HTTP 503: Harness no responde).
  El puente lo sirve sin credenciales desde la red privada o loopback y no expone secretos.
- **Healthcheck de Docker con `/healthz`**: antes preguntaba a `/dsh-companion/status`, que
  respondía 200 aunque Harness estuviera caído. Ahora un contenedor "sano" implica Harness vivo.
- **`src/dsh-contract.mjs`**: al arrancar (y cada 10 minutos) comprueba las piezas internas de
  Harness de las que depende el puente —cookie `dsh-auth-*`, marcador `__DSH_BOOT__`, evento
  `turn/end`, atributo `data-approval-key` y descubrimiento de puerto—. Si una cambia, **degrada
  solo la función afectada** con un aviso claro en `bridge.log` (avisos, aprobaciones, sesión)
  en vez de morir o fallar en silencio. El estado se expone como `contract` en `/status` y en
  `/healthz`.

### Añadido — copias de seguridad del estado

- **`backup.bat` / `restore.bat`** (con `backup.ps1` / `restore.ps1`): copian a
  `%USERPROFILE%\.dsh\backups\AAAA-MM-DD-HHMMSS\` el registro de dispositivos, la clave de acceso
  y el token del panel, con un manifiesto `backups/<fecha>/manifest.json` de tamaños y SHA-256.
  `--dry-run` no escribe nada.
- **Restauración fail-closed**: `restore.ps1` verifica los hashes **antes** de escribir; si el
  respaldo está manipulado se niega y no toca nada, y antes de restaurar guarda una copia del
  estado actual en `backups\<fecha>-pre-restore`.
- **El instalador respalda el registro** antes de actualizar/arrancar (si falla, avisa pero no
  aborta la instalación) y **`doctor.ps1` avisa** cuando no hay una copia reciente.

### Añadido — operación y soporte

- **`OPERACION.md`**: cómo aprobar un dispositivo nuevo, arrancar/reiniciar el puente, revisar
  `bridge.log` y su rotación, comprobar la salud y restaurar copias **sin estar delante de la
  computadora**. Incluye la recomendación de **RustDesk** como soporte remoto opcional (servidor
  self-hosted o solo sobre ZeroTier/Tailscale, contraseña fuerte + 2FA, apagado cuando no se usa);
  RustDesk **no es parte del producto ni se empaqueta**.
- **`SUPPORT.md`**: qué está soportado, qué no, y cómo pedir ayuda con evidencia verificable.
- **`CHECKLIST-VERIFICACION.md`**: lista de comprobación de la versión actual **desde el teléfono**.
- **`AUDITORIA-EXTERNA.md`**: tres prompts listos para auditoría de seguridad, onboarding y APK.

### Añadido — registro de versiones y política

- **`RELEASES.json`**: registro legible por máquina de cada build publicado (versión,
  `versionCode`, commit, SHA-256 del APK, huella del certificado y fecha). Política documentada en
  `RELEASING.md`: **el `versionCode` solo sube al publicar**.

### Revisado — permisos del APK

- Auditoría de cada permiso con su uso real. `RECORD_AUDIO` **se mantiene**: solo se concede al
  frame del búnker cuando la página pide captura de audio (quitarlo rompería la entrada de voz en
  la GUI). `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` **solo se pide al activar el interruptor
  "Permitir en segundo plano"** de los avisos, nunca al arrancar. Detalle en `SECURITY.md`.

### Limpieza

- Notas `RELEASE_5.1.7/8/9` eliminadas (el `CHANGELOG` ya las cubre) y referencias corregidas.
- Las cuatro referencias de la skill `mobile-companion-setup` se fusionan en dos, sin renombrar
  archivos: `doctor-contract.md` (contrato + informe) y `fixes.md` (mapa + pasos de instalación).
- Capturas y copias duplicadas eliminadas cuando no estaban referenciadas.

### Compatibilidad

- **Sin cambios de configuración**: mismas variables de entorno, mismo registro, mismo formato de
  datos y misma API. La 5.2.0 es compatible con la 5.1.10.
- **Sin dependencias npm nuevas** (cero dependencias).
- Las comprobaciones históricas se mantienen: **14 suites / 235 comprobaciones** en local y **203**
  en CI, más los tests Java puros (61 watchdog + 16 cleartext + 14 bridgeguard + 25 apkdigest).
  Se añaden verificaciones adicionales (`test/verify_healthz.mjs`, `test/verify_backup.mjs`) fuera
  de ese conteo para no romper la comparabilidad histórica.

## 5.1.10 — `versionCode` 50 (versión final de la serie 5)

### Correcciones del QA final

- **D1 (ALTA): la actualización desde la PC fallaba con `NullPointerException`** porque la ruta
  del búnker no tiene digest de GitHub; ahora usa como ancla el SHA-256 que publica el puente
  (`apkSha256`).
- **H1 (MEDIA): con `DSH_ALLOW_PROXY_ACCESS=1`, una petición con cabeceras de proxy se trataba
  como loopback** (podía autoaprobarse, abrir el panel y ver `pendingList`); ahora el flag solo
  permite pasar la guarda de red y nunca eleva privilegios.
- **H2 (MEDIA): un dispositivo `viewer` podía abrir el WebSocket**; ahora se rechaza el upgrade de
  un viewer.
- **H3 (BAJA): un symlink o hardlink dentro de `synced_chats/` permitía leer archivos del host
  como conversación**; ahora se rechazan los archivos no regulares y se comprueba la ruta real.
- **H4 (BAJA): el panel aceptaba `Origin: null`**; ahora lo rechaza como el resto de orígenes
  ajenos.
- **H5 (BAJA): un JSON malformado en `/sync` podía inyectar texto arbitrario en `bridge.log`**;
  ahora se sanea (sin CR/LF ni caracteres de control, truncado).
- **D3 (BAJA): el kill switch borraba las cookies aunque la revocación no se hubiera confirmado**;
  ahora solo cierra la sesión local si el puente confirma.
- **D4 (BAJA): la biometría crítica llamaba a un hook JS inexistente**; ahora usa el hook real del
  cliente.
- **D5 (INFORMATIVA): `BootReceiver` ya no es `exported=true`** (`BOOT_COMPLETED` es un broadcast
  protegido).
- **D6 (INFORMATIVA): el descubrimiento Android ya no acepta el marcador por subcadena**; exige
  JSON con `service == "dsh-companion"`.

**D1, H1 y H2 justifican por sí solos el relanzamiento**: rompían la actualización desde la PC y
abrían dos vías de privilegio.

### Corregido (informe externo, puntos verificados)

- **P7: el simulador ya no es público.** `/simulator` se servía con 200 a cualquiera en la red
  privada; ahora exige un dispositivo emparejado o la clave de acceso.
- **P55: el simulador estaba roto.** Su HTML cargaba `simulator-base.css`,
  `simulator-components.css` y `simulator.js`, que el puente no servía (403). Añadidos a los
  estáticos con su tipo MIME.
- **P23:** el puerto del panel (57421) ya no está entre los candidatos del backend de Harness.
- **P6: sin ventana del panel para peticiones proxificadas.** Con cabeceras de proxy
  (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`) el puente ya no abre la ventana del panel
  en el escritorio del host.

### Descartados tras verificar el código (no aplican)

- **P33**: `focusPanelWindow` ya tiene espera de 60 s en `panel.mjs`.
- **P40**: `NetCredentials` limpia cookies y credenciales HTTP al eliminar una PC (con el límite
  de Android documentado).
- **P45**: el SSE solo emite `{type, turn, at}`; no difunde nombres de espacio ni sesión.
- **P52**: `/pair` responde 403 solo cuando el boleto ya no es válido; es el comportamiento correcto.


### Añadido

- **Licencia más clara para empresas**: el *Additional Use Grant* permite ahora uso interno en
  producción hasta 50 dispositivos sin licencia comercial. El resto (producto, servicio alojado,
  reventa) sigue requiriendo licencia. Tabla de decisión en `LICENSING.md`.
- **Contribuciones**: `CONTRIBUTING.md` deja explícita la licencia de entrada y la posibilidad de
  relicenciar en versiones futuras.
- **Guarda contra proxies inesperados**: si una petición llega con cabeceras de proxy
  (`cf-connecting-ip`, `cf-access-jwt-assertion`, `x-forwarded-for`) el puente la rechaza salvo
  que se arranque con `DSH_ALLOW_PROXY_ACCESS=1`. Así no se publica el puente por accidente.
- `AI_SETUP_PROMPT.md` documenta iPhone/PWA (Safari, `Add to Home Screen`, PWA estática en
  cualquier servidor estático propio) y el acceso remoto opcional con red privada (ZeroTier o
  Tailscale); no hay túneles públicos soportados.
- **Informe del doctor verificable**: `doctor.ps1 -Report` añade `apkSha256`, `apkVersion`,
  `apkVersionCode`, `certSha256Release` y un `receipt` sha256 calculado sobre el JSON compacto sin el
  recibo, y escribe `doctor-report.json` sin BOM para que `JSON.parse` funcione sin limpieza previa.
  Nuevo `tools/verify-receipt.mjs` (sin dependencias) que verifica el recibo y puede exigir el
  sha256 del APK y la huella del certificado de release.
- **Matriz de compatibilidad de agentes**: [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md) documenta, con estado
  explícito (probado frente a solo documentado), qué agentes pueden instalar el companion, cómo
  reciben el contexto, qué pueden ejecutar y el texto mínimo de traspaso. Incluye el enlace de la
  skill en `.dsh/skills` o `.agents/skills` y el recibo como evidencia.

### Cierre de la serie 5

- `AUDIT_CLOSURE.md` añade al cierre de los 56 puntos del informe externo la tabla de los diez
  defectos del QA final (D1, H1–H5, D3–D6).
- **Esta es la versión final de la serie 5.** Lo siguiente se publicará como pre-release 5.2.x.

## 5.1.9 — `versionCode` 49 (base de la serie 5)

### Añadido

- **Watchdog totalmente configurable**: silencio antes de reconectar (1/3/5 min), reintentos antes
  de reiniciar (1/2/3), avisar si no recupera (on/off) y botón "Probar ahora" en Ajustes. Los
  cambios se aplican en caliente en el siguiente tick.
- **Arranque tras reiniciar el teléfono**: `BootReceiver` arranca el servicio solo si el usuario
  dejó activos los avisos de la PC y el watchdog (`RECEIVE_BOOT_COMPLETED`).

### Corregido

- **P1 completo**: el nonce cubre **los 23 métodos** expuestos por `CompanionBridge` (no solo 9).
  Sin nonce válido no se ejecuta nada; los getters devuelven `fallback` y no se llama al puente.
- **P22**: el descubrimiento ya no acepta "algo responde"; `probeDshIdentity` distingue identidad
  confirmada / posible / ninguna y solo se engancha a DSH.
- **P2**: `verify_registry_safety` deja un respaldo `.test-bak` con fsync y restaura al arrancar si
  la ejecución anterior quedó a medias.

### Estado de la serie 5

- `AUDIT_CLOSURE.md` fija el estado de los 17 puntos abiertos o en disputa del informe externo:
  7 cerrados en 5.1.8, 2 en 5.1.9, 4 aceptados con mitigación y 4 verificados como no aplicables.
- **La 5.1.9 fue la base de la 5.1.10**, la versión final de la serie 5.

## 5.1.8 — `versionCode` 48

### Añadido

- **Roles por dispositivo**: `role: full | viewer`. Un `viewer` puede leer el chat y los avisos,
  pero el puente le rechaza las escrituras (sync, absorb-satellite, aprobaciones, kill switch) y
  los mutantes del proxy, con un allowlist corto de lecturas que DSH envía por POST. Documentado
  en `DISPOSITIVOS.md` con sus límites.
- **Multi-instancia**: cada dispositivo puede fijar `targetPort` y atender un backend de Harness
  distinto (dos instancias o dos PCs). Si el puerto no responde se usa el backend por defecto y se
  registra. Se configura desde el panel.
- **VPN más amplia y guiada**: detección de NetBird, Nebula, EasyTier, Tinc, SoftEther, Twingate,
  Headscale, Hamachi y Radmin (estos dos últimos detectados pero no enlazables por sus rangos).
  Con varias candidatas el doctor lista y sugiere `DSH_BIND_HOST`. Nuevo `VPN_OPTIONS.md`.
- **Watchdog de avisos**: el servicio en primer plano detecta un SSE colgado (3 min sin actividad
  y sin keep-alive), reconecta, reinicia la escucha si hace falta y avisa una sola vez si no
  recupera. Interruptor en Ajustes ("Reiniciar el servicio si se cuelga", ON por defecto).

### Corregido (auditoría externa)

- **P1**: el nonce cubre ahora también `onApprovalRequested`, `onGenerationFinished`,
  `onJobFinished`, `copyToClipboard`, `saveOfflineDraft` y `onHeartbeat`.
- **P3**: fuera la acción muerta de aprobación desde la notificación (botones, receptor y acción
  pendiente); la notificación queda informativa y se limpian restos de versiones anteriores.
- **P36**: `CleartextPolicy` es fail-closed ante cualquier excepción.

## 5.1.7 — `versionCode` 47

### Cambiado

- **El APK se firma con un keystore de release**, no con el de depuración. Certificado nuevo
  (SHA-256 `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`), RSA 4186, válido 30 años. Cualquiera puede verificar con
  `apksigner verify --print-certs`.
- `build-release.ps1` compila y firma leyendo la contraseña desde
  `~/.dsh/release-keys/keystore-password.txt`: el keystore y la contraseña **no** viven en el
  repositorio. `build-apk.ps1` sigue existiendo para desarrollo (firma de depuración).
- Documentación: sección "Firma del APK" en los 7 README, procedimiento y aviso de respaldo en
  `RELEASING.md`, verificación en `SECURITY.md`.

### Aviso

- **Cambió la firma**: los APK 5.1.6 y anteriores usaban el certificado de depuración. Android
  rechaza una actualización firmada con otra clave, así que **hay que desinstalar la app una vez**
  e instalar la 5.1.7. A partir de ahí las actualizaciones se instalan encima normalmente.
## 5.1.6 — `versionCode` 46

### Corregido

- **La actualización desde la PC instalaba el APK equivocado.** El puente servía
  `../DSH-Companion.apk` (la copia de la raíz, que puede quedarse atrás) mientras
  `/status` anunciaba la versión recién compilada. Resultado: pulsabas "Instalar
  actualización (v5.1.5)", se instalaba la 5.1.4 y el botón seguía apareciendo.
  Ahora el puente sirve **el APK de su propio directorio** (el que acaba de
  compilar) y el teléfono verifica que la versión instalada coincide.

### Añadido

- **SHA-256 del APK servido en `/status`** (`apkSha256`). El teléfono lo usa como
  ancla al actualizar desde la PC: antes esa ruta se instalaba sin verificar.
- **Consulta a GitHub forzada cuando el puente no responde**: sin túnel, la única
  vía de actualización es GitHub y ya no espera las 6 horas de caché.

### Nota de proceso

- El `versionCode` solo sube cuando cambia el código Android. Las correcciones de
  documentación o del puente ya no provocan un aviso de actualización.
## 5.1.5 — `versionCode` 45

Cierre de los dos huecos que quedaban en ingeniería.

### Añadido

- **La suite corre en CI**: job nuevo en `.github/workflows/verify.yml` que levanta un
  puente aislado con `DSH_HOME` temporal y un doble de DeepSeek Harness (sin credenciales
  reales, sin tocar el equipo del usuario) y ejecuta **9 suites · 151 comprobaciones**
  (`npm run test:ci`). Quedan fuera, documentadas con motivo: `verify_sync_ws` (necesita
  el WebSocket real), `verify_kill_switch` (destructiva) y `verify_approval` (el boleto
  del panel es de un solo uso).
- **Rotación de `bridge.log` en caliente**: ya no crece sin límite. Rota por tamaño
  (`DSH_LOG_MAX_MB`, 5 MB por defecto) conservando `DSH_LOG_KEEP` (3) archivos, sin perder
  ni duplicar líneas aunque `cmd.exe` mantenga el archivo abierto (copia + ftruncate del
  descriptor heredado; `rename` atómico si no hay redirección).
- Prueba nueva `test/verify_log_rotation.mjs` (**27/27**), con el caso difícil de Windows.
## 5.1.4 — `versionCode` 44

Tres frentes de disponibilidad que no estaban cubiertos.

### Corregido

- **El puente se quedaba escuchando en loopback si el túnel aún no tenía IP al
  arrancar** (lo normal al iniciar sesión en Windows, donde ZeroTier/Tailscale
  conectan después). El teléfono no llegaba hasta reiniciar el puente a mano.
  Ahora un vigilante revisa la interfaz cada 15 segundos y se reenlaza solo en la
  nueva IP privada. Si fijas `DSH_BIND_HOST`, no se toca nada.
- **Supervisor de arranque**: si el puente cae por un fallo, `run-hidden.vbs` lo
  vuelve a levantar (espera de 5 s, hasta 50 intentos). Antes, un cierre
  inesperado dejaba el teléfono incomunicado hasta que alguien lo notara.
  `stop.bat` ahora escribe `companion.stop` para que el supervisor no resucite
  el servicio mientras se detiene.
- **Excepciones no controladas**: se registran en `bridge.log` y el proceso sale
  con código 1 para que el supervisor lo recupere, en lugar de quedar vivo con
  estado dudoso.

### Añadido

- **Límite de intentos de clave por IP**: 30 fallos en 5 minutos y se responde 401
  sin calcular el HMAC durante el resto de la ventana. La clave ya era larga y
  aleatoria, pero sin freno se podía castigar la CPU desde la red privada.
- **Exención de batería en el teléfono**: Ajustes → *Permitir en segundo plano*.
  Los fabricantes (Samsung incluido) matan el servicio en primer plano si la app
  no está exenta y los avisos dejan de llegar sin avisar. Requiere
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` y abre la pantalla del sistema.
## 5.1.3 — `versionCode` 43

Correcciones de la auditoría final de publicación. Sin cambios de comportamiento.

### Documentación

- Los 5 README que se quedaron sin ella recuperan la sección **"Construir el APK"** y la
  cola del árbol (`tools/`, `build-apk.ps1`, `RELEASING.md`, CI, `SECURITY.md`, `CHANGELOG.md`).
- `AI_SETUP_PROMPT.md` pide **Node 22.15** (decía 20, que rompe los avisos por turno) y ya no
  dice que se arranque el puente dos veces.
- `SECURITY.md`, `AI_SETUP_PROMPT.md` y `docker-compose.yml` dejan de mencionar la terminal
  remota, eliminada en la 5.1.1.
- `DISPOSITIVOS.md`: la app sí usa la clave de acceso, y la sesión del panel dura 12 horas.
- Tabla de variables ampliada en los 7 idiomas: `DSH_ALLOWED_HOSTS`, `DSH_ALLOW_GENERIC_VPN`,
  `DSH_SYNC_MAX_FILES` y `DSH_SYNC_MAX_TOTAL_MB`.
- Rutas y módulos completados en el README (`/stats`, `/absorb-satellite`,
  `/notification-action`, `/simulator` y los seis módulos que faltaban).
- La cifra de pruebas queda en **154**, la que da la corrida real (el badge decía 154 y el
  texto 155).
- Requisitos de compilación (JDK 17+, plataforma `android-35`, keystore) en README y
  `RELEASING.md`.

### Scripts

- `panel.bat` respeta `DSH_PANEL_PORT` y su bloque de PowerShell se validó con el parser
  (antes quedó con una línea rota al editarlo).
- `install-autostart.bat` crea el acceso directo con las comillas correctas en `Arguments`.
- Docker: el `COPY` incluye `icon.svg` y `manifest.webmanifest`, y el healthcheck usa el
  puerto efectivo (`DSH_LISTEN_PORT`).

## 5.1.2 — `versionCode` 42

### Corregido

- **El panel se llenaba de solicitudes duplicadas del mismo teléfono.** La pantalla de
  espera se sirve en `/` y sondea `/dsh-companion/status`; la cookie de canje está
  acotada a `/dsh-companion`, así que las peticiones a `/` llegaban sin token y cada
  reintento creaba una solicitud nueva (15 seguidas en la captura del usuario). Ahora
  se reutiliza la solicitud del mismo equipo (IP + user-agent) y el reloj se refresca
  al reintentar.
- **El panel agrupa duplicados.** Aunque queden solicitudes repetidas de una versión
  anterior, se muestra una sola tarjeta por equipo: la más reciente.
- Limpiadas las solicitudes acumuladas en el registro al aplicar el arreglo.

## 5.1.1 — `versionCode` 41

Cierre de los residuales del informe y de los opcionales de repositorio.

### Cambios

- **Terminal remota eliminada** (P14): fuera el endpoint `/dsh-companion/terminal`,
  `DSH_ENABLE_TERMINAL` y su documentación. Era un shell remoto opcional que nadie
  usaba y que no aporta nada que no puedas hacer en la propia computadora.
- **`pendingList` ya no se envía a los teléfonos** (P16): solo el panel local recibe
  ids, códigos, IPs y user-agents de otros equipos; el teléfono ve el contador.
- **La VPN corporativa ya no se toma por defecto** (P20): la detección automática
  solo acepta ZeroTier, Tailscale y WireGuard; un `tun`/`tap` genérico se ignora con
  aviso y, si de verdad es tu red, se habilita con `DSH_ALLOW_GENERIC_VPN=1` o
  `DSH_BIND_HOST`.
- **El panel no roba el foco** (P33): traer la ventana al frente ocurre una sola vez
  por minuto y nunca si ya hay una pestaña del panel abierta.
- **Modo satélite documentado** (P15): el aviso de que envía tu conversación a
  `api.deepseek.com` con tu clave está ahora en los 7 README y en la propia página
  offline, antes de usarlo.
- Arreglo de maquetación de la barra de pestañas de la página offline (flex-wrap y
  min-width), que podía desbordar en pantallas muy angostas.

## 5.1.0 — `versionCode` 40

Cierre de los 56 puntos del informe de revisión. Es la versión 5 completa.

### Seguridad

- **P1 — JS bridge blindado por nonce.** `BridgeGuard` rota un nonce por página
  (128 bits, comparación en tiempo constante) y lo inyecta como
  `window.__DSH_BRIDGE_TOKEN__`. `installUpdate`, `confirmCriticalApproval` y
  `startSatelliteQuery` exigen el nonce **y** que la llamada venga del frame
  principal del búnker: un iframe cross-origin ya no puede gastar la clave de API
  ni lanzar una instalación.
- **P17** redirects a orígenes externos se cortan en `onPageStarted`.
- **P18** los extras de la actividad exportada exigen un token privado firmado.
- **P19** el APK se verifica contra el `digest` SHA-256 de GitHub antes de instalar.
- **P34** `FLAG_SECURE` opcional (activo por defecto con bloqueo biométrico).
- **P40** al borrar una PC se expiran sus cookies y se limpian sus credenciales HTTP.
- **P42** el canje de dispositivo ya no depende de la IP: cookie de canje de un solo uso.
- **P24** lista cerrada de métodos en el proxy; **P4** tope de subida de 256 MB.
- **P36/P37** `CleartextPolicy` fail-closed e incluye CGNAT.
- **P51** CSP y cabeceras de seguridad en las páginas propias.

### Puente y red

- **P5** el descubrimiento valida el JSON del puente antes de auto-conectar.
- **P11** descubrimiento de puerto DSH también en Linux y macOS, sin bloquear el bucle.
- **P12** `DSH_ALLOWED_HOSTS` para Tailscale MagicDNS.
- **P13** el panel valida la cabecera `Host`.
- **P6** `/status` anónimo reutiliza la solicitud y abre el panel una sola vez por IP.
- **P47/P48** `DSH_ACCESS_DISABLE` validado al arrancar y refresca `lastSeen`.
- **P49** Docker sin `~` y con healthcheck real; **P10** Node ≥ 22.15 (zstd nativo).

### Sincronización y avisos

- **P8** el Markdown se guarda fiel (solo `<` y `&` neutralizados, sin barras invertidas).
- **P9** retención configurable de `synced_chats/`.
- **P32** la telemetría ya no lanza PowerShell al importar (arranque 16 ms frente a 1 232 ms).
- **P45** el SSE de turnos ya no difunde nombres de espacio/sesión.
- **P46** frames zstd partidos sin atascos ni fugas de memoria.
- **P53** un solo planificador periódico en el cliente inyectado.
- **P54** interruptor para la copia del chat en `localStorage`.

### Notificaciones

- **P3** dejan de ofrecer aprobar/rechazar: el puente no puede resolverlo y el aviso
  indica dónde aprobar. **P2** la suite ya no borra el registro real de dispositivos.

### Pruebas y proyecto

- Suite ampliada a **11 archivos y 155 comprobaciones** (incluye guardas de
  configuración y el Markdown nuevo).
- CI en Node 22 con sintaxis + auditoría + guardas de configuración.
- `.editorconfig`, plantilla de PR y de incidencia.
- Cleanup: ningún archivo de código por encima de 400 líneas (116 archivos).

## 5.0.1 — `versionCode` 39

Correcciones sobre la 5.0.0, sin cambios de comportamiento fuera de los listados.

### Corregido

- **La suite ya no borra el registro real de dispositivos.** `verify_registry_safety`
  eliminaba `companion-devices.json` como parte de la prueba y lo dejaba borrado:
  un `npm test` desemparejaba los teléfonos. Ahora respalda antes y restaura siempre.
- **Las notificaciones ya no ofrecen aprobar lo que no se puede aprobar.** El puente
  responde 501 a `/action` y el emparejamiento exige el panel local, así que los
  botones Aceptar/Rechazar/Autorizar desaparecen: el aviso dice dónde aprobar.
  El receptor, si se pulsa una acción antigua, informa en vez de fingir.
- **Límite de subida en el proxy** (256 MB): un cliente autorizado ya no puede llenar
  memoria o disco subiendo sin tope.
- **El descubrimiento valida que el host sea el puente** (JSON con `service`), no
  cualquier servicio que responda 200 en `/dsh-companion/status`.
- **El kill switch cierra también las sesiones del panel**, no solo los túneles.
- **`CleartextPolicy` incluye CGNAT` (100.64/10) y es fail-closed**: si la política no
  se puede evaluar, el tráfico `http://` se bloquea.
- **WebView**: `setAllowContentAccess(false)` y reproducción de medios requiere gesto.
- **bridge.log rota** al arrancar si supera 5 MB.
- **CSP y cabeceras de seguridad** en las páginas propias (`offline`, `simulator`).
- **Eliminada configuración muerta** (`DSH_PAIR_OPEN`).

## 5.0.0 — `versionCode` 38

Versión mayor: cambia el modelo de confianza y el flujo de emparejamiento, así que
**no es compatible hacia atrás** con la 4.x. Un teléfono que venía funcionando debe
emparejarse otra vez si el kill switch rotó la clave.

### Breaking changes

- **Identidad de dispositivo por cookie, no por IP.** Un equipo que hereda una
  dirección de la VPN ya no hereda la sesión.
- **El kill switch rota la clave de acceso**, además de revocar dispositivos: lo que
  estaba emparejado deja de servir hasta volver a aprobarse.
- **La terminal remota está apagada por defecto** (`DSH_ENABLE_TERMINAL=1` para
  activarla) y, aun activada, solo acepta peticiones desde loopback.
- **El panel no usa token maestro**: la entrada es un boleto de un solo uso que se
  canjea por una cookie de sesión `HttpOnly`. Los enlaces `?t=` guardados dejan de
  funcionar y ya no se escribe `companion-panel-url.txt`.
- **`/dsh-companion/action` responde 501** para aprobaciones de herramientas: el
  puente ya no finge resolverlas. La aprobación de *dispositivos* solo se hace desde
  el equipo del host.
- **La caducidad de 30 días se aplica en el servidor**: los dispositivos sin uso se
  rechazan y se eliminan del registro.
- **`DSH_ACCESS_DISABLE=1` exige loopback** para arrancar.

### Seguridad

- Claves guardadas en Android cifradas con AES-256-GCM en el Android Keystore, con
  migración automática de los valores en claro.
- `CleartextPolicy` bloquea cualquier petición que no sea HTTPS o dirigida al búnker
  configurado o a una dirección privada; fuera `usesCleartextTraffic` y TLS forzado
  hacia los servicios públicos.
- El `/status` anónimo devuelve un payload mínimo y ya no calcula telemetría, lo que
  cerró un vector de CPU no autenticado.
- La clave de acceso ya no se escribe completa en `bridge.log`.
- Aprobaciones ocultas en la pantalla de bloqueo y rechazadas con el teléfono bloqueado.
- `/terminal`, `/open-panel`, `/retry` y `/pair-events` endurecidos; terminal y panel
  solo por loopback.

### Notificaciones

- Aviso de **respuesta terminada** cuando un turno finaliza en la computadora, con la
  app cerrada: el puente lo detecta en el registro de sesión (`turn/end`), así que
  llega **una sola vez por respuesta** aunque el modelo o una herramienta hagan pausas.
- El servicio en primer plano resuelve la clave del equipo activo y envía la cookie
  del dispositivo: antes pedía una clave que nadie escribía y el puente respondía 403
  en un bucle silencioso.
- Canales separados (respuestas de la PC, servicio, críticos) creados al arrancar.

### Mantenimiento

- **Todos los archivos de código por debajo de 400 líneas**, con un control automático
  en `tools/audit-repo.mjs` y en la CI.
- Cliente Android dividido en clases con una responsabilidad; cliente inyectado en
  módulos; `offline.html` y el simulador en HTML + CSS + JS; `routes` y `panel`
  separados por responsabilidad.
- Ayudantes duplicados unificados y mojibake reparado en los módulos publicados.
- `build-apk.ps1` para construir y firmar el APK sin Gradle ni Android Studio.
- `RELEASING.md` con el checklist de publicación y `.github/workflows/verify.yml`.
- README en 7 idiomas, `SECURITY.md`, `CHANGELOG.md` y `AI_SETUP_PROMPT.md`.

## 4.5.10 — `versionCode` 37

Cierre de la reescritura 4.4.1 → 4.5.x: endurecimiento, avisos por turno, troceo de
los archivos que pasaban de 400 líneas y documentación. Es la base de la 5.0.0.

### Seguridad

- **`CleartextPolicy`** (Java puro): `https` siempre; `http` solo contra el búnker
  configurado o una dirección privada/loopback. Verificada con 18 casos ejecutados
  con `javac`/`java` fuera del teléfono. Encima, la configuración de red de Android
  prohíbe cleartext a `deepseek.com`, `github.com`, `githubusercontent.com` y
  `githubassets.com`.
- El kill switch avisa con notificación crítica **antes** de ejecutarse y **después**
  con el resultado real; los avisos críticos ya no pasan por el filtro de "app visible".
- Avisos por turno leyendo `turn/end` del registro de sesión (frames zstd
  incrementales): un aviso por respuesta aunque el modelo o una herramienta pausen.
- El servicio en primer plano manda también la cookie del dispositivo: antes solo
  enviaba la clave y recibía 403 en bucle si el campo estaba vacío.

### Mantenimiento

- Ningún archivo de código pasa de 400 líneas. Cifras en **líneas de código (sin
  contar vacías)**, la misma métrica antes y después: `MainActivity.java` 3 943 →
  328, `offline.html` 1 355 → 126, `mobile-client.mjs` 951 → 35, `routes.mjs` 562 →
  335, `NotificationHelper.java` 601 → 381. (Antes se mezclaban totales de línea con
  líneas no vacías, y de ahí salían cifras infladas en la documentación.)
- Tres archivos que todavía pasaban de 400 líneas divididos en la 5.0.0:
  `NotificationHelper` → `NotificationsApproval`, `panel.mjs` → `panel-session.mjs`,
  simulador → HTML + CSS + JS.
- `build-apk.ps1`, `tools/audit-repo.mjs`, `RELEASING.md` y la CI de verificación.
- APK firmado con el mismo certificado de depuración: se instala encima sin
  desinstalar ni perder datos.

## 4.5.9 — `versionCode` 36

Cinco pendientes de seguridad de la revisión externa.

- **`/dsh-companion/action` solo desde el equipo del host**: aprobar o rechazar
  dispositivos deja de ser posible desde un teléfono ya emparejado; el panel local
  sigue aprobando por su canal.
- **`isCompanionRequestTrusted` fail-closed**: sin `DSH_COMPANION_TOKEN` ya no
  devuelve `true`; exige cookie de dispositivo o clave verificable.
- **El panel deja de usar token permanente**: boleto de un solo uso (2 minutos) que
  se canjea por una cookie `HttpOnly` + `SameSite=Strict`. Deja de escribirse
  `companion-panel-url.txt` y de usarse `?t=` guardado.
- **Claves del cliente Android cifradas** con AES-256-GCM en el Android Keystore,
  con migración automática de los valores que estaban en claro.
- **Cleartext**: `usesCleartextTraffic` fuera; `networkSecurityConfig` prohíbe
  cleartext a los dominios públicos y lo mantiene para el búnker en IP privada
  (Android no permite reglas por CIDR, así que el cierre total es el túnel).

## 4.5.8 — `versionCode` 35

Troceo del resto de archivos que pasaban de 400 líneas. **Ningún archivo de código
queda por encima** (108 archivos revisados; el mayor, `NotificationHelper.java` con 381).

- `MainActivity.java` **3 943 → 328** líneas: 33 clases con una responsabilidad
  (WebView, registro de PCs, Ajustes, actualizador, kill switch, biométrico, QR,
  satélite). Sigue siendo la `LAUNCHER` del manifiesto.
- `mobile-client.mjs` **951 → 35**: ocho módulos que se concatenan en **un solo
  `<script>`**; misma API `__DSH_*`, mismos intervalos y observadores.
- `offline.html` **1 355 → 126**: tres hojas CSS y tres JS; misma página, sin
  `<style>`/`<script>` inline.
- El `Dockerfile` copia los assets nuevos de `/offline` (si no, servía la página sin
  estilos) y `verify_registry_safety` reintenta en vez de romper por `EBUSY` en Windows.
- APK **4.5.8 (35)**, firmado, con las clases nuevas verificadas en el DEX.

## 4.5.7 — `versionCode` 34

- **El 403 intermitente de los avisos**: `PcEventsService` y el botón "Probar desde la
  PC" solo mandaban la clave de acceso; si el campo estaba vacío no había cabecera y
  el puente respondía 403 en bucle. Ahora envían también la cookie del dispositivo,
  como ya hacían el resto de rutas.
- **El aviso repetido**: el vigía disparaba con "el registro lleva 4 s sin crecer", y
  cada pausa del modelo contaba como fin. Ahora se emite solo al aparecer un
  `turn/end` nuevo, leyendo los frames zstd de forma incremental.
- **Troceo**: `NotificationHelper.java` 601 → **381** (`NotificationChannels.java` y
  `NotificationsPc.java` nuevos, con las constantes de canal en un solo sitio) y
  `routes.mjs` 562 → **335** con `routes-pairing.mjs` nuevo. Orden de rutas y
  respuestas intacto.

## 4.5.6 — `versionCode` 33

Segunda tanda de correcciones de la revisión externa (nueve cambios, siete hallazgos
cerrados y dos parciales sobre los 37 propuestos).

- `onRenderProcessGone` reconstruye el WebView en vez de dejar que Android mate la app.
- Aprobaciones ocultas en la pantalla de bloqueo y rechazadas con el teléfono bloqueado.
- La prueba real del kill switch pasa a **opt-in** con `DSH_TEST_DESTRUCTIVE=1`: una
  corrida normal ya no revoca dispositivos ni rota la clave.
- Código muerto eliminado y los tests dejan de apuntar a la IP del autor: usan
  `127.0.0.1` por defecto.
- README, `.gitignore` y versión del proyecto sincronizados. Suite **136/136**.

## 4.5.5 — `versionCode` 32

- **Notificaciones que no se pierden**: si Android tiene bloqueadas las notificaciones
  de la app se avisa con un botón directo a Ajustes (antes se descartaban en silencio),
  y los avisos críticos ya no pasan por el filtro de "app visible".
- Canales nuevos: **Respuestas de la PC**, **Avisos críticos** (con sonido) y
  **Escucha activa** (silencioso, para el servicio en primer plano).
- **Kill switch**: aviso crítico antes de ejecutarse ("Kill switch autorizado —
  Procediendo…") y después con el resultado real.
- Avisos de la PC por SSE (`/dsh-companion/pc-events`) y servicio en primer plano con
  `foregroundServiceType="dataSync"`, verificado con la suite y con el APK instalado.

## 4.5.4 — `versionCode` 31

- Kill switch reports the real result of the revoke request instead of claiming success.
- Notification channels split by purpose (approvals, tasks, connection, PC responses, service,
  critical).
- QR pairing fallback rewritten: offers the last known address, "use this address" and network scan.

## 4.4.1 — `versionCode` 22

- First public release: bridge, touch layer, APK, seven READMEs, installers for Windows, macOS and
  Linux, Docker files.

## Notas de release por versión

Las notas completas de cada versión publicada viven en la raíz del repositorio:

- [RELEASES.md](RELEASES.md#5110)
- [RELEASES.md](RELEASES.md#520)
- [RELEASES.md](RELEASES.md#521) — parche de seguridad, solo puente
- [RELEASES.md](RELEASES.md#528)
- [RELEASES.md](RELEASES.md#529)
- [RELEASES.md](RELEASES.md#5210)
- [RELEASES.md](RELEASES.md#540)