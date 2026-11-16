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
`doctor-report.json` con Node, quita el BOM antes de `JSON.parse`. El propio `doctor.ps1 -Report` ya
lo escribe sin BOM, así que `JSON.parse` funciona directo.

## Campos del informe

| Campo | Tipo | Significado |
| --- | --- | --- |
| `tool` | string | Siempre `dsh-companion-doctor`. |
| `reportVersion` | número | Versión del esquema del informe (hoy `1`). |
| `ok` | boolean | `true` solo si no hay ningún FAIL. |
| `nodeVersion` | string | Versión real del Node que usó el puente. |
| `bridgeVersion` | string | Versión del puente que respondió; vacío si no comprobó. |
| `apkVersion` | string | Versión del APK que el puente sirve de verdad. |
| `apkVersionCode` | número | `versionCode` de ese APK; `0` si no pudo consultarlo. |
| `apkSha256` | string | SHA-256 del APK servido por el puente; vacío si no lo comprobó. |
| `certSha256Release` | string | Huella SHA-256 del certificado de firma de release (dato documental). |
| `phoneUrl` | string | URL exacta para el teléfono; vacía si no hay túnel. |
| `tunnel` | string | Interfaz de túnel **elegida**; vacía si no hay. |
| `candidates` | array | Todas las redes privadas de VPN vistas, en orden de preferencia (ver abajo). |
| `bindHost` | string | IP privada a la que se enlaza el puente (la elegida, o `DSH_BIND_HOST`). |
| `bridgePort` | string | Puerto del puente (`DSH_LISTEN_PORT`, por defecto 57420). |
| `panelPort` | string | Puerto del panel (`DSH_PANEL_PORT`, por defecto 57421). |
| `checks` | array | Detalle: `{ id, level, message }` con `level` `OK`, `WARN` o `FAIL`. |
| `blockers` | array de strings | Mensajes FAIL, listos para mapear contra `$RepoRoot/doctor-fixes.json`. |
| `warnings` | array de strings | Mensajes AVISO; no bloquean el código de salida. |
| `generatedAt` | string ISO | Momento exacto del diagnóstico que citas como evidencia. |
| `receipt` | objeto | Recibo verificable del informe (ver abajo). |

## `candidates[]`: todas las redes privadas

El doctor ya no se queda con una sola candidata. `candidates` lista cada interfaz privada válida
en el mismo orden de preferencia que usa `src/network.mjs`, y `tunnel`/`bindHost` dicen cuál se
eligió. Cada elemento es:

    { "ip": "10.x.x.x", "iface": "ZeroTier One [red]", "kind": "strong", "provider": "zerotier" }

`kind` puede ser:

- `strong`: VPN conocida (Tailscale, ZeroTier, NetBird, Nebula, EasyTier, WireGuard, Tinc,
  SoftEther, Twingate, Headscale) con IP privada o CGNAT. Se enlaza.
- `generic`: `tun`/`tap`/`openvpn`/`ppp` sin proveedor reconocido. Solo se enlaza si el operador
  arranca el puente con `DSH_ALLOW_GENERIC_VPN=1`; si no, el doctor avisa y no la elige.
- `cgnat`: rango `100.64.0.0/10` en un adaptador que no es LAN física.
- `routable`: nombre de VPN conocida con IP pública (Hamachi y Radmin usan rangos públicos). Se
  detecta y se lista, pero **nunca** se enlaza.

Reglas para el agente:

- Por defecto usa `candidates[0]`, que es lo que ya reflejan `tunnel` y `bindHost`.
- Con varias candidatas utilizables, el doctor emite un WARN y sugiere una IP por cada una; si el
  usuario prefiere otra, arranca el puente con `DSH_BIND_HOST=<ip>` (ver `setup-steps.md`).
- `candidates: []` con `ok: false` significa que no hay VPN privada: es el FAIL que hay que
  resolver antes de seguir.

Forma mínima (los valores son ejemplos, **no** los copies como si fueran de tu máquina; el
`receipt` se recalcula solo al generar el informe):

```json
{
  "tool": "dsh-companion-doctor",
  "reportVersion": 1,
  "ok": false,
  "nodeVersion": "24.21.0",
  "bridgeVersion": "",
  "apkVersion": "",
  "apkVersionCode": 0,
  "apkSha256": "",
  "certSha256Release": "4F:E1:AD:...",
  "phoneUrl": "",
  "tunnel": "",
  "candidates": [],
  "bindHost": "",
  "bridgePort": "57420",
  "panelPort": "57421",
  "checks": [
    { "id": "no-encuentro-node-js", "level": "FAIL", "message": "No encuentro Node.js." }
  ],
  "blockers": ["No encuentro Node.js."],
  "warnings": [],
  "generatedAt": "2026-01-01T00:00:00.0000000-06:00",
  "receipt": {
    "algorithm": "sha256",
    "canonical": "json-compact-sin-receipt",
    "sha256": "<64 hex en minúsculas>"
  }
}
```

## `receipt`: el informe es verificable

`receipt.sha256` es el SHA-256 del JSON compacto del informe **sin** el propio `receipt`, con las
claves en el orden en que se escriben. Cubre todos los demás campos, incluidos `apkSha256`,
`apkVersion`, `apkVersionCode`, `certSha256Release` y `generatedAt`: si alguien edita el informe, el
recibo deja de cuadrar. Verifícalo sin dependencias:

    node tools/verify-receipt.mjs doctor-report.json
    node tools/verify-receipt.mjs doctor-report.json --expect-apk-sha256 <hex>
    node tools/verify-receipt.mjs doctor-report.json --expect-cert <hex>

`--expect-apk-sha256` y `--expect-cert` son opcionales y sirven para atar el informe al APK
publicado. `tools/verify-receipt.mjs --self-test` no necesita archivos.

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
script (nunca el original). La variable de las interfaces es `$interfaces`:

```powershell
$tmp = Join-Path $env:TEMP 'doctor-notunnel'
New-Item -ItemType Directory -Force $tmp | Out-Null
Copy-Item doctor.ps1 (Join-Path $tmp 'doctor.ps1')
$text = Get-Content (Join-Path $tmp 'doctor.ps1') -Raw
$text = $text.Replace(
  '    $interfaces = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |' + "`r`n" +
  '        Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" }',
  '    $interfaces = @()')
Set-Content (Join-Path $tmp 'doctor.ps1') $text -Encoding UTF8
powershell -ExecutionPolicy Bypass -File (Join-Path $tmp 'doctor.ps1') -Json
```

Resultado esperado: un FAIL `No hay ninguna interfaz de VPN privada con IP utilizable.` y el AVISO
`Sin IP privada no se puede comprobar el puente todavia.` En el JSON, `candidates: []`,
`bindHost: ""` y `ok: false`. Ese JSON se pasa a `scripts/verify-fixes.mjs report <archivo>` para
confirmar que ambos mensajes tienen entrada.

## Otras ramas que se pueden forzar en una copia temporal

- Node ausente: vaciar `$nodeCandidates` y forzar `$nodeExe = ""`.
- Node antiguo: forzar el `if ($major -gt 22 -or ...)` a `$false`.
- Sin DSH_HOME: apuntar `$dshHome` a una ruta temporal inexistente.
- Sin credenciales: apuntar `DSH_HOME` a una carpeta temporal existente sin `.credentials.yaml`.
- Puerto ocupado por otro servicio: forzar el `if ($response.service -eq "dsh-companion")` a `$false`.
- Puente caído: arrancar el script con `DSH_BIND_HOST=127.0.0.90` (IP sin servicio).
- Panel caído: arrancar con `DSH_PANEL_PORT=1`.
- Varias candidatas: forzar `$interfaces` a dos entradas privadas y comprobar el WARN y que
  `candidates` trae las dos con su `kind`.

Nunca modifiques `doctor.ps1` del repo para probar estas ramas.

## Actualizado en 5.1.9

El JSON de `doctor.ps1 -Json` incluye además:

- `candidates[]`: todas las redes privadas detectadas (`ip`, `iface`, `kind`, `provider`). Cuando
  hay más de una, la elegida es `tunnel` y el aviso sugiere `DSH_BIND_HOST=<ip>` para fijarla.
- `bindHost`: la IP a la que se enlaza el puente (o loopback si está bloqueado).
- `apkSha256`, `apkVersion`, `apkVersionCode`: lo que sirve el puente en `/DSH-Companion.apk`.
- `certSha256Release`: huella del certificado de release.
- `receipt`: `{ algorithm, canonical, sha256 }`; `tools/verify-receipt.mjs` lo valida.

El recuento de mensajes del doctor que el mapa `doctor-fixes.json` debe cubrir es 16.
