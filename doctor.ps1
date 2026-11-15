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

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$fallos = 0
$portBridge = if ($env:DSH_LISTEN_PORT) { $env:DSH_LISTEN_PORT } else { "57420" }
$avisos = 0
function Ok($t)   { Write-Host "  [ OK ] $t" -ForegroundColor Green }
function Bad($t)  { Write-Host "  [FALLA] $t" -ForegroundColor Red; $script:fallos++ }
function Warn($t) { Write-Host "  [AVISO] $t" -ForegroundColor Yellow; $script:avisos++ }
function Info($t) { Write-Host "         $t" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "== 1. Node.js ==" -ForegroundColor Cyan
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

Write-Host ""
Write-Host "== 2. DeepSeek Harness ==" -ForegroundColor Cyan
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

Write-Host ""
Write-Host "== 3. Tunel privado (ZeroTier o Tailscale) ==" -ForegroundColor Cyan
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
    Write-Host ("         {0,-22} {1,-16} {2}" -f $name, $ip, $(if ($isTunnel) { "tunel" } elseif ($isGeneric) { "vpn generica" } elseif ($isCgnat) { "CGNAT (Tailscale)" } else { "" })) -ForegroundColor DarkGray
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

Write-Host ""
Write-Host "== 4. Puente ==" -ForegroundColor Cyan
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

Write-Host ""
Write-Host "== 4b. Firewall de Windows ==" -ForegroundColor Cyan
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

Write-Host ""
Write-Host "== 5. Panel de emparejamiento ==" -ForegroundColor Cyan
$panelPort = if ($env:DSH_PANEL_PORT) { $env:DSH_PANEL_PORT } else { "57421" }
$panelOpen = Test-NetConnection -ComputerName 127.0.0.1 -Port ([int]$panelPort) -InformationLevel Quiet -WarningAction SilentlyContinue
if ($panelOpen) { Ok "Panel escuchando en 127.0.0.1:$panelPort" }
else { Bad "El panel no esta escuchando en el puerto $panelPort"; Info "Solo abre escuchando en loopback: arranca el puente y ejecuta panel.bat" }

Write-Host ""
Write-Host "== 6. Resumen ==" -ForegroundColor Cyan
Write-Host ""
if ($fallos -eq 0) {
    Write-Host "  TODO LISTO para conectar el telefono." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Direccion para el telefono:  " -NoNewline
    Write-Host "http://${privateIp}:57420" -ForegroundColor Cyan
    Write-Host "  APK:                         " -NoNewline
    Write-Host "https://github.com/TintaYNodos/dsh-mobile-companion/releases" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Pasos:" -ForegroundColor White
    Write-Host "   1. Instala el APK (o abre la direccion en el navegador del telefono)."
    Write-Host "   2. El telefono mostrara un codigo de 4 digitos."
    Write-Host "   3. En la computadora ejecuta panel.bat y pulsa Autorizar en la solicitud que coincide."
    Write-Host "   4. Ajustes -> Notificaciones de la PC -> Probar desde la PC."
    Write-Host ""
    exit 0
} else {
    Write-Host "  FALTAN $fallos COSAS. Corrige lo marcado en rojo y vuelve a ejecutar este diagnostico." -ForegroundColor Red
    if ($avisos -gt 0) { Write-Host "  ($avisos aviso(s) en amarillo no bloquean la instalacion)" -ForegroundColor Yellow }
    Write-Host ""
    exit 1
}
