# Mapa de soluciones (`$RepoRoot/doctor-fixes.json`)

`$RepoRoot/doctor-fixes.json` traduce cada mensaje de `doctor.ps1` a una solución accionable. Es la pieza que
impide improvisar: si un mensaje no está en el mapa, no hay solución verificada.

## Dónde vive y qué contiene

- Archivo: `$RepoRoot/doctor-fixes.json` (raíz del repo, junto a `doctor.ps1`).
- Clave `fixes`: diccionario de id estable → fix.
- Cada fix tiene `match`, `matchRuntime`, `title`, `command`, `docs` y `blocking`.

| Campo | Uso |
| --- | --- |
| `id` | Clave estable del fix; no cambia aunque cambie el mensaje. |
| `match` | Texto exacto de la llamada `Bad`/`Warn` en `doctor.ps1`, con sus `$variables` tal cual. |
| `matchRuntime` | Fragmento o lista de fragmentos que deben aparecer en el mensaje real del JSON. |
| `title` | Qué falta, en una línea. |
| `command` | Comando que lo corrige, o `null` si hace falta una acción humana. |
| `docs` | Archivo del repo (relativo a la raíz) o URL oficial. |
| `blocking` | `true` = FAIL (rompe `ok`); `false` = AVISO del diagnóstico. |

## Cómo mapear un mensaje (algoritmo)

1. Toma cada string de `blockers[]` y de `warnings[]` del JSON. No uses `checks[].id`.
2. Para cada fix, normaliza `matchRuntime` a lista y comprueba que **todos** sus fragmentos están
   contenidos en el mensaje (comparación exacta, sensible a mayúsculas y acentos).
3. Si más de un fix coincide, gana el que tenga más caracteres de fragmentos coincidentes.
4. Si ninguno coincide: no improvises. Detente, reporta el mensaje exacto y el comando que lo
   produjo. Un mensaje sin fix es un hueco del mapa, no una invitación a inventar.
5. Aplica el `command` del fix (o pide al usuario la acción si es `null`), vuelve a ejecutar
   `doctor.ps1 -Json -Report` y repite hasta que `ok: true` y los avisos relevantes estén resueltos.

`scripts/verify-fixes.mjs report <archivo>` hace exactamente este mapeo y marca `SIN MAPA` cuando
algo no encaja. Úsalo antes de dar el trabajo por terminado.

## Ids disponibles (hoy)

| id | blocking | Qué cubre |
| --- | --- | --- |
| `node-missing` | sí | No hay Node.js. |
| `node-too-old` | sí | Node anterior a 22.15. |
| `dsh-home-missing` | sí | No existe el directorio de DSH. |
| `harness-credentials-missing` | sí | Faltan credenciales de Harness. |
| `no-private-tunnel` | sí | No hay ZeroTier ni Tailscale con IP privada. |
| `bridge-wrong-service` | sí | El puerto del puente lo ocupa otro servicio. |
| `bridge-unreachable` | sí | El puente no responde. |
| `panel-not-listening` | sí | El panel no escucha. |
| `access-key-pending` | no | Aún no hay clave de acceso (normal). |
| `bind-host-override` | no | `DSH_BIND_HOST` fuerza la IP. |
| `bridge-unchecked-no-tunnel` | no | Sin túnel no se puede comprobar el puente. |
| `harness-offline` | no | Harness no contesta en la PC. |
| `firewall-rule-missing` | no | Falta regla de firewall para el puerto. |
| `firewall-query-failed` | no | No se pudo leer el firewall. |

## Pasos exactos de instalación

Comandos por plataforma para las puertas de `SKILL.md`. Todo se ejecuta desde la raíz del repo (la
carpeta que contiene `doctor.ps1`). En Windows usa `powershell -ExecutionPolicy Bypass` para los
scripts `.ps1`; los `.bat` se ejecutan con doble clic o desde la consola.

### Orden de operaciones

1. Diagnóstico: `powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report`.
2. Túnel privado (ZeroTier o Tailscale) si falta. Sin túnel no se continúa.
3. Arranque del puente + firewall.
4. Emparejamiento del teléfono con el panel.
5. Prueba de avisos.
6. Diagnóstico final + informe con evidencia.

### Arranque y parada

- **Windows**: `install-autostart.bat` registra el acceso directo de Inicio **y arranca el puente**.
  No ejecutes `run-hidden.vbs` después: la segunda instancia muere con EADDRINUSE.
  Para arrancar cuando ya está instalado: `start.bat`. Para parar: `stop.bat`.
- **macOS**: `install-launchd.sh` instala el servicio de usuario y arranca el puente. Para quitarlo:
  `uninstall-launchd.sh`.
- **Linux**: `install-systemd.sh` instala la unidad de usuario. Para quitarla: `uninstall-systemd.sh`.

El puente se enlaza a la interfaz del túnel que elige el doctor (`$interfaces` en `doctor.ps1` es
la lista de IPv4 no loopback ni APIPA). Si hay varias redes privadas, `doctor.ps1 -Json` devuelve
`candidates[]` en orden de preferencia y `bindHost` con la elegida; para usar otra, arranca el
puente con `DSH_BIND_HOST=<ip>`. El diagnóstico lo avisa con un WARN ("DSH_BIND_HOST esta fijado
a ...") y `tunnel` sigue mostrando la red elegida. Empareja los `checks[]` por el **texto** del
mensaje, no por el `id`: el id es un slug que cambia con la ruta, el puerto o la IP.

### Firewall de Windows

Si el diagnóstico marca un FAIL con el mensaje "No hay ninguna regla de firewall para el puerto ...",
aplica como administrador:

```powershell
netsh advfirewall firewall add rule name="DSH Companion" dir=in action=allow protocol=TCP localport=57420
```

El puerto debe coincidir con `DSH_LISTEN_PORT` (57420 por defecto). El AVISO "No se pudo consultar
el firewall (puede requerir permisos)..." solo indica que la consulta necesita permisos; si el
teléfono conecta, no bloquea.

### Emparejamiento con `panel.bat`

1. El teléfono abre `phoneUrl` (o la app) y muestra un código de 4 dígitos.
2. En la computadora, `panel.bat` abre el panel en `127.0.0.1` con el token local.
3. El panel lista la solicitud con el mismo código; pulsa **Autorizar**.
4. Comprueba que el teléfono entra a DeepSeek Harness.

`panel.bat` usa el token de `%USERPROFILE%\.dsh\companion-panel-token`. No lo imprimas ni lo pegues
en el informe. El panel escucha estrictamente en loopback: no lo publiques.

### Prueba de avisos

En el teléfono: Ajustes -> "Notificaciones de la PC" (activado) -> "Probar desde la PC".

- Esperado: "Prueba enviada" y el aviso llega en segundos.
- "Ningún teléfono escuchando": el servicio en primer plano no corre; apaga y enciende el interruptor.
- Error 403: la clave guardada en el teléfono es vieja; vuelve a emparejar (panel).

### macOS/Linux y sin APK

- macOS/Linux: el puente corre igual; el teléfono usa la URL privada. El diagnóstico es de Windows,
  así que en esas plataformas valida a mano que el puente responde en `phoneUrl`.
- iPhone/iPad: no hay APK. Se abre `phoneUrl` en Safari y se añade a pantalla de inicio. En iOS no
  hay avisos en segundo plano: es una limitación de la plataforma y hay que decirlo.
- PWA offline (PC apagada): es estática y opcional; no sustituye al chat en vivo.

### Qué no hacer nunca

- No abras puertos en el router ni crees túneles públicos hacia el puente.
- No publiques el puente tras un proxy sin capa de identidad: `DSH_ALLOW_PROXY_ACCESS` solo con
  identidad por delante.
- No ejecutes el kill switch ni "Revocar todos" sin pedirlo: rota la clave y obliga a emparejar todo.
- No lances `npm test` contra la instalación real sin avisar.

### Evidencia mínima antes de continuar al informe

- JSON del diagnóstico final con `ok: true`, `generatedAt` reciente, `bindHost`/`tunnel` no vacíos
  y `candidates[]` con la red usada.
- Recibo del informe verificado: `node tools/verify-receipt.mjs doctor-report.json`.
- Salida humana de `doctor.ps1` (túnel, URL, versión, panel).
- Confirmación del usuario de que el teléfono quedó emparejado y de que el aviso de prueba llegó.
- Resultado del mapeo del informe con `scripts/verify-fixes.mjs report doctor-report.json`.

### Nota de 5.1.9: varias redes privadas

El doctor ya no usa `$candidates = Get-NetIPAddress...`; ahora recorre `$interfaces` y puede
listar varias redes privadas. Si hay más de una, fija la correcta antes de arrancar:

    $env:DSH_BIND_HOST = "<ip-de-la-vpn>"
    powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json

No aceptes la LAN doméstica como red privada; el puente la ignora a propósito.

## Cómo ampliar el mapa (mantenedores)

1. Localiza la llamada en `doctor.ps1`: `Bad "..."` para FAIL, `Warn "..."` para AVISO. `F("...")`
   es la forma histórica de FAIL y también debe cubrirse.
2. Copia el texto **completo** entre comillas como `match`, incluyendo `$variables`.
3. Arranca el caso real (o la copia temporal de `references/doctor-contract.md`), copia el mensaje
   exacto del JSON y elige fragmentos que no dependan de la máquina como `matchRuntime`.
4. Añade el fix al archivo con un `id` nuevo en kebab-case.
5. Verifica:
   - `node skills/mobile-companion-setup/scripts/verify-fixes.mjs static`
   - `node skills/mobile-companion-setup/scripts/verify-fixes.mjs report <informe-json>`
   - `node tools/audit-repo.mjs`
6. No cambies el `match` de un fix existente para "hacerlo pasar": si `doctor.ps1` cambió el
   mensaje, actualiza `match` y `matchRuntime` a la vez.
