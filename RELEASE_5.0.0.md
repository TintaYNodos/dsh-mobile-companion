# DSH Mobile Companion 5.0.0 (versionCode 38)

Versión **mayor**: cambia el modelo de confianza, así que no es compatible hacia atrás con la 4.x.
Si el kill switch rotó la clave en tu instalación, vuelve a emparejar el teléfono.

## Qué rompe respecto a la 4.x

- **La identidad del dispositivo es la cookie de sesión, no la IP de origen.** Un equipo que hereda una dirección de la VPN ya no hereda la sesión.
- **El kill switch rota la clave de acceso**, además de revocar dispositivos: lo emparejado deja de servir hasta aprobarse otra vez.
- **La terminal remota está apagada por defecto** (`DSH_ENABLE_TERMINAL=1` para activarla) y, aun activada, solo atiende desde loopback.
- **El panel ya no usa un token maestro**: la entrada es un boleto de un solo uso que se canjea por una cookie `HttpOnly`. Los enlaces `?t=` guardados dejan de funcionar y ya no existe `companion-panel-url.txt`.
- **`/dsh-companion/action` responde 501** para aprobaciones de herramientas: el puente ya no finge resolverlas. La aprobación de *dispositivos* solo se hace desde el equipo del host.
- **La caducidad de 30 días se aplica en el servidor**: los dispositivos sin uso se rechazan y se eliminan del registro.
- **`DSH_ACCESS_DISABLE=1` exige loopback** para arrancar.

## Notificaciones

- Aviso de **respuesta terminada** cuando un turno finaliza en la computadora, **con la app cerrada**. El puente lo detecta en el registro de sesión (`turn/end`), así que llega **una sola vez por respuesta** aunque el modelo o una herramienta hagan pausas largas.
- El servicio en primer plano resuelve la clave del equipo activo y envía la cookie del dispositivo (antes pedía una clave que nadie escribía y el puente respondía 403 en un bucle silencioso).
- Canales separados (respuestas de la PC, servicio, críticos), creados al arrancar el servicio.
- Aprobaciones ocultas en la pantalla de bloqueo y rechazadas con el teléfono bloqueado.

## Seguridad

- Claves guardadas en Android **cifradas con AES-256-GCM en el Android Keystore**, con migración automática de los valores en claro.
- **`CleartextPolicy`**: el cliente rechaza cualquier petición que no sea HTTPS o dirigida al búnker configurado o a una dirección privada. Fuera `usesCleartextTraffic` y TLS forzado a los servicios públicos.
- El `/status` anónimo devuelve un payload mínimo y ya no calcula telemetría: cierra un vector de CPU no autenticado.
- La clave de acceso ya no se escribe completa en el log.
- Apertura de panel, `retry`, `pair-events` y terminal endurecidos; terminal y panel solo por loopback.

## Mantenimiento

- **Todos los archivos de código por debajo de 400 líneas**, con control automático en `tools/audit-repo.mjs` y en la CI.
- Cliente Android dividido en clases con una responsabilidad; cliente inyectado en módulos; página offline y simulador en HTML + CSS + JS.
- Ayudantes duplicados unificados y mojibake reparado en los módulos publicados.
- `build-apk.ps1` para construir y firmar el APK sin Gradle ni Android Studio.
- `RELEASING.md` con el checklist de publicación y `.github/workflows/verify.yml`.

## Verificación

- Suite: **136/136** comprobaciones (10 archivos).
- Auditoría del árbol publicado: **sin hallazgos** (texto, sintaxis, enlaces, versiones, secretos, IPs privadas, licencia y límite de líneas).
- `javac` desde un clon limpio: **63 clases**, exit 0.

## Instalación

Descarga `DSH-Companion.apk` (210 952 bytes, `minSdk` 26). Se instala encima de la versión anterior: la firma no cambia.

**SHA-256:** `a0f48b49251c3f72fe059175065b9d9fed11db01b491e1c2d6e07d7b6fc6b511`
