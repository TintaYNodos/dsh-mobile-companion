# DSH Mobile Companion 5.1.0 (versionCode 40)

La serie **5 queda completa**: cierra los puntos del informe de revisión de 56 hallazgos.
Sigue siendo una versión mayor porque mantiene los cambios incompatibles de la 5.0.0.

## Seguridad

- **El JS bridge ya no es invocable desde cualquier frame.** `BridgeGuard` rota un nonce por página (128 bits, comparación en tiempo constante) y lo inyecta como `window.__DSH_BRIDGE_TOKEN__`. `installUpdate`, `confirmCriticalApproval` y `startSatelliteQuery` exigen el nonce **y** que la llamada venga del frame principal del búnker: un iframe cross-origin ya no puede gastar la clave de API ni lanzar una instalación.
- Los redirects a orígenes externos se cortan en `onPageStarted`.
- Los extras de la actividad exportada (`trigger_update`, `shortcut_action`) exigen un token privado firmado; `ACTION_SEND` sigue igual.
- El APK se verifica contra el `digest` SHA-256 que publica GitHub antes de instalar (la descarga del búnker no tiene ancla y se mantiene como antes).
- `FLAG_SECURE` opcional en Ajustes, activo por defecto cuando el bloqueo biométrico está encendido.
- Al borrar una PC se expiran sus cookies y se limpian sus credenciales HTTP.
- El canje de dispositivo ya no depende de la IP: cookie de canje de un solo uso (15 min).
- Proxy con lista cerrada de métodos y tope de subida de 256 MB.
- `CleartextPolicy` fail-closed e incluye CGNAT `100.64/10`.
- CSP y cabeceras de seguridad en las páginas propias.

## Puente y red

- El descubrimiento valida el JSON del puente (`service: "dsh-companion"`) antes de auto-conectar.
- Descubrimiento de puerto de Harness también en Linux y macOS, sin bloquear el bucle de eventos.
- `DSH_ALLOWED_HOSTS` para Tailscale MagicDNS.
- El panel valida la cabecera `Host` (403 si no coincide).
- `/status` anónimo reutiliza la solicitud pendiente y abre el panel una sola vez por IP.
- `DSH_ACCESS_DISABLE` se valida al arrancar con un mensaje claro y refresca `lastSeen`.
- Docker: sin `~`, `DSH_HOME` obligatorio y healthcheck real. Node ≥ 22.15 (zstd nativo).

## Sincronización y avisos

- El Markdown se guarda **fiel**: solo se neutralizan `<` y `&`, sin barras invertidas ni doble escapado.
- Retención configurable de `synced_chats/` (`DSH_SYNC_MAX_FILES`, `DSH_SYNC_MAX_TOTAL_MB`).
- La telemetría ya no lanza PowerShell al importar: el arranque baja de 1 232 ms a 16 ms.
- El SSE de turnos ya no difunde nombres de espacio ni sesión.
- Frames zstd partidos sin atascos ni fugas, con topes de memoria.
- Un solo planificador periódico en el cliente inyectado (antes cuatro timers solapados).
- Interruptor en Ajustes para la copia del chat en `localStorage`.

## Notificaciones

- Dejan de ofrecer aprobar/rechazar: el puente no puede resolverlo y el aviso indica dónde aprobar.
- La suite ya no borra el registro real de dispositivos (antes un `npm test` desemparejaba los teléfonos).

## Pruebas y proyecto

- **11 suites, 155 comprobaciones**, incluida una nueva de guardas de configuración.
- CI en Node 22: sintaxis, auditoría del árbol y guardas de configuración.
- `.editorconfig`, plantilla de PR y de incidencia.
- Auditoría del repositorio **sin hallazgos** sobre 186 archivos; ningún archivo de código por encima de 400 líneas (116 archivos).

## Verificación de este binario

| Parámetro | Valor |
| --- | --- |
| Archivo | `DSH-Companion.apk` |
| Versión | `versionCode 40` / `versionName 5.1.0` |
| Tamaño | 215 048 bytes (210 KB) |
| SHA-256 | `ffb296e7977a107e07f6b6258cbc10651b35e72bddb8a261e343aee4e5f05681` |
| Firma | APK Signature Scheme v2 + v3, certificado de depuración |
| Requisitos | Android 8.0 (SDK 26) o superior |

Se instala encima de cualquier 5.0.x: la firma no cambia.
