# Contrato del diagnóstico (`doctor.ps1`)

`doctor.ps1` es la única fuente de verdad de esta skill. No interpretes la consola: pide JSON y
parsea esos campos.

## Comando y códigos de salida

    powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report

- `-Json`: imprime el informe en JSON y **no** imprime la versión humana.
- `-Report`: escribe el mismo informe en `doctor-report.json` en la raíz del repo. Ese archivo está
  ignorado por git; no lo commitees.
- Código de salida `0`: `ok: true` (ningún FAIL). Código de salida `1`: hay al menos un FAIL.

Nota práctica: en Windows PowerShell 5.1, `Set-Content -Encoding UTF8` escribe BOM. Si lees
`doctor-report.json` con Node, quita el BOM antes de `JSON.parse`.

## Campos del informe

| Campo | Tipo | Significado |
| --- | --- | --- |
| `tool` | string | Siempre `dsh-companion-doctor`. |
| `reportVersion` | número | Versión del esquema del informe (hoy `1`). |
| `ok` | boolean | `true` solo si no hay ningún FAIL. |
| `nodeVersion` | string | Versión real del Node que usó el puente. |
| `bridgeVersion` | string | Versión del puente que respondió; vacío si no comprobó. |
| `phoneUrl` | string | URL exacta para el teléfono; vacía si no hay túnel. |
| `tunnel` | string | Interfaz de túnel detectada; vacía si no hay. |
| `bindHost` | string | IP privada a la que se enlaza el puente. |
| `bridgePort` | string | Puerto del puente (`DSH_LISTEN_PORT`, por defecto 57420). |
| `panelPort` | string | Puerto del panel (`DSH_PANEL_PORT`, por defecto 57421). |
| `checks` | array | Detalle: `{ id, level, message }` con `level` `OK`, `WARN` o `FAIL`. |
| `blockers` | array de strings | Mensajes FAIL, listos para mapear contra `$RepoRoot/doctor-fixes.json`. |
| `warnings` | array de strings | Mensajes AVISO; no bloquean el código de salida. |
| `generatedAt` | string ISO | Momento exacto del diagnóstico que citas como evidencia. |

Forma mínima (los valores son ejemplos, **no** los copies como si fueran de tu máquina):

```json
{
  "tool": "dsh-companion-doctor",
  "reportVersion": 1,
  "ok": false,
  "nodeVersion": "24.21.0",
  "bridgeVersion": "",
  "phoneUrl": "",
  "tunnel": "",
  "bindHost": "",
  "bridgePort": "57420",
  "panelPort": "57421",
  "checks": [
    { "id": "no-encuentro-node-js", "level": "FAIL", "message": "No encuentro Node.js." }
  ],
  "blockers": ["No encuentro Node.js."],
  "warnings": [],
  "generatedAt": "2026-01-01T00:00:00.0000000-06:00"
}
```

## `checks[].id` no es estable

El `id` se genera con un slug del mensaje:

```powershell
$slug = ($msg -replace "[^A-Za-z0-9]+", "-").Trim("-").ToLower()
```

Por eso, cuando el mensaje interpola una ruta, un puerto o una IP, el `id` cambia de una máquina a
otra (por ejemplo `dsh-home-c-users-escritor-dsh`). Reglas:

- Para decidir qué hacer, empareja el **texto** del mensaje (`blockers[]`/`warnings[]`) con
  `matchRuntime` de `$RepoRoot/doctor-fixes.json`.
- Usa el `id` solo como etiqueta de lectura o para depurar.
- No añadas lógica que dependa de un `id` concreto.

## Forzar el caso «sin túnel» para auditar el mapa

El túnel depende de la máquina, así que para probar la rama de fallo se usa una copia temporal del
script (nunca el original):

```powershell
$tmp = Join-Path $env:TEMP 'doctor-notunnel'
New-Item -ItemType Directory -Force $tmp | Out-Null
Copy-Item doctor.ps1 (Join-Path $tmp 'doctor.ps1')
$text = Get-Content (Join-Path $tmp 'doctor.ps1') -Raw
$text = $text.Replace(
  '$candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |' + "`r`n" +
  '        Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" }',
  '$candidates = @()')
Set-Content (Join-Path $tmp 'doctor.ps1') $text -Encoding UTF8
powershell -ExecutionPolicy Bypass -File (Join-Path $tmp 'doctor.ps1') -Json
```

Resultado esperado: un FAIL `No hay ninguna interfaz de ZeroTier ni Tailscale con IP privada.` y el
AVISO `Sin IP privada no se puede comprobar el puente todavia.` (más lo que corresponda al resto
del entorno). Ese JSON se pasa a `scripts/verify-fixes.mjs report <archivo>` para confirmar que
ambos mensajes tienen entrada.

## Otras ramas que se pueden forzar en una copia temporal

- Node ausente: vaciar `$nodeCandidates` y forzar `$nodeExe = ""`.
- Node antiguo: forzar el `if ($major -gt 22 -or ...)` a `$false`.
- Sin DSH_HOME: apuntar `$dshHome` a una ruta temporal inexistente.
- Sin credenciales: apuntar `DSH_HOME` a una carpeta temporal existente sin `.credentials.yaml`.
- Puerto ocupado por otro servicio: forzar el `if ($response.service -eq "dsh-companion")` a `$false`.
- Puente caído: arrancar el script con `DSH_BIND_HOST=127.0.0.90` (IP sin servicio).
- Panel caído: arrancar con `DSH_PANEL_PORT=1`.

Nunca modifiques `doctor.ps1` del repo para probar estas ramas.
