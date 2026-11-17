# Auditoría externa: tres prompts listos para pegar

Esta página reúne tres encargos **autocontenidos** para pedir una revisión independiente en otro
chat (otro modelo, otro agente o una persona): auditoría de seguridad, instalación desde cero en una
máquina limpia y auditoría estática del APK. Cada bloque se pega tal cual; incluye el contexto, las
reglas y los entregables, así que no hace falta explicar nada más.

Repositorio público: <https://github.com/TintaYNodos/dsh-mobile-companion> · Versión estable:
**5.2.9** (versionCode 53) · Licencia: Business Source License 1.1 (ver [LICENSE](LICENSE)).

Antes de pegar:

- Pega **un solo prompt por chat** para que el auditor no mezcle objetivos.
- Pide siempre evidencia verificable (`archivo:línea`, comandos y salidas reales); un informe sin
  evidencia no se acepta.
- Las reglas de los tres prompts incluyen lo mismo: **nada de secretos**, nada de datos reales de
  terceros, nada de exponer el puente a Internet y ningún cambio destructivo. El auditor no necesita
  la clave de acceso ni el token del panel para auditar el código.
- Los prompts se escribieron para el árbol de la **5.2.9**; si el repo ya tiene una serie posterior,
  indícalo en el chat y pide que anote el commit auditado.

## Prompt 1 — Auditoría de seguridad y adversarial del puente y del APK

```text
Eres un auditor de seguridad externo. Audita el proyecto DSH Mobile Companion, un puente local en
Node.js (cero dependencias de npm) más un cliente Android WebView y páginas offline. Repositorio
público: https://github.com/TintaYNodos/dsh-mobile-companion (rama main; la versión estable es la
5.2.9, versionCode 53).

CONTEXTO QUE DEBES VERIFICAR EN EL CÓDIGO, NO SUPONER
- El puente (bridge.mjs y src/**) se enlaza SOLO a la IP privada del operador (ZeroTier, Tailscale,
  etc.) en el puerto 57420. El teléfono entra por esa red privada: http://<IP-PRIVADA>:57420. El
  puente NUNCA se expone a Internet: no hay port forwarding, DNS público ni túnel público detrás.
  En 5.2.9 el panel de aprobación escucha únicamente en 127.0.0.1:57421.
- El backend real es DeepSeek Harness en 127.0.0.1 (puerto autodetectado); el puente actúa de proxy
  HTTP/WebSocket autenticado hacia él.
- Autenticación: clave de acceso compartida por HTTP Basic + cookie de dispositivo obtenida mediante
  aprobación de un solo uso en el panel local. El dispositivo tiene TTL de 30 días renovable.
- Hay cabeceras de proxy detectadas y rechazadas por defecto (DSH_ALLOW_PROXY_ACCESS=1 solo deja
  pasar la guarda de red, no concede privilegios de loopback).
- El cliente Android es Java puro (sin AndroidX, sin Kotlin), con WebView endurecido y claves en el
  Android Keystore. El APK de release se publica en GitHub Releases.
- La licencia es Business Source License 1.1: puedes leer y analizar el código para esta auditoría,
  pero no lo redistribuyas ni lo reutilices comercialmente.

REGLAS (obligatorias)
- Solo lectura sobre el repositorio: no modifiques archivos, no abras PR con cambios, no hagas
  commit. Si propones parches, entrégalos como diff en el informe.
- No ejecutes el interruptor de seguridad (kill switch): revoca dispositivos, cierra túneles y rota
  la clave de acceso de una instalación real.
- No ejecutes la suite completa contra una instalación real del usuario; la variable
  DSH_TEST_DESTRUCTIVE=1 no debe usarse. Si arrancas un puente para probar, hazlo aislado: copia del
  repo en una carpeta temporal, DSH_HOME temporal, puertos altos, sin tocar %USERPROFILE%\.dsh.
- Nunca necesitas secretos: no pidas la clave de acceso, ni el token del panel, ni .credentials.yaml,
  ni cookies de un usuario real. Si un hallazgo exige una credencial, explica cómo fabricarla en el
  entorno aislado.
- No expongas nada a Internet ni pruebes contra sistemas que no sean tuyos.

QUÉ REVISAR COMO MÍNIMO
- Modelo de amenazas completo: red privada, red compartida, teléfono perdido, dispositivo revocado,
  atacante en la misma VPN, navegador malicioso, DNS rebinding, proxy/túnel delante del puente.
- Superficie del puente: autenticación y autorización ruta por ruta; panel local y boleto de un solo
  uso; cookies/HMAC; TTL y revocación de dispositivos; validación de Host/Origin/Sec-Fetch-Site;
  cabeceras de proxy; upgrades WebSocket; contrabando de peticiones (Content-Length +
  Transfer-Encoding); límites de cuerpo y de frecuencia; inyección en logs; confinamiento de rutas en
  synced_chats/; saneamiento de contenido; rutas estáticas y simulador; proxy hacia Harness; rutas de
  notificaciones y aprobaciones; kill switch; sync; notas locales.
- **Notas locales (5.2.9):** nota de solo título (cuerpo vacío) escrita como Markdown válido; front
  matter con `id`, `dueDate` y `updatedAt`, sin `chatTarget`; reenvío con el mismo `id` actualiza el
  MISMO archivo (idempotencia por `ids.json`) y no duplica la línea de `inbox.jsonl`; `GET
  /dsh-companion/notes` devuelve solo metadatos (nunca cuerpos), ordena por recepción y respeta los
  roles (un `viewer` lee pero no escribe; sin credencial, 403); límite de 64 KB y `Content-Type`
  JSON; los 7 perfiles por área (General, Escritor, Programador, Docente, Periodista, Jurídico,
  Diseño) con sus tipos y estados; validación de etiquetas y metadatos; el puente ignora
  `chatTarget` si llega (campo retirado); `notes.json` cifrado en reposo con AES-256-GCM y clave del
  AndroidKeyStore, con migración del texto plano y respaldo del archivo dañado; FLAG_SECURE en la
  pantalla de Notas (sin capturas ni miniaturas); la marca «Solo en el teléfono» implica que la nota
  no se envía nunca, no se serializa en el payload y queda fuera de «Enviar todas»; compartir una
  nota `localOnly` pide confirmación.
- **Retirada del modo anterior:** comprueba que la ruta `POST /dsh-companion/absorb-satellite` y el
  almacén `satellite_notes/` ya no existen, que no queda cliente ni pestaña del modo retirado, y que
  el teléfono **no guarda ninguna clave de API de DeepSeek**: no hay almacén, ni ajuste, ni tráfico a
  `api.deepseek.com`.
- Resistencia adversarial: bypass de la guarda de red por IP/CIDR, confusión de identidad
  loopback/proxy, robo de cookie, carrera entre revocación y petición en curso, DoS por rutas caras,
  filtrado de información en respuestas anónimas, comportamiento fail-open en errores.
- Cliente Android: endurecimiento del WebView (JavaScript, archivos locales, contenido mixto,
  depuración, popups), política de tráfico en claro, navegación y enlaces externos, manejo de errores
  TLS, Keystore, componentes exportados y surface de intents, notificaciones y aprobaciones con el
  teléfono bloqueado.
- Páginas offline y servicio estático: XSS, carga de recursos externos, CSP.

CÓMO VERIFICAR SIN SECRETOS
- Revisión estática del árbol publicado (git clone y leer), con referencias archivo:línea.
- Si tienes shell: arranca una instancia aislada con DSH_HOME y puertos temporales y verifica tus
  hipótesis con peticiones propias dentro de loopback. Documenta el comando exacto y la salida real.
- Si no puedes ejecutar nada, dilo y separa "verificado estáticamente" de "hipótesis no ejecutada".

ENTREGABLES
1. Tabla de hallazgos: id, severidad (crítica/alta/media/baja/informativa), categoría, archivo:línea,
   escenario de ataque concreto, impacto, recomendación de corrección, estado (verificado en código /
   ejecutado / hipótesis).
2. Lista de áreas revisadas sin hallazgos (para que se vea el alcance real, no solo lo malo).
3. Supuestos y limitaciones de la auditoría.
4. Veredicto en dos frases: ¿hay algo crítico o alto sin mitigar? ¿qué es lo primero que hay que
   arreglar? No escribas "seguro" ni "sin hallazgos" sin haber revisado la superficie completa.
```

## Prompt 2 — Onboarding desde cero en una máquina limpia

```text
Eres un evaluador de onboarding. Tu objetivo es comprobar si una persona puede instalar y verificar
DSH Mobile Companion en una máquina limpia siguiendo SOLO la documentación pública, y medir la
fricción real. Repositorio público: https://github.com/TintaYNodos/dsh-mobile-companion (rama main;
versión estable 5.2.9, versionCode 53).

CONTEXTO
- Producto: puente local en Node.js (cero dependencias) + cliente Android WebView + páginas offline.
  El teléfono entra por una red privada (ZeroTier, Tailscale u otra) a http://<IP-PRIVADA>:57420. El
  panel de aprobación es local: 127.0.0.1:57421. El puente NUNCA se expone a Internet.
- La instalación oficial es Windows (scripts .bat/.ps1) y también hay arranque para macOS/Linux. El
  diagnóstico oficial es doctor.ps1 y el informe se verifica con tools/verify-receipt.mjs.
- La documentación de referencia está en README.md, AI_SETUP_PROMPT.md, OPERACION.md,
  CHECKLIST-ESTABLE.md, VPN_OPTIONS.md y SECURITY.md.
- Licencia Business Source License 1.1.

ENTORNO RECOMENDADO
- Una máquina virtual Windows limpia (sin Node, sin Harness, sin tunnels) o una máquina Linux limpia
  para la parte del puente. Si no tienes ninguna, audita la documentación paso a paso y declara que
  no pudiste ejecutar.
- Teléfono Android con la app, o navegador del teléfono si no hay APK. La red privada entre PC y
  teléfono es obligatoria: sin ella el producto no puede funcionar.

REGLAS (obligatorias)
- No expongas el puente a Internet: nada de port forwarding, DNS público, túneles públicos ni
  DSH_ALLOW_PROXY_ACCESS=1 para "hacerlo funcionar".
- Si no hay red privada, PARA y reporta ese bloqueo como resultado, no como fracaso del producto.
- No uses datos reales ni cuentas de terceros. Si vas a arrancar el puente, usa DSH_HOME temporal y
  nunca el %USERPROFILE%\.dsh real del usuario.
- No copies ni pegues claves de acceso ni tokens en el informe: redáctalos como <CLAVE>.
- No instales RustDesk ni ninguna herramienta de terceros: es una recomendación opcional de soporte,
  no parte del producto.
- No borres datos de una instalación existente; la máquina debe ser tuya o desechable.

QUÉ HACER
1. Sigue la ruta documentada del usuario final (Método 1 o Método 2 de README.md) sin leer el código
   del repositorio para adivinar pasos. Si un paso no está documentado, anótalo como hueco.
2. Ejecuta el diagnóstico antes de arrancar (doctor.ps1 -Json -Report) y guarda su salida.
3. Instala y arranca con los scripts documentados; empareja el teléfono con panel.bat.
4. Verifica la salud (http://<IP-PRIVADA>:57420/healthz) y el recibo del informe
   (node tools/verify-receipt.mjs doctor-report.json).
5. Prueba una actualización del APK desde la página del puente y una notificación de prueba.
6. Por cada paso, cronometra y anota: comando, salida resumida, resultado (OK/bloqueo) y qué
   documentación lo indicaba.

ENTREGABLES
1. Bitácora numerada por paso: comando, salida/evidencia, resultado, tiempo aproximado.
2. Lista de bloqueos con su causa y gravedad, y el mensaje exacto del diagnóstico.
3. Errores o huecos de documentación, cada uno con cita archivo:línea y propuesta de corrección.
4. Evidencia final: JSON del doctor con recibo válido, respuesta de /healthz, versión instalada y
   estado del emparejamiento.
5. Veredicto: ¿puede una persona sin acceso al código dejarlo funcionando sin ayuda? ¿qué tres cosas
   hay que arreglar primero? No declares éxito sin la evidencia del punto 4.
```

## Prompt 3 — Auditoría estática del APK (permisos, componentes exportados, red y firma)

```text
Eres un auditor estático de aplicaciones Android. Audita el APK publicado de DSH Mobile Companion
(versión estable 5.2.9, versionCode 53), un cliente WebView ligero que se conecta a un puente local
dentro de una red privada. Repositorio público con el código fuente:
https://github.com/TintaYNodos/dsh-mobile-companion (rama main).

ARTEFACTO
- Descarga DSH-Companion.apk SOLO de la página oficial de Releases del repositorio
  (https://github.com/TintaYNodos/dsh-mobile-companion/releases). No uses copias de mensajería, foros
  ni espejos.
- Comprueba el SHA-256 del archivo descargado y compáralo con el que publica la release; anota ambos.
- Verifica la firma con apksigner verify --print-certs. La huella SHA-256 del certificado de release
  esperada es:
  4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23
  Si no coincide, es un hallazgo crítico: detente y repórtalo sin instalar el APK.

BASELINE ESPERADO (verifícalo contra el APK y contra android_src/AndroidManifest.xml del repo)
- Paquete: com.tintaynodos.dshcompanion; versionName 5.2.9; versionCode 53; minSdk 26; targetSdk 35.
- allowBackup="false". Sin bibliotecas de terceros: Java puro, sin AndroidX ni Kotlin; no debe
  empaquetar .so nativos ni SDKs de anuncios/analítica.
- Permisos declarados en el manifiesto del repo: INTERNET, ACCESS_NETWORK_STATE, RECORD_AUDIO,
  POST_NOTIFICATIONS, VIBRATE, REQUEST_INSTALL_PACKAGES, USE_BIOMETRIC, USE_FINGERPRINT,
  FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
  RECEIVE_BOOT_COMPLETED. Cualquier permiso extra es una desviación que hay que explicar.
- Componentes: MainActivity exportada (MAIN/LAUNCHER y SEND text/plain); servicio de eventos
  exportado=false; receptor de arranque exportado=false; widget exportado=true (requisito de
  AppWidgetProvider, riesgo aceptado y documentado); FileProvider exportado=false con
  grantUriPermissions.
- Red: networkSecurityConfig presente y tráfico en claro limitado a la red privada/loopback; no debe
  haber destinos públicos más allá de las actualizaciones del APK (desde el puente o GitHub); sin
  contenido mixto ni archivos locales en el WebView.
- **Retirada del modo anterior:** el APK no debe contener clases, recursos ni preferencias del modo
  retirado ni ninguna clave de API de terceros. La búsqueda de `absorb-satellite` y de
  `api.deepseek.com` en el APK y en `android_src/` debe salir vacía, y no debe quedar ningún almacén
  de claves que no sea el de las claves de acceso a los equipos.
- **Notas locales:** `notes.json` dentro del directorio privado de la app debe estar cifrado en
  reposo (AES-256-GCM con clave del AndroidKeyStore) y no debe leerse como JSON plano; la pantalla
  de Notas debe aplicar FLAG_SECURE; no debe haber tráfico de notas a Internet ni almacén de claves
  de API.

REGLAS (obligatorias)
- Solo análisis estático y local del APK y del código. No instales el APK en un dispositivo ajeno ni
  lo subas a servicios externos de análisis.
- No necesitas secretos: no pidas claves, tokens ni credenciales de ningún usuario.
- No uses herramientas de pago ni parchees el APK. Si desensamblas, hazlo sobre una copia.

QUÉ REVISAR
1. Manifiesto empaquetado (aapt2 dump xmltree / apkanalyzer): componentes, exported, intent-filters,
   permisos, uses-sdk, allowBackup, atributos de debug.
2. Permisos frente a su uso real en el código fuente; permisos peligrosos y su justificación.
3. Firma: esquema (v1/v2/v3), certificado, huella, consistencia con la release publicada.
4. Contenido: lista de archivos, classes.dex, recursos, assets, librerías nativas, certificados
   incluidos, metadatos y cualquier rastro de terceros.
5. Configuración de red: network security config, tráfico en claro, hosts de confianza.
6. Superficie del WebView y endurecimiento observable en el bytecode (archivos locales, JavaScript,
   depuración remota, contenido mixto, navegación externa).
7. Evidencia de la política de almacenamiento de credenciales (Keystore) y de la actualización del
   APK.
8. Notas locales: cifrado en reposo de `notes.json`, migración desde texto plano, FLAG_SECURE en la
   actividad de Notas, ausencia de salidas a Internet y ausencia del campo retirado `chatTarget` en
   el payload de envío.

ENTREGABLES
1. Tabla de componentes: nombre, exported, intent-filters, propósito declarado, riesgo.
2. Tabla de permisos: permiso, protección, uso esperado, justificación, desviación.
3. Firma y hashes: SHA-256 del APK, huella del certificado, esquemas de firma, coincidencia con la
   release.
4. Inventario de contenido y terceros.
5. Desviaciones respecto al baseline con severidad y recomendación.
6. Veredicto: ¿el APK es el que corresponde al código publicado y a la firma oficial? ¿hay algo que
   impida instalarlo con confianza? Si no puedes verificar un punto, dilo en vez de suponerlo.
```

## Cómo leer los informes que devuelvan

Un informe útil separa **lo verificado** de **lo supuesto** y cita `archivo:línea` o el comando con
su salida. Si un prompt devuelve "todo correcto" sin alcance ni evidencia, no vale: vuelve a pedirlo
con el entregable y la evidencia exigidos. Los hallazgos de seguridad de esta ronda se cierran en el
repositorio público; las vulnerabilidades no se discuten en un issue público, sino según
[SECURITY.md](SECURITY.md).

Documentos relacionados: [SECURITY.md](SECURITY.md), [AUDIT_CLOSURE.md](AUDIT_CLOSURE.md),
[OPERACION.md](OPERACION.md), [SUPPORT.md](SUPPORT.md).
