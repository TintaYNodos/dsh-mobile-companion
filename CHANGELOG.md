# Changelog

All notable changes to DSH Mobile Companion. The project follows `MAJOR.MINOR.PATCH` and the
Android `versionCode` increments once per published build.

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

## 4.5.4 — `versionCode` 31

- Kill switch reports the real result of the revoke request instead of claiming success.
- Notification channels split by purpose (approvals, tasks, connection, PC responses, service,
  critical).
- QR pairing fallback rewritten: offers the last known address, "use this address" and network scan.

## 4.4.1 — `versionCode` 22

- First public release: bridge, touch layer, APK, seven READMEs, installers for Windows, macOS and
  Linux, Docker files.
