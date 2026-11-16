# DSH Mobile Companion 5.1.9 (versionCode 49) — base de la serie 5

Esta es la **base congelada** de la serie 5. A partir de aquí el proyecto avanza con mejoras
menores y publicaciones **pre-release** (5.2.x), sin tocar esta línea.

## La serie 5, de un vistazo

### 5.0.0 — cambio de modelo (incompatible con 4.x)
- Identidad del dispositivo por **cookie de sesión**, no por IP.
- El **kill switch rota la clave de acceso**.
- Panel con **boleto de un solo uso** + cookie `HttpOnly`.
- `/dsh-companion/action` responde **501**: no se finge aprobar herramientas.
- Caducidad de 30 días aplicada en el servidor; `DSH_ACCESS_DISABLE=1` exige loopback.

### 5.1.0 — cierre de los 56 hallazgos del informe
- **JS bridge blindado por nonce** (`BridgeGuard`): un iframe ya no puede gastar la clave de API.
- Verificación **SHA-256** del APK contra el digest de GitHub.
- Panel con validación de `Host`; descubrimiento validado contra el JSON del puente.
- Proxy con lista de métodos y tope de subida; `CleartextPolicy` fail-closed.
- `pendingList` solo para el panel; la VPN corporativa ya no se toma por defecto.
- Sync con Markdown fiel y retención; telemetría perezosa (16 ms de arranque).
- Notificaciones honestas y una sola por turno.

### 5.1.1 — residuales
- Terminal remota **eliminada**; modo satélite documentado y avisado.
- CSP y cabeceras de seguridad en páginas propias.

### 5.1.2 — corrección del panel
- El panel no se llena de solicitudes duplicadas: se reutiliza la del mismo equipo.

### 5.1.3 — auditoría final de publicación
- Cinco README recuperan la sección de compilación y la cola del árbol.
- `SECURITY.md`, `AI_SETUP_PROMPT.md` y `docker-compose.yml` dejan de mencionar la terminal.
- Tabla de variables completa, rutas y módulos completos, cifra de pruebas honesta (231).
- `panel.bat` respeta `DSH_PANEL_PORT`; `.lnk` de autoarranque con comillas correctas.
- Docker copia los assets del manifest y el healthcheck usa el puerto efectivo.

### 5.1.4 — disponibilidad y avisos
- **Se reenlaza solo** cuando el túnel aparece o cambia de IP.
- **Supervisor de arranque**: si el puente cae, se vuelve a levantar; `stop.bat` deja
  `companion.stop` para que no lo resucite al detenerlo.
- **Excepciones no controladas** se registran y el supervisor recupera el proceso.
- **Límite de intentos de clave** por IP sin calcular el HMAC tras el umbral.
- **Exención de batería** en Ajustes del teléfono para que no maten el servicio de avisos.

### 5.1.5 — ingeniería cerrada
- **La suite corre en CI**: 9 suites · 151 comprobaciones en cada push, en un puente
  aislado con `DSH_HOME` temporal y un doble de Harness.
- **Rotación de `bridge.log` en caliente** (`DSH_LOG_MAX_MB` 5, `DSH_LOG_KEEP` 3).

### 5.1.6 — actualización desde la PC arreglada
- **La actualización desde la PC instalaba el APK equivocado**: el puente servía la copia de la
  raíz (atrasada) mientras `/status` anunciaba la versión compilada. Ahora sirve su propio APK.
- **SHA-256 del APK en `/status`** y verificación en el teléfono.
- **GitHub como vía sin túnel**: se fuerza la consulta si el puente no responde.

### 5.1.7 — firma de release
- **El APK se firma con un keystore de release** (RSA 4096, 30 años). Certificado SHA-256:
  `4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23`.

### 5.1.8 — roles, multi-instancia, watchdog y VPN
- **Roles por dispositivo** (`full`/`viewer`), **multi-instancia** por `targetPort`, **watchdog**
  de avisos y **VPN ampliada** (NetBird, Nebula, EasyTier, Tinc, SoftEther, Twingate, Headscale).
- Auditoría externa: **P1** (nonce), **P3** (notificación muerta), **P36** (`CleartextPolicy`).

### 5.1.9 — watchdog configurable y arranque
- **Watchdog configurable**: silencio 1/3/5 min, reintentos 1/2/3, aviso on/off y "Probar ahora".
- **Arranque tras reiniciar el teléfono** (BootReceiver, solo si avisos y watchdog están activos).
- **P1 completo**: nonce en los 23 métodos del puente JS.
- **P22**: descubrimiento con identidad de DSH confirmada, no "algo responde".
- **P2**: respaldo con fsync del registro en la prueba (restaura si quedó a medias).
- **`AUDIT_CLOSURE.md`**: estado final de los 56 puntos del informe externo.

## ⚠️ Antes de instalar

**Actualiza el APK y el puente juntos.** Esta versión cambia el contrato del puente JS (23
métodos piden nonce) y el arranque del servicio: un APK 5.1.9 con un puente anterior puede perder
borradores y latido. Actualiza los dos a la vez.

Si vienes de una 5.1.7 o anterior, la firma ya es la de release: desinstala una vez solo si vienes
de antes de la 5.1.7. Desde la 5.1.7 se instala encima.

## Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 49` / `versionName 5.1.9` |
| Tamaño | 227 336 bytes (222 KB) |
| SHA-256 | `bd3e733fee7932aab345474ba07f12d855f6bb66c6b01138eb5d20ea3f4aeff7` |
| Firma | APK Signature Scheme v2 + v3, certificado de release RSA 4096 |
| Requisitos | Android 8.0 (SDK 26) o superior |

Comprobado en la corrida previa al empaquetado: **231/231** comprobaciones en 14 suites
(201 en CI), auditoría del repositorio sin hallazgos, un solo aviso por turno, `pendingList` fuera del
`/status` anónimo y las tres sondas de la pantalla de espera creando **una** solicitud.

## Política de esta línea

- **La serie 5 se cierra con la 5.1.10** (notas en [RELEASE_5.1.10.md](RELEASE_5.1.10.md)), que
  aplica las correcciones del QA final sobre esta base. Esta 5.1.9 no es la versión final.
- Lo siguiente sale como **pre-release** (5.2.0-pre.1...) hasta estabilizarse.
- La rama `stable/5` conserva exactamente este árbol.

## Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo.
2. En la computadora: `install-autostart.bat` (registra el arranque **y** levanta el puente).
3. En el teléfono: abre `http://<IP-PRIVADA>:57420` y aprueba el dispositivo desde `panel.bat`.
4. Avisos de la PC: Ajustes → *Notificaciones de la PC* → *Probar desde la PC*.
