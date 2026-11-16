# DSH Mobile Companion 5.1.10 (versionCode 50) — versión final de la serie 5

Esta es la **versión final** de la serie 5. Sustituye a la 5.1.9, que llegó al QA con defectos:
esta build incorpora las diez correcciones del informe de calidad y deja la rama `stable/5` en su
estado definitivo. Tres de ellas (**D1**, **H1** y **H2**) justifican por sí solas el relanzamiento:
rompían la actualización desde la PC y abrían dos vías de privilegio.

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

### 5.1.10 — correcciones del QA final

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

## ⚠️ Antes de instalar

**Actualiza el APK y el puente juntos.** La 5.1.10 mantiene el contrato del puente JS de la 5.1.9
(23 métodos piden nonce) y el arranque del servicio: un APK 5.1.10 con un puente anterior puede
perder borradores y latido. Actualiza los dos a la vez.

La firma de release es la definitiva **desde la 5.1.7**. Si vienes de una versión anterior a esa,
desinstala una vez; desde la 5.1.7 se instala encima sin problema.

## Verificación de este binario

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

## Política de esta línea

- **La serie 5 queda cerrada con la 5.1.10.** Solo un fallo de seguridad crítico produciría una 5.1.11.
- Lo siguiente sale como **pre-release** (5.2.0-pre.1...) hasta estabilizarse.
- La rama `stable/5` conserva exactamente este árbol.

## Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo.
2. En la computadora: `install-autostart.bat` (registra el arranque **y** levanta el puente).
3. En el teléfono: abre `http://<IP-PRIVADA>:57420` y aprueba el dispositivo desde `panel.bat`.
4. Avisos de la PC: Ajustes → *Notificaciones de la PC* → *Probar desde la PC*.
