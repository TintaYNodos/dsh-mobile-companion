# DSH Mobile Companion 5.1.5 (versionCode 45) — base estable de la serie 5

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
- Tabla de variables completa, rutas y módulos completos, cifra de pruebas honesta (154).
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
- **La suite corre en CI**: job aislado con `DSH_HOME` temporal y un doble de Harness;
  **9 suites · 151 comprobaciones** en cada push, sin tocar el equipo del usuario.
- **Rotación de `bridge.log` en caliente** por tamaño (`DSH_LOG_MAX_MB`, 5 MB) con
  `DSH_LOG_KEEP` (3) archivos, sin perder ni duplicar líneas en Windows.
- Prueba nueva de rotación: **27/27**.

## Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 45` / `versionName 5.1.5` |
| Tamaño | 215 048 bytes (210 KB) |
| SHA-256 | `2b3928fd8fb62f0f66be1393e1c033e6e8b1b19c742161f16e8889b948aefe36` |
| Firma | APK Signature Scheme v2 + v3 |
| Requisitos | Android 8.0 (SDK 26) o superior |

Comprobado en la corrida previa al empaquetado: **154/154** comprobaciones en 11 suites,
auditoría del repositorio sin hallazgos, un solo aviso por turno, `pendingList` fuera del
`/status` anónimo y las tres sondas de la pantalla de espera creando **una** solicitud.

## Política de esta línea

- **5.1.5 queda congelada.** Solo un fallo de seguridad crítico produciría una 5.1.6.
- Lo siguiente sale como **pre-release** (5.2.0-pre.1...) hasta estabilizarse.
- La rama `stable/5` conserva exactamente este árbol.

## Cómo usarla

1. Descarga `DSH-Companion.apk` de este release e instálalo.
2. En la computadora: `install-autostart.bat` (registra el arranque **y** levanta el puente).
3. En el teléfono: abre `http://<IP-PRIVADA>:57420` y aprueba el dispositivo desde `panel.bat`.
4. Avisos de la PC: Ajustes → *Notificaciones de la PC* → *Probar desde la PC*.
