# Cierre de la auditoría externa — serie 5

**Versión:** 5.1.10 FINAL · **Fecha:** 2026-11-16 · **Ámbito:** puente (`bridge.mjs`, `src/**`),
suite de pruebas, documentación y skill de instalación.

El informe externo agrupa 56 hallazgos. Este documento fija el estado final de los 17 que
seguían abiertos o en disputa al cerrar la serie 5: siete ya cerrados en 5.1.8, dos cerrados en
esta tanda (P22 y P2), cuatro aceptados con su mitigación explícita (P39, P50, P51, P56) y cuatro
verificados como no aplicables (P33, P40, P45, P52). El bloque de la app Android se cierra en su
propia tanda dentro de la misma release: aquí consta el estado y el motivo, no la implementación.

## Resumen

| Estado | Puntos | Total |
| --- | --- | --- |
| Cerrado en 5.1.8 | P1, P3, P6, P7, P23, P36, P55 | 7 |
| Cerrado en 5.1.9 | P2, P22 | 2 |
| Aceptado con mitigación | P39, P50, P51, P56 | 4 |
| No aplicable (verificado) | P33, P40, P45, P52 | 4 |

## Tabla de cierre

| Punto | Estado | Release | Qué se hizo o por qué | Evidencia |
| --- | --- | --- | --- | --- |
| P1 | Cerrado | 5.1.8 | El nonce de `BridgeGuard` cubre también `onApprovalRequested`, `onGenerationFinished`, `onJobFinished`, `copyToClipboard`, `saveOfflineDraft` y `onHeartbeat`; sin nonce válido la llamada se rechaza (fail-closed). | [CHANGELOG.md](CHANGELOG.md) |
| P3 | Cerrado | 5.1.8 | Se eliminó la acción de aprobación desde la notificación (botones, receptor y acción pendiente); el aviso queda informativo y se limpian restos de versiones anteriores. | [CHANGELOG.md](CHANGELOG.md) |
| P6 | Cerrado | 5.1.8 | Una petición con cabeceras de proxy (`cf-connecting-ip`, `cf-access-jwt-assertion`, `x-forwarded-for`) ya no abre la ventana del panel en el escritorio del host. | [CHANGELOG.md](CHANGELOG.md), `src/routes.mjs` |
| P7 | Cerrado | 5.1.8 | `/simulator` y sus recursos exigen dispositivo emparejado o clave de acceso; ya no responden 200 a cualquiera dentro de la VPN. | [CHANGELOG.md](CHANGELOG.md), `src/static.mjs` |
| P23 | Cerrado | 5.1.8 | El puerto del panel (57421) salió de `targetCandidates`; el descubrimiento del backend ya no puede apuntar al panel. | [src/config.mjs](src/config.mjs) |
| P36 | Cerrado | 5.1.8 | `CleartextPolicy` es fail-closed: cualquier excepción en la comprobación rechaza el tráfico en claro. | [CHANGELOG.md](CHANGELOG.md) |
| P55 | Cerrado | 5.1.8 | Los CSS y el JS del simulador se sirven con su tipo MIME correcto; la página ya no carga con 403. | [CHANGELOG.md](CHANGELOG.md), `src/static.mjs` |
| P22 | Cerrado | 5.1.9 | El descubrimiento exige identidad real de DSH (marcador `__DSH_BOOT__` o reto `dsh web authentication required`), no solo "algo responde"; 401/403 sin marcador queda como `possible` y no confirma. Ver detalle abajo. | [src/network.mjs](src/network.mjs) |
| P2 | Cerrado | 5.1.9 | `verify_registry_safety` ya no puede perder el registro real: respaldo `.test-bak` persistente, periódico `.test-in-progress` y restauración automática (byte a byte) al arrancar y al terminar. Ver detalle abajo. | [test/verify_registry_safety.mjs](test/verify_registry_safety.mjs) |
| P39 | Aceptado | 5.1.9 | El receiver del widget debe ser `exported=true` y atender `APPWIDGET_UPDATE`: es inherente a `AppWidget` (lo invoca el launcher, otro proceso). No procesa datos del puente, no recibe parámetros externos y solo pinta estado local con `RemoteViews`. Mitigación: sin permisos propios, sin extras de confianza y sin acceso a tokens. | [android_src/CompanionWidget.java](android_src/CompanionWidget.java), [android_src/AndroidManifest.xml](android_src/AndroidManifest.xml) |
| P50 | Aceptado | 5.1.9 | La dependencia de verificar CSS está en pruebas de compatibilidad de la inyección (`verify_injection`, `verify_battery_and_landscape`), no en código de producción. Si DeepSeek Harness cambia su hoja de estilos, la suite falla y avisa; es la señal deseada, no un riesgo de seguridad. | [test/verify_injection.mjs](test/verify_injection.mjs), [test/verify_battery_and_landscape.mjs](test/verify_battery_and_landscape.mjs) |
| P51 | Aceptado | 5.1.9 | La CSP y las cabeceras de seguridad se aplican a las páginas propias y estáticos; el HTML de DeepSeek Harness se proxifica sin reescribir sus cabeceras porque una CSP ajena rompería la aplicación. Mitigación: CSP en lo que sirve el puente, `X-Frame-Options: DENY` y `nosniff` en estáticos. | [src/static.mjs](src/static.mjs) |
| P56 | Aceptado | 5.1.9 | No hay linter a propósito: el proyecto tiene cero dependencias npm. La red de seguridad es la auditoría propia (`tools/audit-repo.mjs`: sintaxis, codificación, enlaces, tablas, JSON, versiones, secretos y límite de 400 líneas), ejecutada en CI. | [tools/audit-repo.mjs](tools/audit-repo.mjs), [.github/workflows/verify.yml](.github/workflows/verify.yml) |
| P33 | No aplica | 5.1.9 | `focusPanelWindow` ya limita el robo de foco a una vez cada 60 s. Verificado en código. | [src/panel.mjs](src/panel.mjs) |
| P40 | No aplica | 5.1.9 | `NetCredentials.clearForPc` borra `removeAllCookies` y `clearHttpAuthUsernamePassword` al eliminar una PC; el límite de Android está documentado en el propio archivo. | [android_src/NetCredentials.java](android_src/NetCredentials.java) |
| P45 | No aplica | 5.1.9 | El SSE de avisos solo emite `{ type, turn, at }` (y la marca `test`); no difunde nombres de espacio ni de sesión. | [src/pc-events.mjs](src/pc-events.mjs) |
| P52 | No aplica | 5.1.9 | `/pair` responde 403 solo cuando el boleto de panel ya no es válido o la petición no viene del panel local: es el comportamiento correcto. | [src/routes-pairing.mjs](src/routes-pairing.mjs) |

## P22 — descubrimiento más estricto

Antes, `probePort` consideraba backend DSH a cualquier servicio local que respondiera 200, 301,
302, 307, 308, 401 o 403. El propio reto de autenticación de DSH web es un 401, así que un 401 de
cualquier otro servicio también pasaba, y `dshOnline` podía quedar en `true` sin Harness detrás.

Ahora hay una sola implementación de identidad, `probeDshIdentity(port, host, timeoutMs)`, que
devuelve `{ port, status, identity }` con `identity` en `confirmed | possible | none`:

- `confirmed`: 200/401/403 cuyo cuerpo contiene un marcador real de DSH
  (`__DSH_BOOT__` o `dsh web authentication required`, que es lo que devuelve el Harness real en
  `/` cuando la sesión no está abierta).
- `possible`: 401/403 sin marcador; pudo pedir credenciales, pero no confirma identidad.
- `none`: 200 sin marcador, redirecciones y cualquier otro estado.

`probePort` mantiene su firma booleana (compatibilidad con `buildStatusPayload`) y devuelve `true`
solo con identidad `confirmed`; `probeDshPort` (descubrimiento y resolución de puerto) usa el mismo
criterio. Se añadió tope de 64 KiB de cuerpo y cierre temprano al encontrar el marcador.

Comportamiento comprobado contra el Harness real de esta máquina: el puerto en escucha (56597
antes de reiniciar el entorno y 49211 después) responde 401 con marcador → `confirmed`; el
descubrimiento dinámico lo localiza sin configuración y la suite de CI sigue viendo
`dshOnline=true` con su backend de pruebas.

## P2 — la prueba del registro ya no puede corromper el registro real

El puente que se está probando ya está arrancado y lee `~/.dsh/companion-devices.json`; no se
puede redirigir a un `DSH_HOME` temporal sin reiniciarlo (y reiniciarlo no es parte de la prueba).
El aislamiento es por tanto de recuperación:

1. Antes de tocar el registro se escribe un respaldo `.test-bak` (con `fsync`) y un periódico
   `.test-in-progress`. Si el proceso muere entre ambos, el registro está intacto.
2. Si un intento anterior dejó el periódico, el arranque restaura desde el respaldo antes de
   empezar: nunca se confía en un registro a medias.
3. Al terminar (normal, `finally` o señal `SIGINT`/`SIGTERM`/`SIGHUP`) se restaura el original,
   incluido el estado "no existía" y el `.corrupt` previo, y se verifica byte a byte.
4. El respaldo `.test-bak` se conserva para el siguiente intento; el periódico se borra al
   restaurar.

La prueba sigue comprobando lo mismo (un registro ilegible no se sobrescribe y el dispositivo
sobrevive al ciclo) y añade una comprobación de restauración exacta. En CI el `HOME`/`DSH_HOME` ya
son temporales, así que solo se ejerce el camino normal.

## Verificación de esta tanda

Ejecutado entre el 2026-11-15 y el 2026-11-16 sobre el árbol de 5.1.10:

- `node test/verify_registry_safety.mjs` contra el puente real: 4/4 PASS; hash del registro antes
  y después idéntico; sin `.test-in-progress` residual.
- Simulación de corte a mitad de prueba (registro a medias + periódico): restauración automática
  desde `.test-bak` y 4/4 PASS.
- `node test/ci/run-suite.mjs` sobre el árbol de 5.1.10: 203 comprobaciones PASS, 0 FAIL y 3 SKIP
  declarados.
- `powershell -File doctor.ps1 -Json`: `ok=true` (0 blockers, 1 WARN de firewall), `candidates[]`
  con la red elegida y `receipt.sha256` presente.
- Descubrimiento con un puente aislado arrancado desde este árbol: `targetPort=49211` (el Harness
  real) y `dshOnline=true`, encontrado por `discoverListeningPorts` sin configuración.
- `node skills/mobile-companion-setup/scripts/verify-fixes.mjs static`: OK.
- `node tools/audit-repo.mjs`: sin hallazgos, tanto en el árbol de trabajo como en la copia de
  índice con `AUDIT_CLOSURE.md` incluido.
- Límite de 400 líneas: `src/network.mjs` 399, `test/verify_registry_safety.mjs` 262.

## Riesgos residuales

- **La prueba del registro toca el registro real del usuario** mientras corre (segundos). El
  respaldo y la restauración están verificados, pero un corte de energía justo entre escritura y
  restauración deja el registro de prueba hasta el siguiente arranque de la prueba; por eso el
  periódico y el respaldo son persistentes. La alternativa real es arrancar el puente de pruebas
  con `DSH_HOME` temporal, que es lo que ya hace CI.
- **P22 depende de los marcadores de DSH** (`__DSH_BOOT__`, `dsh web authentication required`). Si
  una versión futura de Harness los cambia, el descubrimiento deja de confirmar: es preferible un
  falso negativo explícito (el puente no reasigna el backend) a un falso positivo que apunte a otro
  servicio. El log y `dshOnline` permiten detectarlo.
- Los puntos aceptados (P39, P50, P51, P56) están desarrollados en [SECURITY.md](SECURITY.md),
  sección "Riesgos aceptados", con su mitigación.

## 5.1.10 — correcciones del QA

El QA final de la serie 5 encontró diez defectos en la build 5.1.9. La versión final 5.1.10 los
cierra todos; **D1, H1 y H2 justifican por sí solos el relanzamiento**: rompían la actualización
desde la PC y abrían dos vías de privilegio. El detalle de la release está en
[RELEASE_5.1.10.md](RELEASE_5.1.10.md) y el historial en [CHANGELOG.md](CHANGELOG.md).

| Defecto | Severidad | Estado | Qué se corrigió | Evidencia |
| --- | --- | --- | --- | --- |
| D1 | ALTA | Cerrado | La actualización desde la PC fallaba con `NullPointerException` porque la ruta del búnker no tiene digest de GitHub; ahora usa como ancla el SHA-256 que publica el puente (`apkSha256`). | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| H1 | MEDIA | Cerrado | Con `DSH_ALLOW_PROXY_ACCESS=1`, una petición con cabeceras de proxy se trataba como loopback (podía autoaprobarse, abrir el panel y ver `pendingList`); ahora el flag solo permite pasar la guarda de red y nunca eleva privilegios. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| H2 | MEDIA | Cerrado | Un dispositivo `viewer` podía abrir el WebSocket; ahora se rechaza el upgrade de un viewer. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| H3 | BAJA | Cerrado | Un symlink o hardlink dentro de `synced_chats/` permitía leer archivos del host como conversación; ahora se rechazan los archivos no regulares y se comprueba la ruta real. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| H4 | BAJA | Cerrado | El panel aceptaba `Origin: null`; ahora lo rechaza como el resto de orígenes ajenos. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| H5 | BAJA | Cerrado | Un JSON malformado en `/sync` podía inyectar texto arbitrario en `bridge.log`; ahora se sanea (sin CR/LF ni caracteres de control, truncado). | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| D3 | BAJA | Cerrado | El kill switch borraba las cookies aunque la revocación no se hubiera confirmado; ahora solo cierra la sesión local si el puente confirma. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| D4 | BAJA | Cerrado | La biometría crítica llamaba a un hook JS inexistente; ahora usa el hook real del cliente. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| D5 | INFORMATIVA | Cerrado | `BootReceiver` ya no es `exported=true` (`BOOT_COMPLETED` es un broadcast protegido). | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
| D6 | INFORMATIVA | Cerrado | El descubrimiento Android ya no acepta el marcador por subcadena; exige JSON con `service == "dsh-companion"`. | [RELEASE_5.1.10.md](RELEASE_5.1.10.md), [CHANGELOG.md](CHANGELOG.md) |
