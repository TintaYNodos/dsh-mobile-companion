# Pruebas del puente y del cliente

La suite habla con **una instancia real del puente en marcha**: no hay backend de
mentira, ni mocks, ni un servidor levantado por las pruebas. Eso es intencionado
(se prueba el binario que se publica), pero hay que saber lo que implica.

## Requisitos

- **Node >= 22.15.0** (`package.json` → `engines`). Los avisos por turno leen
  frames zstd con `node:zlib`, que no existe en versiones anteriores.
- El **puente arrancado** en `http://127.0.0.1:57420` (`start.bat`,
  `run-hidden.vbs` o `node bridge.mjs`) y el panel en el puerto 57421.
- La **clave de acceso** en `%USERPROFILE%\.dsh\companion-access-key` o en
  `DSH_ACCESS_KEY`.
- Un **registro de dispositivos** que puedas respaldar: varias pruebas lo
  escriben y la del kill switch lo revoca.

## Cómo ejecutar

```bash
node test/run-all.mjs
```

`run-all.mjs` ejecuta los archivos `verify_*.mjs` en orden y suma los resultados.
También puedes correr uno solo:

```bash
node test/verify_bridge.mjs
```

## Variables de entorno

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `DSH_TEST_HOST` | `127.0.0.1` | Host del puente. |
| `DSH_TEST_PORT` | `57420` | Puerto del puente. |
| `DSH_PANEL_PORT` | `57421` | Puerto del panel local. |
| `DSH_ACCESS_KEY` | archivo del HOME | Clave de acceso, si no quieres usar el archivo. |
| `DSH_PANEL_TOKEN` | archivo del HOME | Boleto del panel (`~/.dsh/companion-panel-token`), para las pruebas de panel y aprobación. |
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
  validación. Puede correr en CI.

## CI

`.github/workflows/verify.yml` comprueba la sintaxis de todos los `.mjs` y ejecuta
`node tools/audit-repo.mjs` y `node test/verify_config_guard.mjs` en cada push o
pull request. Las pruebas que necesitan un puente vivo **no** corren en CI: ese
es el límite conocido de la suite y se documenta aquí en vez de disimularlo.

## utilidades manuales

- `bench_latency.mjs` — banco de latencia contra el puente vivo (no forma parte de `run-all.mjs`):
  `node test/bench_latency.mjs`. Sirve para medir el proxy, no para verificar.
