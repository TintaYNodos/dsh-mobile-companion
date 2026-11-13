# DSH Mobile Companion

> 🌐 **Idiomas / Languages:** [English](README.md) · **[Español (México)](README.es.md)** · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

Acceso móvil a DeepSeek Harness a través de una red privada ZeroTier o Tailscale, sin abrir puertos y sin romper el prompt caching.

La aplicación móvil no reimplementa la interfaz: muestra la propia Web GUI de DeepSeek Harness y le aplica un ajuste táctil. Lo que ves en el teléfono es el mismo producto que corre en la computadora.

Edición endurecida por Ismael Muñoz Reyes para Tinta y Nodos.

---

## Qué resuelve

DeepSeek Harness escucha en `127.0.0.1` y protege sus sesiones con una cookie HMAC derivada de `.credentials.yaml`. Por eso no basta con abrir el puerto ni con un túnel genérico: sin esa cookie la interfaz responde 401 y, si se reescribe el origen de la petición de forma descuidada, se pierde el prefijo estable que sostiene el prompt caching.

Este proyecto resuelve las tres cosas a la vez:

- **Firma de sesión transparente.** El puente lee el secreto local, genera la cookie HMAC-SHA256 (versión 1) y la renueva antes de que venza. El navegador móvil nunca ve el secreto.
- **Ajuste táctil sobre el producto real.** Se inyectan metadatos de viewport y una hoja de estilos mínima. No se sustituye la interfaz ni se inyecta JavaScript en el documento.
- **Cierre de red.** El socket se enlaza únicamente a la interfaz de la VPN y solo acepta clientes de esa misma red privada.

---

## Arquitectura

```text
Teléfono (red ZeroTier / Tailscale)
        |
        v
bridge.mjs  —enlace exclusivo a la IP de la VPN—
   |-- /                      proxy a DeepSeek Harness + ajuste móvil
   |-- /offline               página de espera cuando Harness aún no responde
   |-- /dsh-companion/status  descubrimiento y salud del enlace
   |-- /dsh-companion/sync    volcado de conversaciones a disco
        |
        v
127.0.0.1:52710  DeepSeek Harness
```

Módulos:

```text
companion/
├── bridge.mjs              arranque, enrutado, políticas de socket y de acceso
├── offline.html            pantalla de espera con la estética del producto
├── manifest.webmanifest    instalación como aplicación web
├── icon.svg
├── android_src/
│   └── MainActivity.java   cliente nativo: WebView endurecido, píldora, reconexión
├── test/
│   ├── verify_bridge.mjs      rutas, inyección, origen, framing, límites
│   ├── verify_sync_ws.mjs     neutralización de contenido y handshake WebSocket
│   └── verify_access_key.mjs  control de acceso con clave compartida
├── src/
│   ├── config.mjs          configuración y límites en un solo lugar
│   ├── log.mjs             bitácora con marca de tiempo
│   ├── network.mjs         descubrimiento de VPN, autorización, puerto de Harness
│   ├── crypto.mjs          secreto, cookie HMAC v1, clave de acceso, comparación constante
│   ├── http.mjs            saneamiento de cabeceras, cuerpo acotado, origen confiable
│   ├── proxy.mjs           proxy HTTP y túnel WebSocket
│   ├── mobile.mjs          inyección de viewport y ajustes táctiles
│   ├── sync.mjs            persistencia atómica de conversaciones
│   ├── static.mjs          activos locales con ETag
│   └── ratelimit.mjs       cubo de fichas por cliente
└── synced_chats/           conversaciones volcadas (.md y .json)
```

---

## Instalación

### Método 1: Automatizado con tu Asistente de IA (Recomendado)

Si cuentas con un asistente o agente de IA en tu computadora (DeepSeek Harness, Cursor, Claude Code, Copilot, etc.), copia y pega el siguiente prompt en el chat. La IA se encargará de clonar, activar en segundo plano, verificar el estado y darte las instrucciones directas para tu celular:

> Guía detallada: [INSTALACION_CON_IA.md](INSTALACION_CON_IA.md)

```text
Actúa como especialista de configuración técnica en este equipo.
Tu misión es instalar, activar, verificar y dejar completamente configurado el sistema "DSH Mobile Companion" (puente seguro de acceso móvil para DeepSeek Harness a través de red privada ZeroTier o Tailscale), y entregarme al final las instrucciones sencillas para conectar mi teléfono móvil.

Sigue estos pasos de forma ordenada y autónoma:
1. Revisa "%USERPROFILE%\.dsh" y ubica el motor de Node.js (en PATH o en "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe").
2. Si no estás en la carpeta del proyecto, clona: git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
3. Configura el arranque automático con "install-autostart.bat" e inicia el servicio en segundo plano con "run-hidden.vbs".
4. Consulta http://127.0.0.1:57420/dsh-companion/status para verificar que el servicio responda 200 y reportar el estado de DSH.
5. Entrégame un resumen claro sin tecnicismos con: la URL para mi teléfono (http://<IP_VPN>:57420), el enlace de descarga del APK en GitHub Releases y cómo autorizar mi dispositivo en http://127.0.0.1:57420/pair.
```

### Método 2: Instalación Manual

#### Computadora

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

1. Define una clave de acceso (muy recomendado, ver más abajo).
2. Instala el arranque automático con `install-autostart.bat` (registra una tarea silenciosa al iniciar Windows).
3. El puente detecta por sí mismo la interfaz de ZeroTier o Tailscale y se enlaza a ella. Si la detección falla, define `DSH_BIND_HOST` con la IP privada.

### Teléfono

Dos formas equivalentes:

- **Aplicación nativa:** instala `DSH-Companion.apk` desde la sección de *Releases*. Aporta reconexión automática, selector de búnker y pantalla completa. Pesa 140 KB y no incluye ninguna biblioteca de terceros: solo el cliente, su icono y su tema.
- **Sin instalar nada:** abre `http://<IP_VPN>:57420` en el navegador y usa "Agregar a la pantalla principal".

`/m` responde con una redirección permanente a `/`: el modo satélite anterior se retiró en favor de la interfaz real.

---

## Variables de entorno

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `DSH_BIND_HOST` | autodetectado | Fuerza la IP privada de enlace |
| `DSH_TARGET_PORT` | `52710` | Puerto de DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Puerto del puente |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Carpeta de credenciales y de la clave |
| `DSH_BROWSER_SECRET` | — | Secreto directo, evita leer el YAML |
| `DSH_ACCESS_KEY` | autogenerada | Clave compartida; sobrescribe la del archivo |
| `DSH_ACCESS_DISABLE` | — | `1` desactiva la clave (solo con enlace loopback) |
| `DSH_COMPANION_TOKEN` | vacío | Token adicional para `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | vacío | Subredes adicionales autorizadas, separadas por coma |

### Se aprueba desde la computadora, una sola vez

No se escribe ninguna clave.

1. Abres la app en el teléfono. Muestra "Confirma en la computadora".
2. En la PC abres `http://<IP_VPN>:57420/pair`.
3. Aparece el dispositivo con su dirección. Pulsas **Autorizar**.
4. El teléfono entra solo y no vuelve a preguntar.

La sesión dura **30 días y se renueva con el uso**: cada vez que abres la app tras
24 horas, el contador vuelve a 30. Si la usas al menos una vez al mes, no caduca nunca.

El panel escucha **solo en 127.0.0.1** y exige su propia credencial, así que no es
alcanzable desde la VPN ni desde otra máquina. Muestra los dispositivos autorizados
con un botón para revocar cada uno.

Los dispositivos viven en `%USERPROFILE%\.dsh\companion-devices.json`. Hay un botón
**Revocar todos** en el panel. Detalles en [DISPOSITIVOS.md](DISPOSITIVOS.md).

La clave manual sigue existiendo como respaldo para entrar desde un navegador,
en `%USERPROFILE%\.dsh\companion-access-key`. La app no la necesita.

**Limitación real:** HTTP Basic envía la clave en Base64, sin cifrar. Es aceptable
solo porque ZeroTier y Tailscale cifran el transporte. En una red ZeroTier
compartida o pública, un miembro hostil puede intentar interceptar en capa 2; la
defensa correcta es mantener la red privada con autorización manual.


---

## Rutas

- `GET /` — Web GUI de DeepSeek Harness, con ajuste móvil aplicado cuando el cliente es un teléfono.
- `GET /offline` — página de espera mientras Harness arranca, con Lector Editorial Offline de sesiones precargadas.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`.
- `POST /dsh-companion/sync` — guarda una conversación en `synced_chats/` en formatos Markdown y JSON.
- `GET /dsh-companion/chats` — lista cronológica de sesiones sincronizadas para lectura offline.
- `GET /dsh-companion/chat/:id` — entrega el contenido de una sesión (JSON estructurado o Markdown con `?format=md`).
- `POST /dsh-companion/action` — resolución remota de autorizaciones de herramientas y permisos sandbox en segundo plano.
- `GET /companion.webmanifest` — manifiesto de instalación PWA.

---

## Modelo de seguridad

**Acceso**

- Clave compartida obligatoria por HTTP Basic en todas las rutas, incluido el descubrimiento; comparada en tiempo constante y con límite de intentos por IP.
- Autorización de cliente cerrada: bucle local, la subred de la interfaz de enlace **con su máscara real**, o los CIDR declarados.
- El `Host` debe coincidir con el del puente: corta el DNS rebinding.
- Se rechazan `Origin: null`, el origen vacío y `Sec-Fetch-Site` distinto de `same-origin`/`none`.
- Se rechazan peticiones con `Content-Length` y `Transfer-Encoding` simultáneos (contrabando de peticiones).
- La clave de acceso y el token del cliente no se reenvían al backend: se eliminan antes del proxy.
- Túnel WebSocket con el mismo criterio de origen, saneamiento CRLF y cierre ordenado.

**Credenciales**

- El secreto de sesión se lee una vez, no se registra en la bitácora y nunca viaja al cliente. Al arrancar se valida: si falta, el proceso falla en vez de dejar cada petición esperando.
- Cookie HMAC-SHA256 versión 1, idéntica a la que emite DeepSeek Harness, con 12 horas de vigencia y renovación anticipada.
- Si el backend responde 401, el puente recarga el secreto y reintenta una vez: sobrevive a la rotación de `.credentials.yaml` sin reiniciar.

**Datos y almacenamiento**

- Las conversaciones sincronizadas se escriben de forma atómica, con nombres derivados de un identificador controlado y verificación estricta de confinamiento de ruta contra traversal.
- Todo el contenido se escapa antes de serializarse: no se propaga HTML ejecutable a los archivos ni al índice.
- Límites explícitos de tamaño de cuerpo, número de mensajes y longitud por mensaje.
- El rate limit tiene tope de memoria: no se puede inflar con claves únicas.

**Aplicación nativa (Android)**

- `DSH-Companion.apk` — versión 4.4.0, `versionCode` 21, `minSdk` 26, `targetSdk` 35.
- Pesa menos de 240 KB, sin AndroidX ni Kotlin: el `classes.dex` es código Java puro y reproducible.
- **Soporte Multi-PC Dinámico:** Permite agregar y conmutar cualquier cantidad de computadoras con selector inteligente y eliminación segura.
- **Acciones en notificaciones en segundo plano:** Permite autorizar o denegar herramientas y permisos `danger-full-access` directamente desde la barra de notificaciones sin abrir la ventana de la app.
- **Lector editorial offline:** Permite leer sesiones sincronizadas en el teléfono con tipografía literaria optimizada para capítulos y narrativa, incluso con la computadora apagada.
- **Diseño sobrio de ingeniería:** Interfaz libre de emojis infantiles, con jerarquía visual de consola y paleta oscura oficial DeepSeek / GitHub Dark.
- Acceso a archivos locales deshabilitado, contenido mixto bloqueado, ventanas emergentes y depuración remota desactivadas.
- El micrófono solo se concede al origen exacto del búnker (esquema, host y puerto); cualquier otro origen se deniega.
- Navegación restringida al origen del búnker; los enlaces externos se abren con el selector nativo del sistema.
- Errores TLS cancelados sin excepción.
- Los abortos de navegación (`ERR_ABORTED`) no se confunden con caídas de red: no hay bucles de recarga.
- Los reintentos se detienen en segundo plano y se limitan con retroceso y jitter.

## Pruebas

```bash
node test/verify_bridge.mjs
node test/verify_sync_ws.mjs
node test/verify_access_key.mjs   # requiere DSH_ACCESS_KEY definida al arrancar
```

Cubren descubrimiento, inyección móvil, respeto de `?dshc=off`, rechazo de origen cruzado, contrabando de peticiones, límites de cuerpo, neutralización de contenido, handshake WebSocket y control de acceso.

---

## Límites honestos

Este diseño está pensado para **uso personal**: una persona, sus equipos, su red privada. No es un servicio multiusuario.

- El puente da acceso completo a la sesión de DeepSeek Harness de la cuenta de Windows que lo ejecuta. No hay separación por usuario ni por dispositivo.
- Dos teléfonos del mismo usuario comparten la misma sesión, pero cada uno se autoriza y se revoca por separado desde el panel.
- No hay cuentas ni roles: quien tiene un dispositivo autorizado es el dueño.
- El panel de autorización registra la actividad reciente, pero no es una auditoría: se limpia con un botón.
- Una red ZeroTier pública o compartida anula la barrera de red. Mantenla privada con autorización manual en my.zerotier.com.
- Un administrador local de la computadora puede leer las credenciales y los chats. Es el modelo de Windows, no un defecto del puente.
- Los chats sincronizados se guardan en claro dentro de `synced_chats/`. En Windows el modo `0600` no implica una ACL estricta: la protección real es la ACL del perfil de usuario. Cifra el disco si el equipo es compartido.
- El tráfico es HTTP sobre la VPN. Es correcto porque ZeroTier y Tailscale cifran el transporte de extremo a extremo; no lo expongas fuera de la VPN.
- La autorización de red se basa en la dirección de origen. No resiste a un atacante que ya controla un equipo de esa red: para ese caso está `DSH_ACCESS_KEY`.

---

---

## Aviso de proyecto comunitario

> **Aviso:** DSH Mobile Companion es un cliente móvil complementario de código abierto desarrollado por la comunidad para facilitar el acceso remoto seguro a DeepSeek Harness a través de redes privadas (ZeroTier / Tailscale). No es un producto oficial de DeepSeek ni está afiliado, patrocinado o respaldado por DeepSeek. Todos los nombres de marcas y logotipos de referencia pertenecen a sus respectivos propietarios.

## Licencia

BSL 1.1 / PolyForm Noncommercial 1.0.0. Libre para uso individual, educativo y no comercial. Prohibida la redistribución y explotación comercial sin autorización expresa.
Autoría y titularidad de derechos: Ismael Muñoz Reyes · Tinta y Nodos. Ver [LICENSE](LICENSE).
