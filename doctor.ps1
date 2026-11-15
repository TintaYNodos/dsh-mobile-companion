# ==============================================================================
# DSH Mobile Companion - doctor.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Diagnostico previo a la instalacion. Comprueba lo que hace falta para que el
# telefono llegue al puente y, si algo falta, dice exactamente que hacer.
#
#   powershell -ExecutionPolicy Bypass -File doctor.ps1
#
# Codigo de salida: 0 = todo listo, 1 = falta algo (con instrucciones).
# ==============================================================================

param(
    [switch]$Json,    # salida JSON para agentes de IA
    [switch]$Report   # escribe doctor-report.json
)

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$fallos = 0
$portBridge = if ($env:DSH_LISTEN_PORT) { $env:DSH_LISTEN_PORT } else { "57420" }
$avisos = 0
$script:lines = New-Object System.Collections.ArrayList
function Ok($t)   { [void]$script:lines.Add("OK|$t");   if (-not $Json) { Write-Host "  [ OK ] $t" -ForegroundColor Green } }
function Bad($t)  { [void]$script:lines.Add("FAIL|$t"); $script:fallos++; if (-not $Json) { Write-Host "  [FALLA] $t" -ForegroundColor Red } }
function Warn($t) { [void]$script:lines.Add("WARN|$t"); $script:avisos++; if (-not $Json) { Write-Host "  [AVISO] $t" -ForegroundColor Yellow } }
function Info($t) { [void]$script:lines.Add("INFO|$t"); if (-not $Json) { Write-Host "         $t" -ForegroundColor DarkGray } }
function Out($msg, $color) { if (-not $Json) { if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg } } }

# ==============================================================================
# Recibo verificable del informe
#
# El recibo hashea una forma canonica del informe: JSON compacto (sin espacios
# ni saltos de linea) del objeto completo MENOS el campo "receipt", con las
# mismas claves y el mismo orden en que se escribe doctor-report.json. Es el
# equivalente exacto de JSON.stringify(JSON.parse(archivo) sin receipt) en Node,
# para que tools/verify-receipt.mjs lo recalcule sin depender de PowerShell.
#
# No se usa ConvertTo-Json para el canon: Windows PowerShell 5.1 escapa <, >, &
# y la comilla simple como \u00XX y Node no, asi que el hash no cuadraria.
# ==============================================================================
function ConvertTo-CanonicalString {
    param([string]$Text)
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $Text.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '"')      { [void]$sb.Append('\"') }
        elseif ($ch -eq '\')  { [void]$sb.Append('\\') }
        elseif ($code -eq 8)  { [void]$sb.Append('\b') }
        elseif ($code -eq 9)  { [void]$sb.Append('\t') }
        elseif ($code -eq 10) { [void]$sb.Append('\n') }
        elseif ($code -eq 12) { [void]$sb.Append('\f') }
        elseif ($code -eq 13) { [void]$sb.Append('\r') }
        elseif ($code -lt 32) { [void]$sb.Append('\u' + $code.ToString("x4")) }
        else                  { [void]$sb.Append($ch) }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function ConvertTo-CanonicalJson {
    param($Value)
    if ($null -eq $Value) { return "null" }
    if ($Value -is [bool]) {
        if ($Value) { return "true" } else { return "false" }
    }
    if ($Value -is [string]) { return ConvertTo-CanonicalString $Value }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal]) {
        return [Convert]::ToString($Value, [Globalization.CultureInfo]::InvariantCulture)
    }
    if ($Value -is [System.Collections.IDictionary]) {
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($key in $Value.Keys) {
            $parts.Add((ConvertTo-CanonicalString ([string]$key)) + ":" + (ConvertTo-CanonicalJson $Value[$key]))
        }
        return "{" + ($parts -join ",") + "}"
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($item in $Value) { $parts.Add((ConvertTo-CanonicalJson $item)) }
        return "[" + ($parts -join ",") + "]"
    }
    return ConvertTo-CanonicalString ([string]$Value)
}

function Get-Sha256Hex {
    param([string]$Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
        return ([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

# Huella SHA-256 del certificado del keystore de release: dato documental, no se
# lee del keystore (el doctor no necesita la clave privada). Es la que publican
# RELEASE_5.1.7.md, README y SECURITY.md; actualizala cuando cambie la firma.
$certSha256Release = "4F:E1:AD:C0:45:71:AF:2B:89:1B:E4:6B:1B:3C:86:39:65:F6:73:A6:B7:25:87:61:47:96:91:7F:49:63:65:23"

Out ""
Out "== 1. Node.js ==" Cyan
$nodeExe = ""
$nodeCandidates = @(
    (Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"),
    (Join-Path $env:ProgramFiles "nodejs\node.exe")
)
foreach ($candidate in $nodeCandidates) { if (Test-Path $candidate) { $nodeExe = $candidate; break } }
if (-not $nodeExe) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $nodeExe = $cmd.Source }
}
if (-not $nodeExe) {
    Bad "No encuentro Node.js."
    Info "Instala Node 22.15 o superior desde https://nodejs.org (LTS actual)."
} else {
    $raw = (& $nodeExe --version 2>$null)
    $version = ($raw -replace "^v", "").Trim()
    $parts = $version.Split(".")
    $major = [int]$parts[0]; $minor = [int]$parts[1]
    if ($major -gt 22 -or ($major -eq 22 -and $minor -ge 15)) {
        Ok "Node v$version ($nodeExe)"
    } else {
        Bad "Node v$version es antiguo. Hace falta 22.15 o superior (zstd nativo para los avisos)."
        Info "Descarga el LTS desde https://nodejs.org"
    }
}

Out ""
Out "== 2. DeepSeek Harness ==" Cyan
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE ".dsh" }
if (-not (Test-Path $dshHome)) {
    Bad "No existe el directorio de DSH: $dshHome"
    Info "Abre DeepSeek Harness en esta computadora al menos una vez."
} else {
    Ok "DSH_HOME: $dshHome"
    $credentials = Join-Path $dshHome ".credentials.yaml"
    if (Test-Path $credentials) { Ok "Credenciales de Harness encontradas" }
    else {
        Bad "Falta $credentials"
        Info "Abre DeepSeek Harness y verifica que hayas iniciado sesion; el archivo se genera solo."
    }
    $keyFile = Join-Path $dshHome "companion-access-key"
    if (Test-Path $keyFile) { Ok "Clave de acceso del puente presente" }
    else { Warn "Aun no hay clave de acceso: se genera en el primer arranque del puente." }
}

Out ""
Out "== 3. Tunel privado (ZeroTier o Tailscale) ==" Cyan
$privateIp = ""
$ifaceName = ""
$candidates = @()
try {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" }
} catch {
    $candidates = @()
}
foreach ($entry in $candidates) {
    $name = [string]$entry.InterfaceAlias
    $ip = [string]$entry.IPAddress
    $isTunnel = $name -match "(?i)zerotier|tailscale|wireguard|^zt[a-z0-9]|^ts[0-9]|^wg[0-9]"
    $isGeneric = $name -match "(?i)openvpn|^tun[0-9]|^tap[0-9]"
    $isCgnat = $ip -match "^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\."
    if (-not $Json) { Write-Host ("         {0,-22} {1,-16} {2}" -f $name, $ip, $(if ($isTunnel) { "tunel" } elseif ($isGeneric) { "vpn generica" } elseif ($isCgnat) { "CGNAT (Tailscale)" } else { "" })) -ForegroundColor DarkGray }
    if ($isTunnel -or $isCgnat) {
        if (-not $privateIp) { $privateIp = $ip; $ifaceName = $name }
    }
}
if ($privateIp) {
    Ok "Tunel detectado: $ifaceName -> $privateIp"
} else {
    Bad "No hay ninguna interfaz de ZeroTier ni Tailscale con IP privada."
    Info "Sin tunel el telefono no puede llegar a la computadora. Elige uno:"
    Info ""
    Info "  ZeroTier:  instala https://www.zerotier.com/download/ en la PC y en el telefono,"
    Info "             crea una red en https://my.zerotier.com y une los dos equipos a ella."
    Info "             Marca la red como privada y autoriza cada nodo a mano."
    Info "  Tailscale: instala https://tailscale.com/download en la PC y en el telefono,"
    Info "             inicia sesion con la misma cuenta en ambos y comparte el equipo."
    Info ""
    Info "Despues de conectarlos, vuelve a ejecutar este diagnostico."
}
$bindOverride = $env:DSH_BIND_HOST
if ($bindOverride) {
    Warn "DSH_BIND_HOST esta fijado a $bindOverride; se usara esa IP en vez de la detectada."
    $privateIp = $bindOverride
}

Out ""
Out "== 4. Puente ==" Cyan
if (-not $privateIp) {
    Warn "Sin IP privada no se puede comprobar el puente todavia."
} else {
    $url = "http://${privateIp}:57420/dsh-companion/status"
    $headers = @{}
    $keyPath = Join-Path $dshHome "companion-access-key"
    if (Test-Path $keyPath) {
        $accessKey = (Get-Content $keyPath -Raw).Trim()
        if ($accessKey) {
            $headers["Authorization"] = "Basic " + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("dsh:" + $accessKey))
        }
    }
    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 5
        if ($response.service -eq "dsh-companion") { Ok "El puente responde en $url (version $($response.version))" }
        else { Bad "Ese puerto responde, pero no es DSH Companion." }
    } catch {
        Bad "El puente no responde en $url"
        Info "Arrancalo con: install-autostart.bat  (o start.bat para ver la consola)"
    }
    if ($response -and $response.dshOnline -eq $false) {
        Warn "El puente esta vivo pero DeepSeek Harness no contesta. Abrelo en la computadora."
    }
}

Out ""
Out "== 4b. Firewall de Windows ==" Cyan
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    try {
        $portFilter = Get-NetFirewallPortFilter -ErrorAction Stop | Where-Object { $_.LocalPort -eq $portBridge }
        if ($portFilter) { Ok "Hay regla de firewall para el puerto $portBridge" }
        else {
            Warn "No hay ninguna regla de firewall para el puerto $portBridge."
            Info "Windows puede bloquear la conexion entrante del telefono. Al arrancar el puente por"
            Info "primera vez suele salir un aviso: elige Permitir en redes privadas. Si no salio,"
            Info "ejecuta como administrador:"
            Info "  netsh advfirewall firewall add rule name=\"DSH Companion\" dir=in action=allow protocol=TCP localport=$portBridge"
        }
    } catch {
        Warn "No se pudo consultar el firewall (puede requerir permisos). Si el telefono no conecta, revisa la regla del puerto $portBridge."
    }
}

Out ""
Out "== 5. Panel de emparejamiento ==" Cyan
$panelPort = if ($env:DSH_PANEL_PORT) { $env:DSH_PANEL_PORT } else { "57421" }
$panelOpen = Test-NetConnection -ComputerName 127.0.0.1 -Port ([int]$panelPort) -InformationLevel Quiet -WarningAction SilentlyContinue
if ($panelOpen) { Ok "Panel escuchando en 127.0.0.1:$panelPort" }
else { Bad "El panel no esta escuchando en el puerto $panelPort"; Info "Solo abre escuchando en loopback: arranca el puente y ejecuta panel.bat" }

Out ""
Out "== 6. Resumen ==" Cyan
Out ""
# Informe legible por maquinas: el agente de IA no tiene que interpretar texto.
$checks = @()
foreach ($line in $script:lines) {
    $split = [string]$line -split "\|", 2
    if ($split.Count -eq 2) {
        $msg = $split[1].Trim()
        $slug = ($msg -replace "[^A-Za-z0-9]+", "-").Trim("-").ToLower()
        if ($slug.Length -gt 60) { $slug = $slug.Substring(0, 60) }
        $checks += [ordered]@{ id = $slug; level = $split[0].Trim(); message = $msg }
    }
}
$doctorReport = [ordered]@{
    tool          = "dsh-companion-doctor"
    reportVersion = 1
    ok            = ($fallos -eq 0)
    nodeVersion   = $version
    bridgeVersion = $(if ($response) { $response.version } else { "" })
    # Hashes y version del APK que el puente sirve de verdad (no del release de
    # GitHub): salen de /dsh-companion/status, la misma respuesta que ya se consulta.
    apkVersion    = $(if ($response) { [string]$response.apkVersion } else { "" })
    apkVersionCode= $(if ($response) { [int]$response.apkVersionCode } else { 0 })
    apkSha256     = $(if ($response) { [string]$response.apkSha256 } else { "" })
    certSha256Release = $certSha256Release
    phoneUrl      = $(if ($privateIp) { "http://${privateIp}:57420" } else { "" })
    tunnel        = $(if ($privateIp) { $ifaceName } else { "" })
    bindHost      = $privateIp
    bridgePort    = $portBridge
    panelPort     = $panelPort
    checks        = $checks
    blockers      = @($checks | Where-Object { $_.level -eq "FAIL" } | ForEach-Object { $_.message })
    warnings      = @($checks | Where-Object { $_.level -eq "WARN" } | ForEach-Object { $_.message })
    generatedAt   = (Get-Date).ToString("o")
}
# Recibo: se calcula sobre el informe SIN el campo receipt y se agrega al final,
# de modo que el hash cubra exactamente los campos que el archivo dice cubrir.
$canonicalJson = ConvertTo-CanonicalJson $doctorReport
$doctorReport["receipt"] = [ordered]@{
    algorithm = "sha256"
    canonical = "json-compact-sin-receipt"
    sha256    = Get-Sha256Hex $canonicalJson
}
$reportJson = $doctorReport | ConvertTo-Json -Depth 8
if ($Report) {
    # Sin BOM: JSON.parse() (Node, Python, jq...) funciona sin limpieza previa.
    # En Windows PowerShell 5.1, Set-Content -Encoding UTF8 antepone BOM.
    $reportPath = Join-Path $PSScriptRoot "doctor-report.json"
    [System.IO.File]::WriteAllText($reportPath, $reportJson, (New-Object System.Text.UTF8Encoding($false)))
}
if ($Json) {
    $reportJson
    if ($fallos -eq 0) { exit 0 } else { exit 1 }
}

if ($fallos -eq 0) {
    Out "  TODO LISTO para conectar el telefono." Green
    Out ""
    Write-Host "  Direccion para el telefono:  " -NoNewline
    Out "http://${privateIp}:57420" Cyan
    Write-Host "  APK:                         " -NoNewline
    Out "https://github.com/TintaYNodos/dsh-mobile-companion/releases" Cyan
    Out ""
    Out "  Pasos:" White
    Write-Host "   1. Instala el APK (o abre la direccion en el navegador del telefono)."
    Write-Host "   2. El telefono mostrara un codigo de 4 digitos."
    Write-Host "   3. En la computadora ejecuta panel.bat y pulsa Autorizar en la solicitud que coincide."
    Write-Host "   4. Ajustes -> Notificaciones de la PC -> Probar desde la PC."
    Out ""
    exit 0
} else {
    Out "  FALTAN $fallos COSAS. Corrige lo marcado en rojo y vuelve a ejecutar este diagnostico." Red
    if ($avisos -gt 0) { Out "  ($avisos aviso(s) en amarillo no bloquean la instalacion)" Yellow }
    Out ""
    exit 1
}
