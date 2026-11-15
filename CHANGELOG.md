# Changelog

All notable changes to DSH Mobile Companion. The project follows `MAJOR.MINOR.PATCH` and the
Android `versionCode` increments once per published build.

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
