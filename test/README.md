# Pruebas del puente y del cliente

Documento de la versión bajo prueba: **5.4.0** (`versionCode` 67). El contrato de notas que
describen estas suites (nota de solo título, idempotencia por `id`, bandeja `inbox.jsonl`, índice
legible `synced_chats/notes/INDICE.md`, límite de peticiones por cliente y reparación de
codificación) es el de esta release.

Hay dos formas de ejecutar las pruebas, con propósitos distintos:

1. **Suite completa, manual**, contra **una instancia real del puente en marcha**
   y, en parte, contra un DeepSeek Harness real. Es la que valida el binario que
   se publica y la compatibilidad con DSH.
2. **Suite de CI** (`npm run test:ci`), reproducible y aislada: arranca su propio
   puente temporal y no toca la instalación del usuario. Es la que corre en
   GitHub Actions y no depende de una computadora concreta ni de un DSH real.

La suite completa no tiene backend de mentira: habla con la instancia real. La
suite de CI sí usa un **doble mínimo de backend** (ver más abajo) únicamente para
ejercitar el proxy y la inyección del puente; eso está dicho aquí en vez de
disimularlo.

## Requisitos de la suite completa

- **Node >= 22.15.0** (`package.json` → `engines`). Los avisos por turno leen
  frames zstd con `node:zlib`, que no existe en versiones anteriores.
- El **puente arrancado** en `http://127.0.0.1:57420` (`start.bat`,
  `run-hidden.vbs` o `node bridge.mjs`) y el panel en el puerto 57421.
- La **clave de acceso** en `%USERPROFILE%\.dsh\companion-access-key` o en
  `DSH_ACCESS_KEY`.
- Un **registro de dispositivos** que puedas respaldar: varias pruebas lo
  escriben y la del kill switch lo revoca.

## Cómo ejecutar la suite completa

```bash
node test/run-all.mjs
```

`run-all.mjs` ejecuta los archivos `verify_*.mjs` en orden y suma los resultados.
También puedes correr uno solo:

```bash
node test/verify_bridge.mjs
```

## Variables de entorno (suite completa)

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `DSH_TEST_HOST` | **obligatoria, sin valor por defecto** | Host del puente. `run-all.mjs` aborta si falta. |
| `DSH_TEST_PORT` | **obligatoria, sin valor por defecto** | Puerto del puente. `run-all.mjs` aborta si falta. |
| `DSH_PANEL_PORT` | `DSH_TEST_PORT` + 1 | Puerto del panel local. |
| `DSH_ACCESS_KEY` | archivo del HOME | Clave de acceso, si no quieres usar el archivo. |
| `DSH_PANEL_TOKEN` | archivo del HOME | Boleto de apertura del panel, para las pruebas de panel y aprobación. |
| `DSH_TEST_DESTRUCTIVE` | sin definir | `1` habilita la prueba del kill switch **real**. |

`_harness.mjs` centraliza el host, el puerto y la cabecera de autenticación, así
que ninguna prueba debe llevar la IP ni el puerto escritos a mano.

## La prueba destructiva

`verify_kill_switch.mjs` hace el kill switch de verdad: **revoca los
dispositivos emparejados y rota la clave de acceso**. Por eso está apagada salvo
que exportes `DSH_TEST_DESTRUCTIVE=1`, y por eso hay que restaurar el registro y
la clave después. Sin esa variable la prueba se **omite** (no falla) y el resto
de la suite sigue igual.

## Qué modifica cada prueba (y qué debes respaldar)

- `verify_registry_safety.mjs` escribe un registro limpio y lo restaura al
  terminar; si la corrida se interrumpe, revisa que
  `%USERPROFILE%\.dsh\companion-devices.json` siga teniendo tus dispositivos.
- `verify_bridge.mjs` sincroniza un chat de prueba en `synced_chats/` y espera
  que el backend de DSH sirva el CSS de su interfaz **si el backend está
  disponible**; si DSH está apagado o no expone ese asset, la comprobación se
  **omite** en lugar de fallar.
- `verify_config_guard.mjs` **no necesita el puente**: arranca procesos hijos con
  `DSH_ACCESS_DISABLE`/`DSH_ALLOWED_HOSTS` alterados y llama a las funciones de
  validación.

## CI: qué corre y qué no

El trabajo `suite` de [verify.yml](../.github/workflows/verify.yml) ejecuta
`npm run test:ci`, que a su vez arranca `test/ci/run-suite.mjs`. El runner:

- crea un **HOME y un `DSH_HOME` temporales** (nunca lee ni escribe
  `%USERPROFILE%\.dsh`, `$HOME/.dsh` ni `companion-devices.json` del usuario);
- escribe un `.credentials.yaml` mínimo válido para `src/crypto.mjs` y lo
  comprueba con el mismo `loadSecret()` antes de arrancar el puente;
- elige **puertos libres de loopback** (jamás 57420/57421 ni los candidatos de
  backend reales) y enlaza el puente a `127.0.0.1`;
- levanta un **backend DSH mínimo de pruebas** (`test/ci/`) que solo devuelve un
  documento HTML con `</head>`, viewport, manifiesto y un CSS en `/assets`, más
  el marcador `__DSH_BOOT__` que `src/network.mjs` usa para reconocerlo;
- corre cada suite en un proceso hijo, resume `PASS`/`FAIL`/`SKIP` y sale con
  código 1 si algo falla;
- al terminar envía **SIGTERM** al puente, limpia el directorio temporal y
  comprueba (**H-17**) que el `synced_chats/` y el `bridge.log` del repositorio
  no cambiaron: la suite escribe en `DSH_SYNC_DIR` y `DSH_LOG_FILE` temporales.

### Suites que corren en CI

| Archivo | Qué cubre | Necesita DSH real |
| --- | --- | --- |
| `verify_config_guard.mjs` | Guardas de `DSH_ACCESS_DISABLE` / `DSH_ALLOWED_HOSTS`. | No |
| `verify_injection.mjs` | Inyección del shell móvil en el HTML proxificado. | No (basta el doble) |
| `verify_client_ux.mjs` | Regresiones sin dispositivo: 44 dp del dock y su fila compacta, selector de archivos que oculta/restaura el dock, orden del kill switch (borra la copia sin conexión solo tras el 2xx y dice que afecta solo a ESTA PC) y contraste AA del rojo en ambos temas. | No |
| `verify_access_key.mjs` | Clave de acceso, origen cruzado y pantalla de espera. | No (basta el doble) |
| `verify_registry_safety.mjs` | Registro de dispositivos ilegible/ausente. | No |
| `verify_bridge.mjs` | Proxy, sync, chats, cabeceras y frontera de origen. | No (basta el doble) |
| [verify_notes.mjs](verify_notes.mjs) | Ruta de notas del teléfono: autorización, límites de cuerpo, nota de solo título, escritura Markdown con front matter (`id`, `dueDate`, `updatedAt`) en `synced_chats/notes/`, idempotencia por `id` con `ids.json`, bandeja `inbox.jsonl`, índice legible `synced_chats/notes/INDICE.md`, `GET /dsh-companion/notes`, traversal, unicidad, retención, límite de peticiones y reparación de codificación rota. | No (arranca su propio puente aislado) |
| [verify_battery_and_landscape.mjs](verify_battery_and_landscape.mjs) | CSS de paisaje, batería de `system-stats` y navegación de `offline.html`. | No |
| `verify_subagente_a.mjs` | QR, temas, barra de teclas y rutas retiradas. | No |
| `verify_panel.mjs` | Aprobación, cookie de dispositivo y revocación. | No (basta el doble) |
| `verify_log_rotation.mjs` | Rotación en caliente de `bridge.log`, `DSH_LOG_MAX_MB` y `DSH_LOG_KEEP`. | No |
| `verify_vpn_detection.mjs` | Detección de la VPN (Tailscale, ZeroTier, NetBird, Nebula, EasyTier, Headscale, Twingate, Hamachi/Radmin y genérica). | No |
| `verify_device_profiles.mjs` | Roles `full`/`viewer`, `targetPort` por dispositivo y acciones del panel. | No |

### Suites fuera de CI y por qué

- `verify_sync_ws.mjs`: necesita el **WebSocket del backend DeepSeek Harness
  real**; el doble de CI no implementa WS. Se sigue ejecutando en la suite
  manual contra un DSH vivo.
- `verify_kill_switch.mjs`: es **destructiva** (revoca dispositivos y rota la
  clave). Solo corre manualmente con `DSH_TEST_DESTRUCTIVE=1`.
- `verify_approval.mjs`: se solapa con `verify_panel.mjs` y usa el boleto del
  panel, que es de **un solo uso**; dos suites no pueden canjear el mismo
  `DSH_PANEL_TOKEN` sin reiniciar el puente. Queda para la suite manual.

### Límites conocidos de la suite de CI

- El doble de backend **no valida compatibilidad real con DeepSeek Harness**:
  comprueba el contrato del puente (proxy, inyección, emparejamiento), no la
  interfaz real del producto. Esa parte sigue necesitando la suite manual.
- `verify_bridge.mjs` comprueba el asset CSS proxificado contra el doble; con un
  DSH real verifica el asset de verdad.
- La suite de CI **no arranca el kill switch ni el túnel WebSocket**, y no
  modifica el registro ni la clave reales.
- **Sin APK no se prueba el ancla real**: `DSH-Companion.apk` está gitignored y
  CI no lo tiene, así que `verify_bridge.mjs` emite `SKIP` con su motivo en las 2
  comprobaciones que comparan el SHA-256 del binario y el `apkAnchorMissing` de
  `/status` contra ese archivo. En local, con el APK en la raíz, se ejecutan y
  deben estar verdes. Se contabilizan como omitidas (SKIP), no como PASS. En CI
  (ubuntu) el runner resume **416 PASS + 2 SKIP** (418 comprobaciones en total, igual que en local): esas 2 más la comprobación de
  la ventana del panel, que solo se abre en Windows. En local con el APK, **418
  PASS**; al simular CI sin APK en Windows, **414 PASS + 2 SKIP**.

## Cómo ejecutar la suite de CI en tu máquina

```bash
npm run test:ci
```

No necesita variables de entorno ni el puente arrancado. Usa puertos efímeros,
un `DSH_HOME` temporal y limpia al terminar; puedes correrla con tu puente real
en marcha sin interrumpirlo. Además del resumen, el runner devuelve código 1 si
alguna suite falla.

Nota (**H-17**): el runner arranca el puente con `DSH_SYNC_DIR`, `DSH_LOG_FILE` y
`DSH_STOP_FLAG` dentro de su directorio temporal, así que ni escribe ni rota el
`synced_chats/` ni el `bridge.log` del repositorio.

## Verificaciones adicionales (5.2.0)

Además de las suites de arriba, la 5.2.0 añade dos comprobaciones que se ejecutan por separado y
quedan **fuera** del conteo de las suites (18 suites; 418 comprobaciones en total: 416 en CI y 2
omitidas por el APK no versionado, más 3 suites omitidas con motivo, una exclusiva de Windows, y
915+ comprobaciones Java puras). No forman parte de `run-all.mjs` ni de `test/ci/run-suite.mjs`; sus
comprobaciones se suman aparte y no alteran la comparabilidad con las releases de la serie 5.

| Archivo | Qué cubre | Necesita un puente real |
| --- | --- | --- |
| `test/verify_healthz.mjs` | `/healthz` y el contrato con DeepSeek Harness: `computeHealth()` con estados inyectados y, sobre puentes temporales, el camino sano (`ok`/`degraded`, HTTP 200) y el caído (`down`, HTTP 503). | No: arranca y apaga sus propios puentes aislados. |
| `test/verify_backup.mjs` | `backup.ps1`/`restore.ps1`: respaldo con manifiesto (`backups/<fecha>/manifest.json`) y hashes, `-DryRun` sin escrituras, restauración tras corromper los archivos vivos y rechazo de un respaldo manipulado sin tocar nada. | No: usa un `DSH_HOME` temporal. |

Se ejecutan a mano y sin tocar la instalación del usuario:

```bash
node test/verify_healthz.mjs
node test/verify_backup.mjs
```

Cada una imprime `PASS`/`FAIL` por comprobación y una línea `RESULTADO: x/y`; salen con código 1 si
algo falla. En plataformas no Windows, `test/verify_backup.mjs` imprime `SKIP` y sale con 0. Las dos
pueden correr con el puente real en marcha sin interrumpirlo.

## Utilidades manuales

- `bench_latency.mjs` — banco de latencia contra el puente vivo (no forma parte de `run-all.mjs`):
  `node test/bench_latency.mjs`. Sirve para medir el proxy, no para verificar.
