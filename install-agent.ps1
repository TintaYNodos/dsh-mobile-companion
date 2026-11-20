# ==============================================================================
# DSH Mobile Companion - install-agent.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Via oficial de instalacion para agentes de IA en Windows. Instala DSH Mobile
# Companion de extremo a extremo, de forma idempotente y con evidencia que una
# maquina puede verificar: JSON por stdout, log sin secretos y codigos de salida
# documentados.
#
# Uso basico:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -DryRun -Json
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json -SkipClone
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json -RegisterAutostart
#   powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json -Port 57422 -Force
#
# Modos:
#   -DryRun             No escribe nada: valida parametros, ejecuta el preflight y
#                       muestra el plan de instalacion. No crea log.
#   -SkipClone          Usa una copia existente del repo (en -Dir o en la carpeta
#                       de este script) en vez de clonar/actualizar.
#   -RegisterAutostart  Crea o actualiza el acceso directo de Inicio (unico paso
#                       fuera del directorio de instalacion; no se pide admin).
#   -Port <n>           Puerto del puente para esta ejecucion y para el inicio
#                       automatico si se usa junto con -RegisterAutostart.
#   -Force              Reinstala: detiene el puente, actualiza el repo al commit
#                       oficial y lo vuelve a arrancar. Un uso interactivo normal
#                       no lo necesita.
#   -Json               Salida JSON unica por stdout (ni logs ni textos sueltos).
#   -Dir <ruta>         Directorio de instalacion. Por defecto:
#                       %LOCALAPPDATA%\DSH-Companion. Debe ser ruta absoluta.
#   -RepoUrl <url>      Solo se admite el repo oficial; cualquier otra URL se
#                       rechaza como parametro invalido (salida 4).
#   -Help               Muestra la ayuda y sale con 0.
#
# CONTRATO JSON (-Json)
# ---------------------
# stdout contiene UN solo objeto JSON valido, sin BOM:
#
#   {
#     "ok": true|false,                 // instalacion/verificacion completa
#     "version": "1.0.0",              // version de este contrato de instalador
#     "steps": [                        // pasos de alto nivel en orden
#       { "name": "...", "status": "ok|skipped|failed|warning|planned", "detail": "..." }
#     ],
#     "checks": [                       // comprobaciones puntuales
#       { "id": "...", "ok": true|false, "detail": "..." }
#     ],
#     "exitCode": 0,                    // mismo valor que el codigo de proceso
#     ...campos extra informativos: tool, mode, generatedAt, installDir, repoDir,
#     repoUrl, productVersion, repoCommit, repoTag, nodeVersion, bridgePort,
#     bridgeStarted, bridgeVersion, doctorOk, doctorReport, receipt, autostart,
#     logFile, warnings[]
#   }
#
# Si algo falla, el JSON sigue siendo valido y lleva "ok": false y "exitCode"
# igual al codigo de proceso. En modo -Json no se imprime ningun otro texto por
# stdout: los textos humanos van al log (si se escribe) o a ningun sitio.
# Un check con ok=false no siempre implica fallo global (por ejemplo, el recibo
# no es verificable si la copia del repo no incluye el APK, que no se versiona):
# el codigo de salida y "ok" mandan, y el motivo queda en "warnings".
#
# Codigos de salida:
#   0 = instalacion y verificacion correctas.
#   1 = error de preflight (entorno: Windows, PowerShell 5.1+, 64 bits, Node
#       22.15+, git si hace falta clonar, espacio libre).
#   2 = instalacion fallida (repo, copia de seguridad, arranque del puente,
#       inicio automatico).
#   3 = verificacion fallida (/healthz, doctor.ps1 -Json o recibo).
#   4 = parametros invalidos (tambien opciones desconocidas o repetidas).
#
# Que hace, en orden:
#   1. Valida parametros y resuelve el directorio de instalacion.
#   2. Preflight: sistema, PowerShell, arquitectura, Node (incluido el runtime
#      empaquetado de DSH), git, espacio libre y deteccion de DeepSeek Harness
#      por puerto/credenciales (sin leer su contenido).
#   3. Localiza, clona o actualiza el repo en el directorio de instalacion.
#   4. Respeta el registro de dispositivos: no lo modifica. Si existe, guarda una
#      copia verificable (como mucho una cada 24 h) con backup.ps1.
#   5. Arranca el puente de forma oculta (run-hidden.vbs) con reintentos y
#      verifica GET http://127.0.0.1:<puerto>/healthz con timeout.
#   6. Ejecuta doctor.ps1 -Json -Report y tools/verify-receipt.mjs si existen.
#   7. Con -RegisterAutostart, registra el acceso directo de Inicio sin duplicar.
#   8. NO empareja ningun telefono: el emparejamiento es una accion humana en el
#      panel (panel.bat).
#
# Idempotencia:
#   - Un repo valido no se vuelve a clonar; con -SkipClone se usa tal cual.
#   - Un puente ya arrancado desde este repo no se duplica.
#   - El acceso directo de Inicio se escribe solo si falta o si no coincide.
#   - El respaldo del registro se omite si hay uno reciente.
#   - Reejecutar sin -Force no pisa datos del usuario ni el registro.
#
# Seguridad:
#   - No imprime ni lee claves, cookies, tokens ni .credentials.yaml: solo
#     comprueba si esos archivos existen. El log se redacta por si acaso.
#   - No pide elevacion ni ejecuta netsh/runas. -RegisterAutostart escribe en el
#     perfil del usuario y no necesita administrador.
#   - No descarga binarios: solo hace git clone/fetch del repo oficial.
#   - Verifica que el origen del repo sea el oficial y, si HEAD tiene un tag, que
#     ese tag apunte al mismo commit.
#   - Emparejar no es automatico; no se ejecuta el kill switch.
#
# Logs:
#   %TEMP%\dsh-companion-install-<AAAAMMDD-HHMMSS>.log, UTF-8 sin BOM, sin
#   secretos. -DryRun no escribe log. Con -Json el log nunca va a stdout.
#
# Tests: test/verify_install_agent.ps1 (sintaxis, -DryRun -Json, parametros
# invalidos y comprobaciones estaticas). No hace falta red ni puente.
# ==============================================================================

# ------------------------------------------------------------------------------
# Constantes y estado
# ------------------------------------------------------------------------------

$script:InstallerVersion = "1.0.0"
$script:ToolName = "dsh-companion-install-agent"
$script:OfficialRepoUrl = "https://github.com/TintaYNodos/dsh-mobile-companion.git"
$script:OfficialBranch = "main"
$script:DefaultPort = 57420
$script:MinNodeMajor = 22
$script:MinNodeMinor = 15
$script:MinFreeBytes = [long](200 * 1024 * 1024)
$script:HealthTimeoutSeconds = 60
$script:BackupMaxAgeHours = 24
$script:AutostartFileName = "DSH-Mobile-Companion.lnk"
$script:BridgeLogTailLines = 20

$script:Json = $false
$script:DryRun = $false
$script:SkipClone = $false
$script:RegisterAutostart = $false
$script:Force = $false
$script:Help = $false
$script:DirBound = $false
$script:Dir = ""
$script:PortBound = $false
$script:Port = 0
$script:ResolvedPort = 0
$script:RepoUrl = $script:OfficialRepoUrl
$script:RepoDir = ""
$script:RepoMode = ""
$script:RepoCommit = ""
$script:RepoTag = ""
$script:ProductVersion = ""
$script:NodeExe = ""
$script:NodeVersion = ""
$script:GitExe = ""
$script:GitVersion = ""
$script:LogPath = ""
$script:LogEncoding = $null
$script:DshHome = ""
$script:DshPort = 0
$script:DshIdentity = ""
$script:StartedBridge = $false
$script:BridgeWasRunning = $false
$script:AutostartRegistered = $false
$script:AutostartPath = ""
$script:Health = $null
$script:Doctor = $null
$script:DoctorReportPath = ""
$script:Receipt = $null
$script:Stage = "params"
$script:ParseWarning = ""
$script:PreflightFailed = $false
$script:Steps = New-Object System.Collections.ArrayList
$script:Checks = New-Object System.Collections.ArrayList
$script:Warnings = New-Object System.Collections.ArrayList

# ------------------------------------------------------------------------------
# Salida humana, log y redaccion de secretos
# ------------------------------------------------------------------------------

function Write-Human {
    param([string]$Text = "", [string]$Color = "")
    if ($script:Json) { return }
    if ($Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}

function Remove-SecretPatterns {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $clean = $Text
    $clean = [regex]::Replace($clean, "(?i)((?:authorization|cookie|token|clave|key|password|secret|passwd|pwd)\s*[:=]\s*)([^\s,;]+)", '$1***')
    $clean = [regex]::Replace($clean, "(?i)(\bbasic\s+)[A-Za-z0-9+/=]{8,}", '$1***')
    return $clean
}

function Limit-Text {
    param([string]$Text, [int]$Max = 400)
    if ($null -eq $Text) { return "" }
    $value = ([string]$Text).Trim()
    if ($value.Length -le $Max) { return $value }
    return $value.Substring(0, $Max) + "..."
}

function Write-Log {
    param([string]$Message)
    if ([string]::IsNullOrEmpty($script:LogPath)) { return }
    if ($null -eq $script:LogEncoding) { return }
    try {
        $line = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffK") + " " + (Remove-SecretPatterns $Message)
        [System.IO.File]::AppendAllText($script:LogPath, $line + [Environment]::NewLine, $script:LogEncoding)
    } catch {
        # Un fallo de log nunca debe tumbar la instalacion.
    }
}

function Initialize-Log {
    $result = [ordered]@{ ok = $false; path = ""; error = "" }
    $tempDir = [System.IO.Path]::GetTempPath()
    if ([string]::IsNullOrEmpty($tempDir)) { $result.error = "no hay carpeta TEMP"; return $result }
    $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
    $candidate = Join-Path $tempDir ("dsh-companion-install-" + $stamp + ".log")
    $script:LogEncoding = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($candidate, "", $script:LogEncoding)
        $script:LogPath = $candidate
        $result.ok = $true
        $result.path = $candidate
    } catch {
        $script:LogPath = ""
        $result.error = $_.Exception.Message
    }
    return $result
}

# ------------------------------------------------------------------------------
# Registro de pasos, comprobaciones y avisos
# ------------------------------------------------------------------------------

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    $clean = Limit-Text (Remove-SecretPatterns $Detail) 1200
    [void]$script:Steps.Add([ordered]@{ name = $Name; status = $Status; detail = $clean })
    Write-Log ("STEP " + $Status + " " + $Name + ": " + $clean)
    $tag = "INFO "
    $color = "Gray"
    switch ($Status) {
        "ok"      { $tag = " OK "; $color = "Green" }
        "skipped" { $tag = "SALTA"; $color = "DarkGray" }
        "failed"  { $tag = "FALLA"; $color = "Red" }
        "warning" { $tag = "AVISO"; $color = "Yellow" }
        "planned" { $tag = "PLAN "; $color = "Cyan" }
    }
    Write-Human ("  [" + $tag + "] " + $Name + ": " + $clean) $color
}

function Add-Check {
    param([string]$Id, [bool]$Ok, [string]$Detail = "")
    $clean = Limit-Text (Remove-SecretPatterns $Detail) 800
    [void]$script:Checks.Add([ordered]@{ id = $Id; ok = [bool]$Ok; detail = $clean })
    Write-Log ("CHECK " + $(if ($Ok) { "ok " } else { "fail" }) + " " + $Id + ": " + $clean)
    if ($Ok) { Write-Human ("  [ OK ] " + $Id + ": " + $clean) "Green" }
    else { Write-Human ("  [FALLA] " + $Id + ": " + $clean) "Red" }
    return $Ok
}

function Add-Warning {
    param([string]$Message)
    $clean = Limit-Text (Remove-SecretPatterns $Message) 800
    if ([string]::IsNullOrEmpty($clean)) { return }
    [void]$script:Warnings.Add($clean)
    Write-Log ("WARN " + $clean)
    Write-Human ("  [AVISO] " + $clean) "Yellow"
}

# ------------------------------------------------------------------------------
# Utilidades de lectura
# ------------------------------------------------------------------------------

function Read-TextFileAny {
    param([string]$Path)
    if ([string]::IsNullOrEmpty($Path)) { return "" }
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        if ($null -eq $bytes -or $bytes.Length -eq 0) { return "" }
        $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
        try { $text = $strictUtf8.GetString($bytes) } catch { $text = [System.Text.Encoding]::Default.GetString($bytes) }
        return ([string]$text).TrimStart([char]0xFEFF)
    } catch {
        return ""
    }
}

function Get-Field {
    param($Object, [string]$Name, $Default = $null)
    if ($null -eq $Object) { return $Default }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $Default
    }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $Default }
    return $property.Value
}

function Get-ListField {
    param($Object, [string]$Name)
    $value = Get-Field $Object $Name $null
    if ($null -eq $value) { return @() }
    return @($value)
}

function Get-PowerShellHostPath {
    if (-not [string]::IsNullOrEmpty($env:SystemRoot)) {
        $legacy = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
        if (Test-Path -LiteralPath $legacy -PathType Leaf) { return $legacy }
    }
    try {
        $self = (Get-Process -Id $PID).Path
        if (-not [string]::IsNullOrEmpty([string]$self)) { return [string]$self }
    } catch { }
    return "powershell.exe"
}

function Get-NewTempFilePath {
    param([string]$Prefix)
    $tempDir = [System.IO.Path]::GetTempPath()
    return (Join-Path $tempDir ($Prefix + "-" + [guid]::NewGuid().ToString("N") + ".tmp"))
}

# ------------------------------------------------------------------------------
# Parseo estricto de parametros
#
# No se usa un bloque param() a proposito: un parametro desconocido o mal
# escrito en param() aborta antes de que el script pueda emitir JSON, y el
# contrato exige JSON valido tambien para errores de parametros (salida 4).
# ------------------------------------------------------------------------------

function Get-UsageText {
    $lines = New-Object System.Collections.ArrayList
    [void]$lines.Add("DSH Mobile Companion - install-agent.ps1 " + $script:InstallerVersion)
    [void]$lines.Add("")
    [void]$lines.Add("Uso:")
    [void]$lines.Add("  powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 [opciones]")
    [void]$lines.Add("")
    [void]$lines.Add("Opciones:")
    [void]$lines.Add("  -DryRun              No escribe nada; valida el entorno y muestra el plan.")
    [void]$lines.Add("  -Json                Salida JSON unica por stdout.")
    [void]$lines.Add("  -SkipClone           Usa el repo existente en -Dir o junto a este script.")
    [void]$lines.Add("  -RegisterAutostart   Registra el inicio automatico (acceso directo de Inicio).")
    [void]$lines.Add("  -Port <n>            Puerto del puente (1024-65535).")
    [void]$lines.Add("  -Force               Reinstala: detiene el puente, actualiza el repo y lo arranca.")
    [void]$lines.Add("  -Dir <ruta>          Directorio de instalacion (por defecto %LOCALAPPDATA%\DSH-Companion).")
    [void]$lines.Add("  -RepoUrl <url>       Solo se admite https://github.com/TintaYNodos/dsh-mobile-companion.git")
    [void]$lines.Add("  -Help                Muestra esta ayuda.")
    [void]$lines.Add("")
    [void]$lines.Add("Codigos de salida: 0 ok, 1 preflight, 2 instalacion, 3 verificacion, 4 parametros.")
    return @($lines)
}

function Parse-Arguments {
    param([object[]]$RawArgs)
    $result = [ordered]@{
        ok = $false
        error = ""
        warning = ""
        help = $false
        json = $false
        dryRun = $false
        skipClone = $false
        registerAutostart = $false
        force = $false
        dir = ""
        dirBound = $false
        port = 0
        portBound = $false
        repoUrl = $script:OfficialRepoUrl
    }
    $seen = @{}
    $switches = @("-json", "-dryrun", "-skipclone", "-registerautostart", "-force")
    $valued = @("-dir", "-port", "-repourl")
    $index = 0
    while ($index -lt $RawArgs.Count) {
        $raw = $RawArgs[$index]
        $text = ""
        if ($null -ne $raw) { $text = ([string]$raw).Trim() }
        $index++
        if ($text -eq "") { $result.error = "Hay un argumento vacio."; return $result }
        if (-not $text.StartsWith("-")) {
            $result.error = "Argumento no reconocido: '" + $text + "'. Las rutas van despues de -Dir."
            return $result
        }
        $name = $text
        $inline = $null
        $colon = $text.IndexOf(":")
        if ($colon -ge 0) {
            $name = $text.Substring(0, $colon)
            $inline = $text.Substring($colon + 1)
        }
        $lower = $name.ToLowerInvariant()
        if ($lower -eq "-help" -or $lower -eq "-h" -or $lower -eq "-?") {
            if ($null -ne $inline) { $result.error = "La opcion " + $name + " no acepta valor."; return $result }
            $result.help = $true
            continue
        }
        if ($switches -contains $lower) {
            if ($null -ne $inline) {
                $result.error = "La opcion " + $name + " no acepta valor."
                return $result
            }
            if ($seen.ContainsKey($lower)) { $result.error = "Opcion repetida: " + $name + "."; return $result }
            $seen[$lower] = $true
            switch ($lower) {
                "-json" { $result.json = $true }
                "-dryrun" { $result.dryRun = $true }
                "-skipclone" { $result.skipClone = $true }
                "-registerautostart" { $result.registerAutostart = $true }
                "-force" { $result.force = $true }
            }
            continue
        }
        if ($valued -contains $lower) {
            if ($seen.ContainsKey($lower)) { $result.error = "Opcion repetida: " + $name + "."; return $result }
            $value = ""
            if ($null -ne $inline) {
                if ($inline -eq "") { $result.error = "Falta el valor de " + $name + "."; return $result }
                $value = $inline
            } else {
                if ($index -ge $RawArgs.Count) { $result.error = "Falta el valor de " + $name + "."; return $result }
                $next = $RawArgs[$index]
                $nextText = ""
                if ($null -ne $next) { $nextText = ([string]$next).Trim() }
                if ($nextText -match '^-') { $result.error = "Falta el valor de " + $name + "."; return $result }
                $value = $nextText
                $index++
            }
            $seen[$lower] = $true
            switch ($lower) {
                "-dir" { $result.dir = $value; $result.dirBound = $true }
                "-port" { $result.port = $value; $result.portBound = $true }
                "-repourl" { $result.repoUrl = $value }
            }
            continue
        }
        $result.error = "Opcion desconocida: " + $name + ". Usa -Help para ver las opciones."
        return $result
    }

    if ($result.dirBound) {
        $dirValue = [string]$result.dir
        if (-not [System.IO.Path]::IsPathRooted($dirValue)) {
            $result.error = "El valor de -Dir debe ser una ruta absoluta (por ejemplo C:\carpeta\DSH-Companion)."
            return $result
        }
        $full = ""
        try { $full = [System.IO.Path]::GetFullPath($dirValue) } catch {
            $result.error = "El valor de -Dir no es una ruta valida: " + $_.Exception.Message
            return $result
        }
        $full = $full.TrimEnd([char]'\')
        if ($full -match '^[A-Za-z]:$' -or $full -eq "" -or $full -match '^\\\\[^\\]+\\[^\\]+$') {
            $result.error = "El valor de -Dir no puede ser la raiz de una unidad ni un recurso de red."
            return $result
        }
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            $result.error = "El valor de -Dir apunta a un archivo: " + $full
            return $result
        }
        if (-not $result.skipClone) {
            $current = ""
            try { $current = [System.IO.Path]::GetFullPath((Get-Location).Path).TrimEnd([char]'\') } catch { $current = "" }
            if ($current -ne "" -and $full -eq $current) {
                $result.error = "El directorio de instalacion no puede ser el directorio actual. Usa otra ruta o -SkipClone."
                return $result
            }
        }
        $result.dir = $full
    }

    if ($result.portBound) {
        $portText = [string]$result.port
        if ($portText -notmatch '^\d{1,5}$') {
            $result.error = "El valor de -Port debe ser un numero entero entre 1 y 65535."
            return $result
        }
        $portNumber = [int]$portText
        if ($portNumber -lt 1 -or $portNumber -gt 65535) {
            $result.error = "El valor de -Port debe estar entre 1 y 65535."
            return $result
        }
        if ($portNumber -lt 1024) { $result.warning = "El puerto " + [string]$portNumber + " es privilegiado; se recomienda uno entre 1024 y 65535." }
        $result.port = $portNumber
    }

    $normalized = [string]$result.repoUrl
    $normalized = $normalized.Trim()
    while ($normalized.EndsWith("/")) { $normalized = $normalized.Substring(0, $normalized.Length - 1) }
    $compare = $normalized
    if ($compare.ToLowerInvariant().EndsWith(".git")) { $compare = $compare.Substring(0, $compare.Length - 4) }
    if ($compare.ToLowerInvariant() -ne "https://github.com/tintaynodos/dsh-mobile-companion") {
        $result.error = "Solo se admite el repositorio oficial https://github.com/TintaYNodos/dsh-mobile-companion.git"
        return $result
    }
    $result.repoUrl = $script:OfficialRepoUrl
    $result.ok = $true
    return $result
}

# ------------------------------------------------------------------------------
# Red: solo loopback (healthz y deteccion de DeepSeek Harness). Nada de Internet.
# ------------------------------------------------------------------------------

function Invoke-HttpGet {
    param([string]$Url, [int]$TimeoutMs = 3000)
    $result = [ordered]@{ ok = $false; status = 0; body = ""; error = "" }
    $request = $null
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Method = "GET"
        $request.Timeout = $TimeoutMs
        $request.ReadWriteTimeout = $TimeoutMs
        $request.AllowAutoRedirect = $false
        $request.UserAgent = "dsh-companion-install-agent/" + $script:InstallerVersion
        try {
            $response = $request.GetResponse()
        } catch [System.Net.WebException] {
            $webError = $_.Exception
            if ($null -ne $webError.Response) { $response = $webError.Response }
            else { $result.error = $webError.Message; return $result }
        }
        $result.status = [int]$response.StatusCode
        $stream = $response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
        try { $result.body = $reader.ReadToEnd() } finally { $reader.Dispose() }
        $result.ok = $true
    } catch {
        $result.error = $_.Exception.Message
    } finally {
        if ($null -ne $response) { try { $response.Close() } catch { } }
        if ($null -ne $request) { try { $request.Abort() } catch { } }
    }
    return $result
}

function Invoke-Healthz {
    param([int]$Port, [int]$TimeoutMs = 3000)
    $result = [ordered]@{
        ok = $false
        status = 0
        service = ""
        bridgeVersion = ""
        state = ""
        harnessOk = $false
        harnessPort = 0
        harnessIdentity = ""
        bindHost = ""
        listenPort = 0
        error = ""
    }
    if ($Port -lt 1 -or $Port -gt 65535) { $result.error = "puerto fuera de rango"; return $result }
    $url = "http://127.0.0.1:" + [string]$Port + "/healthz"
    $http = Invoke-HttpGet -Url $url -TimeoutMs $TimeoutMs
    $result.status = [int]$http.status
    if (-not $http.ok) {
        $result.error = $http.error
        return $result
    }
    if ($result.status -ne 200) {
        $result.error = "HTTP " + [string]$result.status + " (el puente responde, pero no esta sano)"
        return $result
    }
    $json = $null
    try { $json = ($http.body | ConvertFrom-Json) } catch { $json = $null }
    if ($null -eq $json) { $result.error = "la respuesta no es JSON"; return $result }
    $result.service = [string](Get-Field $json "service" "")
    if ($result.service -ne "dsh-companion") {
        $result.error = "el puerto " + [string]$Port + " responde, pero no es DSH Companion"
        return $result
    }
    $result.ok = $true
    $result.bridgeVersion = [string](Get-Field $json "version" "")
    $result.state = [string](Get-Field $json "status" "")
    $harness = Get-Field $json "harness" $null
    if ($null -ne $harness) {
        $result.harnessOk = [bool](Get-Field $harness "ok" $false)
        $result.harnessPort = [int](Get-Field $harness "port" 0)
        $result.harnessIdentity = [string](Get-Field $harness "identity" "")
    }
    $bridge = Get-Field $json "bridge" $null
    if ($null -ne $bridge) {
        $result.bindHost = [string](Get-Field $bridge "bindHost" "")
        $result.listenPort = [int](Get-Field $bridge "listenPort" 0)
    }
    return $result
}

function Wait-Healthz {
    param([int]$Port, [int]$TimeoutSeconds = 60)
    $start = Get-Date
    $attempts = 0
    $last = $null
    while ($true) {
        $attempts++
        $last = Invoke-Healthz -Port $Port -TimeoutMs 3500
        if ($last.ok) {
            $elapsed = [int]((Get-Date) - $start).TotalSeconds
            return [ordered]@{ ok = $true; attempts = $attempts; elapsedSeconds = $elapsed; probe = $last; error = "" }
        }
        if (((Get-Date) - $start).TotalSeconds -ge $TimeoutSeconds) { break }
        Start-Sleep -Milliseconds 1000
    }
    $elapsed = [int]((Get-Date) - $start).TotalSeconds
    $errorText = "sin respuesta de /healthz"
    if ($null -ne $last -and -not [string]::IsNullOrEmpty([string]$last.error)) { $errorText = [string]$last.error }
    return [ordered]@{ ok = $false; attempts = $attempts; elapsedSeconds = $elapsed; probe = $last; error = $errorText }
}

function Test-DshPort {
    param([int]$Port)
    $result = [ordered]@{ port = $Port; identity = "none"; status = 0 }
    $url = "http://127.0.0.1:" + [string]$Port + "/"
    $http = Invoke-HttpGet -Url $url -TimeoutMs 2000
    $result.status = [int]$http.status
    if (-not $http.ok) { return $result }
    $body = [string]$http.body
    if ($body.IndexOf("__DSH_BOOT__", [System.StringComparison]::Ordinal) -ge 0) { $result.identity = "confirmed"; return $result }
    if ($body.IndexOf("dsh web authentication required", [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { $result.identity = "confirmed"; return $result }
    if ($result.status -eq 401 -or $result.status -eq 403) { $result.identity = "possible" }
    return $result
}

function Get-ListeningPorts {
    param([int]$ProcessId)
    if ($null -eq (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { return @() }
    $ports = New-Object System.Collections.ArrayList
    try {
        $connections = @(Get-NetTCPConnection -State Listen -OwningProcess $ProcessId -ErrorAction Stop)
        foreach ($connection in $connections) { [void]$ports.Add([int]$connection.LocalPort) }
    } catch {
        return @()
    }
    return @($ports | Select-Object -Unique)
}

# ------------------------------------------------------------------------------
# Deteccion de entorno: Node, git, DeepSeek Harness, espacio libre
# ------------------------------------------------------------------------------

function Test-NodeVersionOk {
    param([string]$Version)
    if ([string]::IsNullOrEmpty($Version)) { return $false }
    if ($Version -notmatch '^(\d+)\.(\d+)\.') { return $false }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if ($major -gt $script:MinNodeMajor) { return $true }
    if ($major -eq $script:MinNodeMajor -and $minor -ge $script:MinNodeMinor) { return $true }
    return $false
}

function Resolve-Node {
    $result = [ordered]@{ ok = $false; exe = ""; version = ""; error = "" }
    $candidates = New-Object System.Collections.ArrayList
    $seen = New-Object System.Collections.ArrayList
    $addCandidate = {
        param([string]$Path)
        if ([string]::IsNullOrEmpty($Path)) { return }
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
        foreach ($known in $seen) { if ($known.ToLowerInvariant() -eq $Path.ToLowerInvariant()) { return } }
        [void]$seen.Add($Path)
        [void]$candidates.Add($Path)
    }

    if (-not [string]::IsNullOrEmpty($env:USERPROFILE)) {
        $runtimeRoot = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes"
        if (Test-Path -LiteralPath $runtimeRoot) {
            $pattern = Join-Path $runtimeRoot "*\dependencies\node\bin\node.exe"
            $found = @()
            try { $found = @(Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue) } catch { $found = @() }
            foreach ($entry in $found) { & $addCandidate ([string]$entry.FullName) }
        }
        $knownDshNode = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
        & $addCandidate $knownDshNode
    }
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $command -and -not [string]::IsNullOrEmpty([string]$command.Source)) { & $addCandidate ([string]$command.Source) }
    $bases = @()
    if (-not [string]::IsNullOrEmpty($env:ProgramFiles)) { $bases += $env:ProgramFiles }
    if (-not [string]::IsNullOrEmpty(${env:ProgramFiles(x86)})) { $bases += ${env:ProgramFiles(x86)} }
    if (-not [string]::IsNullOrEmpty($env:LOCALAPPDATA)) { $bases += (Join-Path $env:LOCALAPPDATA "Programs") }
    foreach ($base in $bases) { & $addCandidate (Join-Path $base "nodejs\node.exe") }

    $bestExe = ""
    $bestVersion = ""
    $bestOk = $false
    $rejected = New-Object System.Collections.ArrayList
    foreach ($exe in $candidates) {
        $raw = ""
        try { $raw = (& $exe --version 2>$null | Out-String) } catch { continue }
        $version = ([string]$raw).Trim()
        if ($version -match '^v(\d+\.\d+\.\d+)') { $version = $Matches[1] }
        if ($version -notmatch '^\d+\.\d+\.\d+') { continue }
        $satisfies = Test-NodeVersionOk $version
        if ($satisfies) {
            if (-not $bestOk) { $bestOk = $true; $bestExe = $exe; $bestVersion = $version }
            else {
                $current = $bestVersion.Split(".")
                $challenger = $version.Split(".")
                $better = $false
                if ([int]$challenger[0] -gt [int]$current[0]) { $better = $true }
                elseif ([int]$challenger[0] -eq [int]$current[0]) {
                    if ([int]$challenger[1] -gt [int]$current[1]) { $better = $true }
                    elseif ([int]$challenger[1] -eq [int]$current[1] -and [int]$challenger[2] -gt [int]$current[2]) { $better = $true }
                }
                if ($better) { $bestExe = $exe; $bestVersion = $version }
            }
        } else {
            [void]$rejected.Add(@{ exe = $exe; version = $version })
        }
    }
    if ($bestOk) {
        $result.ok = $true
        $result.exe = $bestExe
        $result.version = $bestVersion
        return $result
    }
    if ($rejected.Count -gt 0) {
        $first = $rejected[0]
        $result.error = "Node v" + [string]$first.version + " es demasiado antiguo; hace falta " + [string]$script:MinNodeMajor + "." + [string]$script:MinNodeMinor + " o superior (" + [string]$first.exe + ")."
    } else {
        $result.error = "No encuentro Node.js " + [string]$script:MinNodeMajor + "." + [string]$script:MinNodeMinor + " ni el runtime empaquetado de DSH."
    }
    return $result
}

function Resolve-Git {
    $result = [ordered]@{ ok = $false; exe = ""; version = ""; error = "" }
    $command = Get-Command git -ErrorAction SilentlyContinue
    if ($null -eq $command -or [string]::IsNullOrEmpty([string]$command.Source)) {
        $result.error = "No hay git instalado. Instala Git para Windows (winget install --id Git.Git -e) o usa -SkipClone."
        return $result
    }
    $result.exe = [string]$command.Source
    try {
        $raw = (& $result.exe --version 2>$null | Out-String)
        $result.version = ([string]$raw).Trim()
    } catch {
        $result.version = ""
    }
    $result.ok = $true
    return $result
}

function Resolve-DshInfo {
    $result = [ordered]@{
        home = ""
        homeExists = $false
        credentials = $false
        identity = "none"
        port = 0
        possiblePort = 0
        detail = ""
    }
    if (-not [string]::IsNullOrEmpty($env:DSH_HOME)) { $result.home = $env:DSH_HOME }
    elseif (-not [string]::IsNullOrEmpty($env:USERPROFILE)) { $result.home = Join-Path $env:USERPROFILE ".dsh" }
    if ([string]::IsNullOrEmpty($result.home)) {
        $result.detail = "no se pudo determinar DSH_HOME"
        return $result
    }
    $result.homeExists = Test-Path -LiteralPath $result.home -PathType Container
    $credentialsPath = Join-Path $result.home ".credentials.yaml"
    # Solo se comprueba la existencia: el contenido es un secreto y no se lee.
    $result.credentials = Test-Path -LiteralPath $credentialsPath -PathType Leaf

    $ports = New-Object System.Collections.ArrayList
    $addPort = {
        param([int]$Port)
        if ($Port -lt 1 -or $Port -gt 65535) { return }
        foreach ($known in $ports) { if ([int]$known -eq $Port) { return } }
        [void]$ports.Add($Port)
    }
    if (-not [string]::IsNullOrEmpty($env:DSH_TARGET_PORT) -and $env:DSH_TARGET_PORT -match '^\d+$') { & $addPort ([int]$env:DSH_TARGET_PORT) }
    if (-not [string]::IsNullOrEmpty($env:DSH_WEB_URL)) {
        try {
            $uri = New-Object System.Uri($env:DSH_WEB_URL)
            if ($uri.Port -gt 0) { & $addPort ([int]$uri.Port) }
        } catch { }
    }
    $bridgePorts = New-Object System.Collections.ArrayList
    if (-not [string]::IsNullOrEmpty($env:DSH_LISTEN_PORT) -and $env:DSH_LISTEN_PORT -match '^\d+$') { [void]$bridgePorts.Add([int]$env:DSH_LISTEN_PORT) }
    [void]$bridgePorts.Add($script:DefaultPort)
    foreach ($bridgePort in $bridgePorts) {
        $health = Invoke-Healthz -Port ([int]$bridgePort) -TimeoutMs 1500
        if ($health.ok -and $health.harnessPort -gt 0) { & $addPort ([int]$health.harnessPort) }
    }
    foreach ($knownPort in @(52710, 52711, 52712, 59189)) { & $addPort ([int]$knownPort) }

    foreach ($port in $ports) {
        $probe = Test-DshPort -Port ([int]$port)
        if ($probe.identity -eq "confirmed") {
            $result.identity = "confirmed"
            $result.port = [int]$port
            break
        }
        if ($probe.identity -eq "possible" -and $result.possiblePort -eq 0) { $result.possiblePort = [int]$port }
    }
    if ($result.identity -ne "confirmed" -and $result.possiblePort -gt 0) { $result.identity = "possible" }

    if ($result.identity -eq "confirmed") {
        $result.detail = "DeepSeek Harness confirmado en 127.0.0.1:" + [string]$result.port
        if ($result.credentials) { $result.detail += "; credenciales de Harness presentes (no se leen)" }
    } elseif ($result.identity -eq "possible") {
        $result.detail = "Hay un servicio que podria ser DeepSeek Harness en 127.0.0.1:" + [string]$result.possiblePort + " (HTTP 401/403) y credenciales presentes; no se pudo confirmar el marcador."
    } elseif ($result.homeExists -and $result.credentials) {
        $result.detail = "DSH_HOME y credenciales presentes, pero DeepSeek Harness no responde en los puertos comprobados. Abrelo antes de emparejar."
    } elseif ($result.homeExists) {
        $result.detail = "DSH_HOME existe, pero faltan credenciales y DeepSeek Harness no responde. Abrelo y verifica la sesion."
    } else {
        $result.detail = "No existe DSH_HOME (" + $result.home + "). Abre DeepSeek Harness en esta computadora antes de emparejar."
    }
    return $result
}

function Get-FreeBytes {
    param([string]$Path)
    $probe = $Path
    if ([string]::IsNullOrEmpty($probe)) { return -1 }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ([string]::IsNullOrEmpty($probe)) { return -1 }
        if (Test-Path -LiteralPath $probe) { break }
        $parent = Split-Path -Parent $probe
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $probe) { return -1 }
        $probe = $parent
    }
    try {
        $root = [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($probe))
        if ([string]::IsNullOrEmpty($root)) { return -1 }
        $drive = New-Object System.IO.DriveInfo($root)
        if ($drive.IsReady) { return [long]$drive.AvailableFreeSpace }
    } catch { }
    return -1
}

# ------------------------------------------------------------------------------
# Procesos del puente e inicio automatico
# ------------------------------------------------------------------------------

function Get-RepoProcesses {
    param([string]$Repo)
    $result = [ordered]@{ queried = $false; processes = @() }
    if ([string]::IsNullOrEmpty($Repo)) { return $result }
    $needle = ""
    try { $needle = [System.IO.Path]::GetFullPath($Repo).TrimEnd([char]'\') } catch { $needle = $Repo.TrimEnd([char]'\') }
    try {
        $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'wscript.exe' OR Name = 'cmd.exe'" -ErrorAction Stop)
        $result.queried = $true
    } catch {
        return $result
    }
    $found = New-Object System.Collections.ArrayList
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrEmpty($commandLine)) { continue }
        if ($commandLine.IndexOf($needle, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        $isBridge = ($commandLine.IndexOf("bridge.mjs", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
        $isSupervisor = ($commandLine.IndexOf("run-hidden.vbs", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
        if (-not ($isBridge -or $isSupervisor)) { continue }
        [void]$found.Add($process)
    }
    $result.processes = @($found)
    return $result
}

function Stop-Bridge {
    param([string]$Repo)
    $result = [ordered]@{ ok = $false; stopped = 0; detail = ""; error = "" }
    $stopFlag = Join-Path $Repo "companion.stop"
    try { [System.IO.File]::WriteAllText($stopFlag, "", (New-Object System.Text.UTF8Encoding($false))) } catch { }
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        $info = Get-RepoProcesses -Repo $Repo
        $bridgeCount = @($info.processes | Where-Object { [string]$_.Name -match '^node\.exe$' }).Count
        if ($bridgeCount -eq 0) { break }
        Start-Sleep -Milliseconds 300
    }
    $info = Get-RepoProcesses -Repo $Repo
    foreach ($process in @($info.processes)) {
        try {
            Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop
            $result.stopped++
        } catch { }
    }
    Start-Sleep -Milliseconds 500
    if (Test-Path -LiteralPath $stopFlag) { Remove-Item -LiteralPath $stopFlag -Force -ErrorAction SilentlyContinue }
    $after = Get-RepoProcesses -Repo $Repo
    if (@($after.processes).Count -eq 0) {
        $result.ok = $true
        $result.detail = "puente detenido (" + [string]$result.stopped + " proceso(s) cerrados)"
    } else {
        $result.error = "quedan " + [string]@($after.processes).Count + " proceso(s) del puente"
        $result.detail = "no se pudo detener el puente completo"
    }
    return $result
}

function Start-BridgeProcess {
    param([string]$Repo, [int]$Port)
    $result = [ordered]@{ ok = $false; error = "" }
    $vbs = Join-Path $Repo "run-hidden.vbs"
    if (-not (Test-Path -LiteralPath $vbs -PathType Leaf)) {
        $result.error = "falta run-hidden.vbs en el repo"
        return $result
    }
    $env:DSH_LISTEN_PORT = [string]$Port
    try {
        Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $vbs + '"') -WorkingDirectory $Repo -WindowStyle Hidden -ErrorAction Stop | Out-Null
        $result.ok = $true
    } catch {
        $result.error = $_.Exception.Message
    }
    return $result
}

function Get-AutostartState {
    param([string]$Repo)
    $result = [ordered]@{
        path = ""
        exists = $false
        target = ""
        arguments = ""
        workingDirectory = ""
        registered = $false
        error = ""
    }
    if ([string]::IsNullOrEmpty($env:APPDATA)) { $result.error = "no hay APPDATA"; return $result }
    $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
    $result.path = Join-Path $startup $script:AutostartFileName
    $vbs = Join-Path $Repo "run-hidden.vbs"
    $expectedArguments = '"' + $vbs + '"'
    if (-not (Test-Path -LiteralPath $result.path -PathType Leaf)) { return $result }
    $result.exists = $true
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($result.path)
        $result.target = [string]$shortcut.TargetPath
        $result.arguments = [string]$shortcut.Arguments
        $result.workingDirectory = [string]$shortcut.WorkingDirectory
        $sameTarget = $result.target.ToLowerInvariant().TrimEnd([char]'\').EndsWith("wscript.exe")
        $sameArgs = $result.arguments.Trim() -eq $expectedArguments
        $sameDir = $result.workingDirectory.TrimEnd([char]'\').ToLowerInvariant() -eq $Repo.TrimEnd([char]'\').ToLowerInvariant()
        $result.registered = ($sameTarget -and $sameArgs -and $sameDir)
    } catch {
        $result.error = $_.Exception.Message
    }
    return $result
}

function Register-Autostart {
    param([string]$Repo)
    $result = [ordered]@{ ok = $false; path = ""; skipped = $false; detail = ""; error = "" }
    if ([string]::IsNullOrEmpty($env:APPDATA)) {
        $result.error = "no hay APPDATA en este usuario"
        return $result
    }
    $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
    try {
        if (-not (Test-Path -LiteralPath $startup -PathType Container)) { New-Item -ItemType Directory -Force -Path $startup | Out-Null }
    } catch {
        $result.error = "no se pudo preparar la carpeta de Inicio: " + $_.Exception.Message
        return $result
    }
    $vbs = Join-Path $Repo "run-hidden.vbs"
    if (-not (Test-Path -LiteralPath $vbs -PathType Leaf)) {
        $result.error = "falta run-hidden.vbs en el repo"
        return $result
    }
    $shortcutPath = Join-Path $startup $script:AutostartFileName
    $state = Get-AutostartState -Repo $Repo
    if ($state.exists -and $state.registered) {
        $result.ok = $true
        $result.skipped = $true
        $result.path = $shortcutPath
        $result.detail = "inicio automatico ya registrado; no se vuelve a escribir"
        return $result
    }
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "wscript.exe"
        $shortcut.Arguments = '"' + $vbs + '"'
        $shortcut.WorkingDirectory = $Repo
        $shortcut.Description = "DeepSeek Harness Mobile Companion Auto-Start"
        $shortcut.Save()
    } catch {
        $result.error = "no se pudo crear el acceso directo: " + $_.Exception.Message
        return $result
    }
    if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
        $result.error = "el acceso directo no quedo en disco"
        return $result
    }
    $after = Get-AutostartState -Repo $Repo
    if (-not $after.registered) {
        $result.error = "el acceso directo se creo, pero no apunta al arranque de este repo"
        return $result
    }
    $result.ok = $true
    $result.path = $shortcutPath
    $result.detail = "acceso directo de Inicio creado"
    return $result
}

# ------------------------------------------------------------------------------
# Repo: localizar, clonar, actualizar y verificar identidad
# ------------------------------------------------------------------------------

function Test-RepoContent {
    param([string]$Path)
    $result = [ordered]@{ ok = $false; missingRequired = @(); missingOptional = @() }
    if ([string]::IsNullOrEmpty($Path) -or -not (Test-Path -LiteralPath $Path -PathType Container)) {
        $result.missingRequired = @("bridge.mjs", "run-hidden.vbs", "package.json")
        return $result
    }
    $required = @("bridge.mjs", "run-hidden.vbs", "package.json")
    $optional = @("doctor.ps1", "doctor-fixes.json", "tools\verify-receipt.mjs")
    $missingRequired = New-Object System.Collections.ArrayList
    $missingOptional = New-Object System.Collections.ArrayList
    foreach ($name in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $Path $name))) { [void]$missingRequired.Add($name) }
    }
    foreach ($name in $optional) {
        if (-not (Test-Path -LiteralPath (Join-Path $Path $name))) { [void]$missingOptional.Add($name) }
    }
    $result.missingRequired = @($missingRequired)
    $result.missingOptional = @($missingOptional)
    $result.ok = ($missingRequired.Count -eq 0)
    return $result
}

function Find-RepoLocation {
    param([string]$Target, [bool]$Skip)
    $result = [ordered]@{
        ok = $false
        repoDir = ""
        hasContent = $false
        hasGit = $false
        needsClone = $false
        mode = ""
        detail = ""
        error = ""
    }
    if ($Skip) {
        $candidates = New-Object System.Collections.ArrayList
        $seen = New-Object System.Collections.ArrayList
        $addCandidate = {
            param([string]$Path)
            if ([string]::IsNullOrEmpty($Path)) { return }
            if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return }
            foreach ($known in $seen) { if ($known.ToLowerInvariant() -eq $Path.ToLowerInvariant()) { return } }
            [void]$seen.Add($Path)
            [void]$candidates.Add($Path)
        }
        & $addCandidate $Target
        if (-not [string]::IsNullOrEmpty($PSScriptRoot)) { & $addCandidate $PSScriptRoot }
        foreach ($candidate in $candidates) {
            $full = ""
            try { $full = (Resolve-Path -LiteralPath $candidate).Path } catch { continue }
            $content = Test-RepoContent -Path $full
            if ($content.ok) {
                $result.ok = $true
                $result.repoDir = $full
                $result.hasContent = $true
                $result.hasGit = Test-Path -LiteralPath (Join-Path $full ".git")
                $result.mode = "skip"
                $result.detail = "repo existente reutilizado (-SkipClone): " + $full
                return $result
            }
        }
        $result.error = "No encuentro un repo completo para -SkipClone (faltan bridge.mjs, run-hidden.vbs o package.json). Ejecuta desde la raiz del repo o pasa -Dir con la ruta correcta."
        return $result
    }

    $full = ""
    try { $full = [System.IO.Path]::GetFullPath($Target) } catch {
        $result.error = "La ruta de instalacion no es valida: " + $_.Exception.Message
        return $result
    }
    $full = $full.TrimEnd([char]'\')
    $result.repoDir = $full
    if (Test-Path -LiteralPath $full -PathType Leaf) {
        $result.error = "El directorio de instalacion es un archivo: " + $full
        return $result
    }
    if (Test-Path -LiteralPath $full -PathType Container) {
        $content = Test-RepoContent -Path $full
        if ($content.ok) {
            $result.ok = $true
            $result.hasContent = $true
            $result.hasGit = Test-Path -LiteralPath (Join-Path $full ".git")
            $result.mode = "existing"
            $result.detail = "repo existente reutilizado: " + $full
            return $result
        }
        $children = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue)
        if ($children.Count -eq 0) {
            $result.ok = $true
            $result.needsClone = $true
            $result.mode = "clone"
            $result.detail = "carpeta vacia: se clonara el repo en " + $full
            return $result
        }
        $missing = ""
        if (@($content.missingRequired).Count -gt 0) { $missing = " Faltan: " + (@($content.missingRequired) -join ", ") + "." }
        $result.error = "La carpeta " + $full + " ya existe y no es un repo completo." + $missing + " Usa otra -Dir o vaciala."
        return $result
    }
    $result.ok = $true
    $result.needsClone = $true
    $result.mode = "clone"
    $result.detail = "se clonara " + $script:RepoUrl + " en " + $full
    return $result
}

function Invoke-Git {
    param([string[]]$GitArgs)
    $result = [ordered]@{ exitCode = 1; output = ""; error = "" }
    if ([string]::IsNullOrEmpty($script:GitExe)) { $result.error = "git no disponible"; return $result }
    $errFile = Get-NewTempFilePath "dsh-install-git"
    try {
        $output = (& $script:GitExe @GitArgs 2> $errFile | Out-String)
        $result.exitCode = $LASTEXITCODE
        $result.output = ([string]$output).Trim()
    } catch {
        $result.exitCode = 1
        $result.error = $_.Exception.Message
    } finally {
        if (Test-Path -LiteralPath $errFile -PathType Leaf) {
            $errorText = (Read-TextFileAny $errFile).Trim()
            if ($errorText -ne "") { $result.error = $errorText }
            Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
        }
    }
    return $result
}

function Get-GitFirstErrorLine {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $lines = @(([string]$Text) -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
    if ($lines.Count -eq 0) { return "" }
    return Limit-Text ([string]$lines[0]).Trim() 220
}

function Invoke-RepoClone {
    param([string]$Target, [string]$RepoUrl)
    $result = [ordered]@{ ok = $false; detail = ""; error = "" }
    $existedBefore = Test-Path -LiteralPath $Target
    $parent = Split-Path -Parent $Target
    if (-not [string]::IsNullOrEmpty($parent) -and -not (Test-Path -LiteralPath $parent)) {
        try { New-Item -ItemType Directory -Force -Path $parent | Out-Null } catch {
            $result.error = "No se pudo crear la carpeta padre " + $parent + ": " + $_.Exception.Message
            return $result
        }
    }
    $clone = Invoke-Git -GitArgs @("clone", "--depth", "1", $RepoUrl, $Target)
    $content = Test-RepoContent -Path $Target
    if ($clone.exitCode -ne 0 -or -not $content.ok) {
        if (-not $existedBefore -and (Test-Path -LiteralPath $Target)) {
            $resolved = ""
            try { $resolved = (Resolve-Path -LiteralPath $Target).Path } catch { $resolved = "" }
            if ($resolved -ne "" -and $resolved -eq [System.IO.Path]::GetFullPath($Target)) {
                Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        $result.error = "git clone fallo (codigo " + [string]$clone.exitCode + ")."
        $firstLine = Get-GitFirstErrorLine $clone.error
        if ($firstLine -ne "") { $result.error += " " + $firstLine + "." }
        $result.error += " Revisa la conexion o usa -SkipClone con una copia del repo."
        return $result
    }
    $result.ok = $true
    $result.detail = "repo clonado en " + $Target
    return $result
}

function Invoke-RepoUpdate {
    param([string]$Repo, [bool]$Force)
    $result = [ordered]@{ ok = $true; updated = $false; warning = ""; detail = ""; error = "" }
    $before = Invoke-Git -GitArgs @("-C", $Repo, "rev-parse", "HEAD")
    $fetch = Invoke-Git -GitArgs @("-C", $Repo, "fetch", "--depth", "1", $script:OfficialRepoUrl, $script:OfficialBranch)
    if ($fetch.exitCode -ne 0) {
        $result.warning = "No se pudo actualizar desde el repo oficial (sin red o sin permisos). Se usa la copia existente."
        $firstLine = Get-GitFirstErrorLine $fetch.error
        if ($firstLine -ne "") { $result.warning += " Detalle: " + $firstLine + "." }
        $result.detail = "se mantiene el repo existente"
        return $result
    }
    if ($Force) {
        $apply = Invoke-Git -GitArgs @("-C", $Repo, "reset", "--hard", "FETCH_HEAD")
    } else {
        $apply = Invoke-Git -GitArgs @("-C", $Repo, "merge", "--ff-only", "FETCH_HEAD")
    }
    if ($apply.exitCode -ne 0) {
        if ($Force) {
            $result.ok = $false
            $result.error = "No se pudo reinstalar el repo sobre el commit oficial. Detalle: " + (Get-GitFirstErrorLine $apply.error)
            return $result
        }
        $result.warning = "El repo tiene cambios locales y no se puede actualizar por fast-forward; se usa la copia existente (usa -Force para reinstalar desde el commit oficial)."
        $result.detail = "se mantiene el repo existente"
        return $result
    }
    $after = Invoke-Git -GitArgs @("-C", $Repo, "rev-parse", "HEAD")
    $beforeHash = [string]$before.output
    $afterHash = [string]$after.output
    if ($beforeHash -ne "" -and $afterHash -ne "" -and $beforeHash -ne $afterHash) {
        $result.updated = $true
        $result.detail = "repo actualizado a " + (Limit-Text $afterHash 12)
    } else {
        $result.detail = "repo ya estaba al dia"
    }
    return $result
}

function Get-RepoIdentity {
    param([string]$Repo)
    $result = [ordered]@{
        hasGit = $false
        origin = ""
        originOk = $false
        commit = ""
        tag = ""
        tagOk = $true
        error = ""
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Repo ".git"))) { return $result }
    $result.hasGit = $true
    $originResult = Invoke-Git -GitArgs @("-C", $Repo, "remote", "get-url", "origin")
    if ($originResult.exitCode -eq 0) { $result.origin = ([string]$originResult.output).Trim() }
    $normalizedOrigin = $result.origin.Trim()
    while ($normalizedOrigin.EndsWith("/")) { $normalizedOrigin = $normalizedOrigin.Substring(0, $normalizedOrigin.Length - 1) }
    $compareOrigin = $normalizedOrigin
    if ($compareOrigin.ToLowerInvariant().EndsWith(".git")) { $compareOrigin = $compareOrigin.Substring(0, $compareOrigin.Length - 4) }
    $result.originOk = ($compareOrigin.ToLowerInvariant() -eq "https://github.com/tintaynodos/dsh-mobile-companion")
    $commitResult = Invoke-Git -GitArgs @("-C", $Repo, "rev-parse", "HEAD")
    if ($commitResult.exitCode -eq 0) { $result.commit = ([string]$commitResult.output).Trim() }
    $tagResult = Invoke-Git -GitArgs @("-C", $Repo, "describe", "--tags", "--exact-match", "HEAD")
    if ($tagResult.exitCode -eq 0) {
        $result.tag = ([string]$tagResult.output).Trim()
        if ($result.tag -ne "" -and $result.commit -ne "") {
            $tagCommit = Invoke-Git -GitArgs @("-C", $Repo, "rev-list", "-n", "1", $result.tag)
            $tagHash = ([string]$tagCommit.output).Trim()
            $result.tagOk = ($tagCommit.exitCode -eq 0 -and $tagHash -eq $result.commit)
        }
    }
    return $result
}

function Get-ProductVersion {
    param([string]$Repo)
    $packagePath = Join-Path $Repo "package.json"
    if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { return "" }
    try {
        $text = Read-TextFileAny $packagePath
        $package = $text | ConvertFrom-Json
        return [string](Get-Field $package "version" "")
    } catch {
        return ""
    }
}

# ------------------------------------------------------------------------------
# Respaldo del registro de dispositivos (solo lectura del registro)
# ------------------------------------------------------------------------------

function Get-LatestBackupAgeHours {
    param([string]$DshHome)
    if ([string]::IsNullOrEmpty($DshHome)) { return -1 }
    $backups = Join-Path $DshHome "backups"
    if (-not (Test-Path -LiteralPath $backups -PathType Container)) { return -1 }
    $dirs = @(Get-ChildItem -LiteralPath $backups -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($dirs.Count -eq 0) { return -1 }
    return ((Get-Date) - $dirs[0].LastWriteTime).TotalHours
}

function Invoke-RegistryBackup {
    param([string]$Repo, [string]$DshHome)
    $result = [ordered]@{ status = "skipped"; detail = ""; warning = $false }
    if ([string]::IsNullOrEmpty($DshHome)) {
        $result.detail = "DSH_HOME no definido: no hay registro que respaldar"
        return $result
    }
    $registry = Join-Path $DshHome "companion-devices.json"
    if (-not (Test-Path -LiteralPath $registry -PathType Leaf)) {
        $result.detail = "no hay registro de dispositivos todavia (primer emparejamiento)"
        return $result
    }
    $age = Get-LatestBackupAgeHours -DshHome $DshHome
    if ($age -ge 0 -and $age -lt $script:BackupMaxAgeHours) {
        $result.detail = "ya hay una copia del registro de menos de " + [string]$script:BackupMaxAgeHours + " h"
        return $result
    }
    $backupScript = Join-Path $Repo "backup.ps1"
    if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
        $result.status = "warning"
        $result.warning = $true
        $result.detail = "falta backup.ps1: no se guardo copia del registro"
        return $result
    }
    $hostExe = Get-PowerShellHostPath
    $errFile = Get-NewTempFilePath "dsh-install-backup"
    $exitCode = 1
    $errorText = ""
    try {
        $null = (& $hostExe -NoProfile -ExecutionPolicy Bypass -File $backupScript -RegistryOnly -DshHome $DshHome 2> $errFile | Out-String)
        $exitCode = $LASTEXITCODE
    } catch {
        $exitCode = 1
        $errorText = $_.Exception.Message
    }
    if (Test-Path -LiteralPath $errFile -PathType Leaf) {
        $fileError = (Read-TextFileAny $errFile).Trim()
        if ($fileError -ne "" -and $errorText -eq "") { $errorText = $fileError }
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
    if ($exitCode -eq 0) {
        $result.status = "ok"
        $result.detail = "copia del registro guardada y verificada"
    } else {
        $result.status = "warning"
        $result.warning = $true
        $result.detail = "backup.ps1 devolvio codigo " + [string]$exitCode + "; la instalacion continua"
        if ($errorText -ne "") { $result.detail += ". " + (Get-GitFirstErrorLine $errorText) }
    }
    return $result
}

# ------------------------------------------------------------------------------
# Doctor y recibo
# ------------------------------------------------------------------------------

function Invoke-Doctor {
    param([string]$Repo)
    $result = [ordered]@{
        available = $false
        ok = $false
        exitCode = $null
        json = $null
        reportPath = ""
        error = ""
        blockers = @()
        warnings = @()
    }
    $doctor = Join-Path $Repo "doctor.ps1"
    if (-not (Test-Path -LiteralPath $doctor -PathType Leaf)) {
        $result.error = "el repo no incluye doctor.ps1"
        return $result
    }
    $result.available = $true
    $hostExe = Get-PowerShellHostPath
    $errFile = Get-NewTempFilePath "dsh-install-doctor"
    $raw = ""
    $exitCode = -1
    $errorText = ""
    try {
        $raw = (& $hostExe -NoProfile -ExecutionPolicy Bypass -File $doctor -Json -Report 2> $errFile | Out-String)
        $exitCode = $LASTEXITCODE
    } catch {
        $errorText = $_.Exception.Message
    }
    if (Test-Path -LiteralPath $errFile -PathType Leaf) {
        $fileError = (Read-TextFileAny $errFile).Trim()
        if ($fileError -ne "" -and $errorText -eq "") { $errorText = $fileError }
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
    $result.exitCode = $exitCode
    $trimmed = ([string]$raw).Trim()
    # Un BOM UTF-8 al inicio se quita comparando por ordinal: StartsWith con
    # cultura (Windows PowerShell 5.1) ignora U+FEFF y daria siempre verdadero.
    if ($trimmed.Length -gt 0 -and [int][char]$trimmed[0] -eq 0xFEFF) { $trimmed = $trimmed.Substring(1).Trim() }
    $json = $null
    if ($trimmed.Length -gt 0) {
        try { $json = $trimmed | ConvertFrom-Json } catch { $json = $null }
    }
    if ($null -eq $json) {
        $result.error = "doctor.ps1 no devolvio JSON valido (codigo " + [string]$exitCode + ")."
        if ($errorText -ne "") { $result.error += " " + (Get-GitFirstErrorLine $errorText) }
        elseif ($trimmed.Length -gt 0) { $result.error += " Salida: " + (Limit-Text $trimmed 300) }
        return $result
    }
    $result.json = $json
    $result.ok = [bool](Get-Field $json "ok" $false)
    $result.blockers = @(Get-ListField $json "blockers")
    $result.warnings = @(Get-ListField $json "warnings")
    $reportPath = Join-Path $Repo "doctor-report.json"
    if (Test-Path -LiteralPath $reportPath -PathType Leaf) { $result.reportPath = $reportPath }
    return $result
}

function Invoke-ReceiptCheck {
    param([string]$Repo, [string]$ReportPath, [string]$NodeExe)
    $result = [ordered]@{ available = $false; ok = $false; exitCode = $null; detail = "" }
    $tool = Join-Path (Join-Path $Repo "tools") "verify-receipt.mjs"
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        $result.detail = "el repo no incluye tools/verify-receipt.mjs"
        return $result
    }
    $result.available = $true
    if ([string]::IsNullOrEmpty($ReportPath) -or -not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) {
        $result.detail = "no hay doctor-report.json que verificar"
        return $result
    }
    if ([string]::IsNullOrEmpty($NodeExe)) {
        $result.detail = "no hay Node disponible para verificar el recibo"
        return $result
    }
    $errFile = Get-NewTempFilePath "dsh-install-receipt"
    $raw = ""
    $exitCode = -1
    $errorText = ""
    try {
        $raw = (& $NodeExe $tool $ReportPath 2> $errFile | Out-String)
        $exitCode = $LASTEXITCODE
    } catch {
        $errorText = $_.Exception.Message
    }
    if (Test-Path -LiteralPath $errFile -PathType Leaf) {
        $fileError = (Read-TextFileAny $errFile).Trim()
        if ($fileError -ne "" -and $errorText -eq "") { $errorText = $fileError }
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
    $result.exitCode = $exitCode
    $lines = @(([string]$raw) -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
    $verdict = ""
    if ($lines.Count -gt 0) { $verdict = ([string]$lines[$lines.Count - 1]).Trim() }
    if ($exitCode -eq 0) {
        $result.ok = $true
        if ($verdict -ne "") { $result.detail = "recibo verificado: " + (Limit-Text $verdict 260) }
        else { $result.detail = "recibo verificado" }
    } else {
        $result.detail = "el recibo no verifica (codigo " + [string]$exitCode + ")"
        if ($verdict -ne "") { $result.detail += ": " + (Limit-Text $verdict 220) }
        elseif ($errorText -ne "") { $result.detail += ": " + (Get-GitFirstErrorLine $errorText) }
    }
    return $result
}

# ------------------------------------------------------------------------------
# Preflight
# ------------------------------------------------------------------------------

function Invoke-Preflight {
    $script:PreflightFailed = $false

    # 1. Windows
    $isWindows = ($env:OS -eq "Windows_NT")
    if (-not $isWindows) {
        try { $isWindows = ([System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) } catch { $isWindows = $false }
    }
    if (-not (Add-Check "windows" $isWindows "Windows requerido; este script usa APIs y arranque exclusivos de Windows.")) { $script:PreflightFailed = $true }

    # 2. PowerShell >= 5.1
    $psVersion = $PSVersionTable.PSVersion
    $psOk = ($psVersion.Major -gt 5) -or ($psVersion.Major -eq 5 -and $psVersion.Minor -ge 1)
    if (-not (Add-Check "powershell" $psOk ("PowerShell " + $psVersion.ToString() + " (minimo 5.1)."))) { $script:PreflightFailed = $true }

    # 3. Arquitectura de 64 bits
    $arch = [string]$env:PROCESSOR_ARCHITECTURE
    $is64 = $false
    try { $is64 = [System.Environment]::Is64BitProcess } catch { $is64 = $false }
    $archOk = ($is64 -and ($arch -eq "AMD64" -or $arch -eq "ARM64"))
    if (-not (Add-Check "architecture" $archOk ("proceso de 64 bits; arquitectura " + $(if ($arch -eq "") { "desconocida" } else { $arch }) + "."))) { $script:PreflightFailed = $true }

    # 4. Node >= 22.15 (incluye el runtime empaquetado de DSH)
    $node = Resolve-Node
    if ($node.ok) {
        $script:NodeExe = [string]$node.exe
        $script:NodeVersion = [string]$node.version
        [void](Add-Check "node" $true ("Node v" + $script:NodeVersion + " (" + $script:NodeExe + ")."))
    } else {
        [void](Add-Check "node" $false ([string]$node.error))
        $script:PreflightFailed = $true
    }

    # 5. git, solo si hace falta clonar/actualizar
    $needsGit = (-not $script:SkipClone)
    if (-not $needsGit) {
        [void](Add-Check "git" $true "no hace falta (-SkipClone usa una copia existente).")
    } else {
        $git = Resolve-Git
        if ($git.ok) {
            $script:GitExe = [string]$git.exe
            $script:GitVersion = [string]$git.version
            [void](Add-Check "git" $true ($script:GitVersion + " (" + $script:GitExe + ")."))
        } else {
            [void](Add-Check "git" $false ([string]$git.error))
            $script:PreflightFailed = $true
        }
    }

    # 6. Espacio libre en el volumen de instalacion
    if ($script:SkipClone -and -not $script:DirBound) {
        [void](Add-Check "disk" $true "no se escribe en el volumen de instalacion (-SkipClone).")
    } else {
        $freeBytes = Get-FreeBytes -Path $script:Dir
        if ($freeBytes -lt 0) {
            [void](Add-Check "disk" $true ("no se pudo determinar el espacio libre; minimo recomendado " + [string][int]($script:MinFreeBytes / 1MB) + " MB."))
        } elseif ($freeBytes -ge $script:MinFreeBytes) {
            [void](Add-Check "disk" $true ("espacio libre " + [string][int]($freeBytes / 1MB) + " MB (minimo " + [string][int]($script:MinFreeBytes / 1MB) + " MB)."))
        } else {
            [void](Add-Check "disk" $false ("solo " + [string][int]($freeBytes / 1MB) + " MB libres; hacen falta " + [string][int]($script:MinFreeBytes / 1MB) + " MB."))
            $script:PreflightFailed = $true
        }
    }

    # 7. DeepSeek Harness detectado (no bloqueante: se avisa y se continua)
    $dsh = Resolve-DshInfo
    $script:DshHome = [string]$dsh.home
    $script:DshPort = [int]$dsh.port
    $script:DshIdentity = [string]$dsh.identity
    $dshOk = ($dsh.identity -eq "confirmed" -or ($dsh.identity -eq "possible" -and $dsh.credentials))
    [void](Add-Check "dsh-harness" $dshOk ([string]$dsh.detail))
    if (-not $dshOk) {
        Add-Warning ("DeepSeek Harness no confirmado: " + [string]$dsh.detail + " La instalacion del puente puede continuar, pero el telefono no funcionara hasta que Harness este abierto.")
    }

    # 8. URL oficial
    [void](Add-Check "repo-url" $true ("repo oficial: " + $script:RepoUrl))

    if ($script:PreflightFailed) {
        Add-Step "preflight" "failed" "hay comprobaciones de preflight bloqueantes en rojo (salida 1)"
    } else {
        Add-Step "preflight" "ok" "entorno listo para instalar"
    }
}

# ------------------------------------------------------------------------------
# Plan de -DryRun
# ------------------------------------------------------------------------------

function Add-DryRunPlan {
    $plannedLog = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-companion-install-" + (Get-Date).ToString("yyyyMMdd-HHmmss") + ".log")
    Add-Step "log" "planned" ("se escribiria el log en " + $plannedLog + " (en -DryRun no se escribe)")

    $location = Find-RepoLocation -Target $script:Dir -Skip $script:SkipClone
    $planRepoDir = [string]$location.repoDir
    if (-not $location.ok) {
        Add-Step "repo" "warning" ([string]$location.error)
    } else {
        Add-Step "repo" "planned" ([string]$location.detail)
    }

    if ($script:RegisterAutostart -and $script:PortBound) {
        Add-Step "env-port" "planned" ("se fijaria DSH_LISTEN_PORT=" + [string]$script:Port + " en el entorno del usuario para que el inicio automatico use el mismo puerto")
    } else {
        Add-Step "env-port" "skipped" "solo se aplica con -RegisterAutostart y -Port"
    }

    $backupDetail = "se respaldaria el registro de dispositivos solo si existe y la ultima copia tiene mas de " + [string]$script:BackupMaxAgeHours + " h"
    Add-Step "backup" "planned" $backupDetail

    if ($script:PortBound) { Add-Step "bridge" "planned" ("se comprobaria el puerto " + [string]$script:Port + "; si no hay una instancia de este repo, se arrancaria run-hidden.vbs de forma oculta") }
    else { Add-Step "bridge" "planned" ("se comprobaria el puerto " + [string]$script:DefaultPort + " y se arrancaria run-hidden.vbs de forma oculta si no hay instancia") }

    Add-Step "healthz" "planned" "se esperaria GET http://127.0.0.1:<puerto>/healthz con reintentos y timeout"
    $hasDoctor = $false
    if ($planRepoDir -ne "") { $hasDoctor = Test-Path -LiteralPath (Join-Path $planRepoDir "doctor.ps1") -PathType Leaf }
    if ($hasDoctor) {
        Add-Step "doctor" "planned" "se ejecutaria doctor.ps1 -Json -Report y se leerian ok, blockers y warnings"
    } else {
        Add-Step "doctor" "planned" "si el repo lo incluye, se ejecutaria doctor.ps1 -Json -Report"
    }
    Add-Step "receipt" "planned" "si el repo incluye tools/verify-receipt.mjs, se verificaria doctor-report.json"
    Add-Step "pairing" "skipped" "el emparejamiento NO es automatico; se hace a mano con panel.bat"

    if ($script:RegisterAutostart) { Add-Step "autostart" "planned" "se crearia o actualizaria el acceso directo de Inicio sin duplicar" }
    else { Add-Step "autostart" "skipped" "no solicitado; anade -RegisterAutostart para arrancar el puente con Windows" }
}

# ------------------------------------------------------------------------------
# Informe final: JSON o resumen humano
# ------------------------------------------------------------------------------

function Get-ExitMeaning {
    param([int]$Code)
    switch ($Code) {
        0 { return "instalacion y verificacion correctas" }
        1 { return "error de preflight" }
        2 { return "instalacion fallida" }
        3 { return "verificacion fallida" }
        4 { return "parametros invalidos" }
        default { return "codigo desconocido" }
    }
}

function Get-FailedSteps {
    return @($script:Steps | Where-Object { [string]$_.status -eq "failed" })
}

function Write-HumanSummary {
    param([int]$ExitCode)
    Write-Human ""
    Write-Human "== Resumen ==" "Cyan"
    if ($ExitCode -eq 0) { Write-Human ("  Resultado: OK (codigo 0: " + (Get-ExitMeaning $ExitCode) + ")") "Green" }
    else { Write-Human ("  Resultado: FALLA (codigo " + [string]$ExitCode + ": " + (Get-ExitMeaning $ExitCode) + ")") "Red" }
    Write-Human ("  Directorio de instalacion: " + $script:Dir)
    if ($script:RepoDir -ne "") { Write-Human ("  Repo: " + $script:RepoDir) }
    if ($script:RepoCommit -ne "") { Write-Human ("  Commit: " + $script:RepoCommit) }
    if ($script:RepoTag -ne "") { Write-Human ("  Tag: " + $script:RepoTag) }
    if ($script:ProductVersion -ne "") { Write-Human ("  Version del producto: " + $script:ProductVersion) }
    if ($script:ResolvedPort -gt 0) { Write-Human ("  Puerto del puente: " + [string]$script:ResolvedPort) }
    if ($null -ne $script:Health -and $script:Health.ok) {
        Write-Human ("  /healthz: HTTP 200; estado " + [string]$script:Health.state + "; version " + [string]$script:Health.bridgeVersion)
    }
    if ($null -ne $script:Doctor) {
        if ($script:Doctor.available) { Write-Human ("  doctor.ps1: ok=" + [string]$script:Doctor.ok) }
        else { Write-Human "  doctor.ps1: no disponible en el repo" }
    }
    if ($null -ne $script:Receipt -and $script:Receipt.available) { Write-Human ("  Recibo: " + [string]$script:Receipt.detail) }
    if ($script:AutostartRegistered) { Write-Human ("  Inicio automatico: registrado en " + $script:AutostartPath) }
    elseif ($script:RegisterAutostart) { Write-Human "  Inicio automatico: no registrado" }
    else { Write-Human "  Inicio automatico: no solicitado (-RegisterAutostart)" }
    if ($script:LogPath -ne "") { Write-Human ("  Log: " + $script:LogPath) }
    if ($script:Warnings.Count -gt 0) {
        Write-Human ""
        Write-Human "  AVISOS:" "Yellow"
        foreach ($warningText in $script:Warnings) { Write-Human ("   [AVISO] " + [string]$warningText) "Yellow" }
    }
    if ($ExitCode -ne 0) {
        $failed = @(Get-FailedSteps)
        if ($failed.Count -gt 0) {
            Write-Human ""
            Write-Human "  Pasos fallidos:" "Red"
            foreach ($step in $failed) { Write-Human ("   [FALLA] " + [string]$step.name + ": " + [string]$step.detail) "Red" }
        }
        Write-Human ""
        Write-Human "  Siguiente paso:" "White"
        Write-Human "    powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -DryRun -Json"
        Write-Human "    powershell -NoProfile -ExecutionPolicy Bypass -File install-agent.ps1 -Json"
        if ($script:Stage -eq "params") { Write-Human "    Revisa las opciones con -Help." }
    } else {
        Write-Human ""
        Write-Human "  Emparejamiento: NO automatico. Cuando el telefono muestre el codigo, ejecuta panel.bat." "White"
        Write-Human "  Para reinstalar o actualizar desde el repo oficial: -Force" "DarkGray"
        Write-Human ""
    }
}

function Complete-Install {
    param([int]$ExitCode)
    $failedChecks = @($script:Checks | Where-Object { -not [bool]$_.ok })
    $report = [ordered]@{
        ok = [bool]($ExitCode -eq 0)
        version = $script:InstallerVersion
        steps = @($script:Steps)
        checks = @($script:Checks)
        exitCode = [int]$ExitCode
        tool = $script:ToolName
        mode = $(if ($script:DryRun) { "dry-run" } else { "install" })
        generatedAt = (Get-Date).ToString("o")
        installDir = $script:Dir
        repoDir = $script:RepoDir
        repoUrl = $script:RepoUrl
        productVersion = $script:ProductVersion
        repoCommit = $script:RepoCommit
        repoTag = $script:RepoTag
        nodeVersion = $script:NodeVersion
        nodeExe = $script:NodeExe
        bridgePort = [int]$script:ResolvedPort
        bridgeStarted = [bool]$script:StartedBridge
        bridgeVersion = $(if ($null -ne $script:Health -and $script:Health.ok) { [string]$script:Health.bridgeVersion } else { "" })
        doctorOk = $(if ($null -ne $script:Doctor -and $script:Doctor.available) { [bool]$script:Doctor.ok } else { $null })
        doctorReport = $script:DoctorReportPath
        receipt = $script:Receipt
        autostart = [ordered]@{ registered = [bool]$script:AutostartRegistered; path = $script:AutostartPath }
        logFile = $script:LogPath
        warnings = @($script:Warnings)
    }
    Write-Log ("FIN exitCode=" + [string]$ExitCode + " ok=" + [string]($ExitCode -eq 0))
    if ($script:Json) {
        $text = $report | ConvertTo-Json -Depth 10
        if ($null -eq $text -or [string]::IsNullOrEmpty([string]$text)) { $text = "{}" }
        $encoder = New-Object System.Text.UTF8Encoding($false)
        $bytes = $encoder.GetBytes([string]$text + "`r`n")
        $stdout = [System.Console]::OpenStandardOutput()
        $stdout.Write($bytes, 0, $bytes.Length)
        $stdout.Flush()
        exit $ExitCode
    }
    Write-HumanSummary -ExitCode $ExitCode
    exit $ExitCode
}

# ==============================================================================
# Flujo principal
# ==============================================================================

# El modo JSON se detecta antes del parseo para que incluso un parametro
# invalido produzca JSON valido (no texto suelto) cuando se pidio -Json.
foreach ($rawArgument in $args) {
    if ($null -eq $rawArgument) { continue }
    $argumentText = ([string]$rawArgument).Trim()
    if ($argumentText -ieq "-json" -or $argumentText.ToLowerInvariant().StartsWith("-json:")) { $script:Json = $true }
}

$parseResult = Parse-Arguments -RawArgs $args
if (-not $parseResult.ok) {
    $script:Json = [bool]$parseResult.json -or $script:Json
    $script:Stage = "params"
    Add-Step "parametros" "failed" ([string]$parseResult.error)
    Complete-Install 4
}
$script:Json = [bool]$parseResult.json
$script:DryRun = [bool]$parseResult.dryRun
$script:SkipClone = [bool]$parseResult.skipClone
$script:RegisterAutostart = [bool]$parseResult.registerAutostart
$script:Force = [bool]$parseResult.force
$script:Help = [bool]$parseResult.help
$script:RepoUrl = [string]$parseResult.repoUrl
$script:ParseWarning = [string]$parseResult.warning
$script:DirBound = [bool]$parseResult.dirBound
if ($script:DirBound) { $script:Dir = [string]$parseResult.dir }
else {
    if (-not [string]::IsNullOrEmpty($env:LOCALAPPDATA)) { $script:Dir = Join-Path $env:LOCALAPPDATA "DSH-Companion" }
    elseif (-not [string]::IsNullOrEmpty($env:USERPROFILE)) { $script:Dir = Join-Path $env:USERPROFILE "AppData\Local\DSH-Companion" }
    else { $script:Dir = "" }
}
$script:PortBound = [bool]$parseResult.portBound
if ($script:PortBound) { $script:Port = [int]$parseResult.port }

if ($script:Help) {
    if ($script:Json) {
        foreach ($line in (Get-UsageText)) { Add-Step "ayuda" "skipped" ([string]$line) }
        Complete-Install 0
    }
    Write-Human ""
    foreach ($line in (Get-UsageText)) { Write-Human ([string]$line) }
    exit 0
}

if ([string]::IsNullOrEmpty($script:Dir)) {
    Add-Step "parametros" "failed" "No se pudo determinar el directorio de instalacion: define LOCALAPPDATA o usa -Dir."
    Complete-Install 1
}

Add-Step "parametros" "ok" ("modo=" + $(if ($script:DryRun) { "dry-run" } else { "install" }) + "; dir=" + $script:Dir + $(if ($script:SkipClone) { "; skipClone" } else { "" }) + $(if ($script:Force) { "; force" } else { "" }) + $(if ($script:PortBound) { "; puerto=" + [string]$script:Port } else { "" }))
if ($script:ParseWarning -ne "") { Add-Warning $script:ParseWarning }

if (-not $script:DryRun) {
    $logResult = Initialize-Log
    if ($logResult.ok) {
        Write-Log ("install-agent.ps1 v" + $script:InstallerVersion + " - " + $script:ToolName)
        Write-Log ("Argumentos: " + (($args | ForEach-Object { [string]$_ }) -join " "))
    } else {
        Add-Warning ("No se pudo escribir el log en %TEMP%: " + [string]$logResult.error)
    }
}

Write-Human ""
Write-Human ("== DSH Mobile Companion - instalador para agentes v" + $script:InstallerVersion + " ==") "Cyan"
Write-Human ("   Directorio objetivo: " + $script:Dir)
if ($script:DryRun) { Write-Human "   Modo DRY-RUN: no se escribe nada; solo plan y comprobaciones." "Yellow" }
Write-Human ""

try {
    # ----- Preflight ---------------------------------------------------------
    $script:Stage = "preflight"
    Write-Human "== Preflight ==" "Cyan"
    Invoke-Preflight
    if ($script:PreflightFailed) { Complete-Install 1 }

    # ----- DryRun: plan ------------------------------------------------------
    if ($script:DryRun) {
        Write-Human ""
        Write-Human "== Plan (-DryRun) ==" "Cyan"
        Add-DryRunPlan
        Complete-Install 0
    }

    # ----- Instalacion -------------------------------------------------------
    $script:Stage = "install"
    Write-Human ""
    Write-Human "== Instalacion ==" "Cyan"

    $env:GIT_TERMINAL_PROMPT = "0"
    $env:GCM_INTERACTIVE = "Never"

    $location = Find-RepoLocation -Target $script:Dir -Skip $script:SkipClone
    if (-not $location.ok) {
        Add-Step "repo" "failed" ([string]$location.error)
        Complete-Install 2
    }
    $script:RepoDir = [string]$location.repoDir
    $script:RepoMode = [string]$location.mode

    if ($location.needsClone) {
        $clone = Invoke-RepoClone -Target $script:RepoDir -RepoUrl $script:RepoUrl
        if (-not $clone.ok) {
            Add-Step "repo" "failed" ([string]$clone.error)
            Complete-Install 2
        }
        Add-Step "repo" "ok" ([string]$clone.detail)
    } elseif ($script:SkipClone) {
        Add-Step "repo" "ok" ("repo existente reutilizado (-SkipClone): " + $script:RepoDir)
        if (-not $location.hasGit) { Add-Warning "El repo en -SkipClone no tiene .git (copia del ZIP): no se puede actualizar ni verificar origen; se usa tal cual." }
    } else {
        $runningInfo = Get-RepoProcesses -Repo $script:RepoDir
        $isLive = (@($runningInfo.processes).Count -gt 0)
        if ($script:Force -and $isLive) {
            $stopResult = Stop-Bridge -Repo $script:RepoDir
            if (-not $stopResult.ok) {
                Add-Step "repo" "failed" ("No se pudo detener el puente para reinstalar: " + [string]$stopResult.error)
                Complete-Install 2
            }
            Add-Step "bridge-stop" "ok" ([string]$stopResult.detail)
        }
        if ($location.hasGit) {
            if ($isLive -and -not $script:Force) {
                Add-Step "repo" "warning" ("el puente esta en marcha desde este repo: no se actualiza sin -Force (para no cambiar archivos en caliente)")
            } else {
                $update = Invoke-RepoUpdate -Repo $script:RepoDir -Force $script:Force
                if (-not $update.ok) {
                    Add-Step "repo" "failed" ([string]$update.error)
                    Complete-Install 2
                }
                if ($update.warning -ne "") {
                    Add-Step "repo" "warning" ([string]$update.warning)
                    Add-Warning ([string]$update.warning)
                } else {
                    Add-Step "repo" "ok" ([string]$update.detail)
                }
            }
        } else {
            Add-Step "repo" "warning" ("copia existente sin .git: se usa tal cual y no se actualiza")
            Add-Warning "El repo instalado no tiene .git: no se puede comprobar el origen oficial ni actualizar. Para actualizar, reinstala con -Force sobre una copia con git."
        }
    }

    # Verificar contenido despues de clonar/actualizar.
    $content = Test-RepoContent -Path $script:RepoDir
    if (-not $content.ok) {
        Add-Step "repo-content" "failed" ("faltan archivos obligatorios: " + (@($content.missingRequired) -join ", "))
        Complete-Install 2
    }
    [void](Add-Check "repo-content" $true ("repo completo en " + $script:RepoDir))
    if (@($content.missingOptional).Count -gt 0) {
        Add-Warning ("El repo no incluye: " + (@($content.missingOptional) -join ", ") + ". Se omitiran los pasos que dependen de esos archivos.")
    }

    $identity = Get-RepoIdentity -Repo $script:RepoDir
    $script:RepoCommit = [string]$identity.commit
    $script:RepoTag = [string]$identity.tag
    if ($identity.hasGit) {
        if ($identity.originOk) {
            [void](Add-Check "repo-origin" $true ("origen oficial: " + $identity.origin))
        } else {
            [void](Add-Check "repo-origin" $false ("el origen no es el repo oficial: " + $(if ($identity.origin -eq "") { "sin origin" } else { $identity.origin }) + ". Las actualizaciones se hacen siempre contra la URL oficial."))
            Add-Warning "El repo existente tiene un origin distinto del oficial; se usa el contenido local y las actualizaciones van contra la URL oficial."
        }
        if ($identity.commit -ne "") {
            if ($identity.tag -ne "" -and -not $identity.tagOk) {
                [void](Add-Check "repo-commit" $false ("el tag " + $identity.tag + " no apunta al commit " + $identity.commit))
                Add-Step "repo-commit" "failed" ("tag " + $identity.tag + " no coincide con HEAD " + $identity.commit)
                Complete-Install 2
            }
            $commitDetail = "HEAD " + $identity.commit
            if ($identity.tag -ne "") { $commitDetail += "; tag " + $identity.tag + " verificado" }
            [void](Add-Check "repo-commit" $true $commitDetail)
        }
    } else {
        [void](Add-Check "repo-origin" $true "sin .git (copia local): no hay origen que verificar")
        [void](Add-Check "repo-commit" $true "sin .git (copia local): no hay commit que verificar")
    }
    $script:ProductVersion = Get-ProductVersion -Repo $script:RepoDir
    if ($script:ProductVersion -ne "") { Write-Log ("productVersion=" + $script:ProductVersion) }

    # Respaldo del registro (idempotente: como mucho uno cada 24 h).
    $backup = Invoke-RegistryBackup -Repo $script:RepoDir -DshHome $script:DshHome
    Add-Step "backup" ([string]$backup.status) ([string]$backup.detail)
    if ($backup.warning) { Add-Warning ([string]$backup.detail) }

    # ----- Puente ------------------------------------------------------------
    $script:Stage = "install-bridge"
    $processInfo = Get-RepoProcesses -Repo $script:RepoDir
    $repoProcessCount = @($processInfo.processes).Count
    $probePorts = New-Object System.Collections.ArrayList
    if ($script:PortBound) { [void]$probePorts.Add($script:Port) }
    else {
        if (-not [string]::IsNullOrEmpty($env:DSH_LISTEN_PORT) -and $env:DSH_LISTEN_PORT -match '^\d+$') { [void]$probePorts.Add([int]$env:DSH_LISTEN_PORT) }
        [void]$probePorts.Add($script:DefaultPort)
    }
    if ($repoProcessCount -gt 0) {
        foreach ($process in @($processInfo.processes)) {
            if ([string]$process.Name -match "^node\.exe$") {
                foreach ($listeningPort in @(Get-ListeningPorts -ProcessId ([int]$process.ProcessId))) { [void]$probePorts.Add([int]$listeningPort) }
            }
        }
    }
    $uniqueProbePorts = @($probePorts | Where-Object { [int]$_ -ge 1 -and [int]$_ -le 65535 } | Select-Object -Unique)

    $runningPort = 0
    $runningHealth = $null
    $foreignPort = 0
    foreach ($probePort in $uniqueProbePorts) {
        $probe = Invoke-Healthz -Port ([int]$probePort) -TimeoutMs 2500
        if (-not $probe.ok) { continue }
        if ($repoProcessCount -eq 0) {
            if ($foreignPort -eq 0) { $foreignPort = [int]$probePort }
            continue
        }
        $runningPort = [int]$probePort
        $runningHealth = $probe
        break
    }

    $preferredPort = $script:DefaultPort
    if ($script:PortBound) { $preferredPort = $script:Port }
    elseif (-not [string]::IsNullOrEmpty($env:DSH_LISTEN_PORT) -and $env:DSH_LISTEN_PORT -match '^\d+$') { $preferredPort = [int]$env:DSH_LISTEN_PORT }

    if ($runningPort -gt 0 -and $script:Force) {
        # -Force reinstala de verdad: aunque el repo no cambie (por ejemplo con
        # -SkipClone), el puente se detiene y se vuelve a arrancar.
        $stopResult = Stop-Bridge -Repo $script:RepoDir
        if (-not $stopResult.ok) {
            Add-Step "bridge" "failed" ("No se pudo detener el puente para reinstalar: " + [string]$stopResult.error)
            Complete-Install 2
        }
        Add-Step "bridge-stop" "ok" ([string]$stopResult.detail)
        $runningPort = 0
        $runningHealth = $null
        $repoProcessCount = 0
    }

    if ($runningPort -gt 0) {
        $script:BridgeWasRunning = $true
        $script:ResolvedPort = $runningPort
        Add-Step "bridge" "skipped" ("ya estaba en marcha desde este repo en 127.0.0.1:" + [string]$runningPort + "; no se arranca otra instancia")
    } else {
        if ($repoProcessCount -gt 0) {
            if (-not $script:Force) {
                Add-Step "bridge" "failed" ("hay " + [string]$repoProcessCount + " proceso(s) de este repo que no responden en /healthz. Deten el puente con stop.bat o usa -Force para reinstalar.")
                Complete-Install 2
            }
            $stopResult = Stop-Bridge -Repo $script:RepoDir
            if (-not $stopResult.ok) {
                Add-Step "bridge" "failed" ("No se pudo detener el puente antes de arrancarlo: " + [string]$stopResult.error)
                Complete-Install 2
            }
            Add-Step "bridge-stop" "ok" ([string]$stopResult.detail)
        }
        if ($foreignPort -gt 0) {
            Add-Step "bridge" "failed" ("el puerto " + [string]$foreignPort + " responde como DSH Companion, pero no pertenece a este directorio. Deten esa instancia o usa -Port con otro puerto.")
            Complete-Install 2
        }
        $stopFlag = Join-Path $script:RepoDir "companion.stop"
        if (Test-Path -LiteralPath $stopFlag -PathType Leaf) {
            if ($script:Force) {
                Remove-Item -LiteralPath $stopFlag -Force -ErrorAction SilentlyContinue
                Add-Warning "Se elimino companion.stop por -Force (reinstalacion)."
            } else {
                Add-Step "bridge" "failed" ("existe companion.stop en " + $script:RepoDir + ". Borrala si no hay una parada en curso y vuelve a ejecutar (o usa -Force).")
                Complete-Install 2
            }
        }
        $script:ResolvedPort = $preferredPort
        $start = Start-BridgeProcess -Repo $script:RepoDir -Port $script:ResolvedPort
        if (-not $start.ok) {
            Add-Step "bridge" "failed" ("No se pudo lanzar run-hidden.vbs: " + [string]$start.error)
            Complete-Install 2
        }
        $script:StartedBridge = $true
        Add-Step "bridge" "ok" ("run-hidden.vbs lanzado de forma oculta; puerto " + [string]$script:ResolvedPort)
    }
    # El puerto resuelto se exporta para que doctor.ps1 (proceso hijo) compruebe
    # exactamente el mismo puerto, se haya arrancado ahora o ya estuviera vivo.
    $env:DSH_LISTEN_PORT = [string]$script:ResolvedPort
    Write-Log ("bridgePort=" + [string]$script:ResolvedPort)

    # ----- Verificacion: /healthz -------------------------------------------
    $script:Stage = "verify-healthz"
    $wait = $null
    if ($runningPort -gt 0 -and $null -ne $runningHealth) {
        $wait = [ordered]@{ ok = $true; attempts = 1; elapsedSeconds = 0; probe = $runningHealth; error = "" }
    } else {
        $wait = Wait-Healthz -Port $script:ResolvedPort -TimeoutSeconds $script:HealthTimeoutSeconds
    }
    if (-not $wait.ok) {
        $detail = "sin /healthz valido en 127.0.0.1:" + [string]$script:ResolvedPort + " tras " + [string]$wait.attempts + " intento(s) y " + [string]$wait.elapsedSeconds + " s: " + [string]$wait.error
        [void](Add-Check "healthz" $false $detail)
        Add-Step "healthz" "failed" $detail
        Complete-Install 3
    }
    $script:Health = $wait.probe
    $healthDetail = "HTTP 200 en 127.0.0.1:" + [string]$script:ResolvedPort + "; estado " + [string]$script:Health.state + "; version " + [string]$script:Health.bridgeVersion
    if ([string]$script:Health.bindHost -ne "") { $healthDetail += "; enlace " + [string]$script:Health.bindHost }
    if ($script:Health.state -ne "ok") {
        [void](Add-Check "healthz" $true $healthDetail)
        Add-Step "healthz" "warning" ($healthDetail + " (estado degradado: alguna pieza del contrato con Harness cambio)")
        Add-Warning ("/healthz devolvio estado '" + [string]$script:Health.state + "': el puente funciona en modo degradado.")
    } else {
        [void](Add-Check "healthz" $true $healthDetail)
        Add-Step "healthz" "ok" ($healthDetail + "; " + [string]$wait.attempts + " intento(s), " + [string]$wait.elapsedSeconds + " s")
    }

    # ----- Verificacion: doctor y recibo ------------------------------------
    $script:Stage = "verify-doctor"
    $doctorResult = Invoke-Doctor -Repo $script:RepoDir
    $script:Doctor = $doctorResult
    $script:DoctorReportPath = [string]$doctorResult.reportPath
    if (-not $doctorResult.available) {
        Add-Step "doctor" "skipped" ([string]$doctorResult.error)
        Add-Warning "El repo no incluye doctor.ps1: la verificacion se limita a /healthz."
    } else {
        foreach ($doctorWarning in @($doctorResult.warnings)) {
            if ($null -ne $doctorWarning -and [string]$doctorWarning -ne "") { Add-Warning ([string]$doctorWarning) }
        }
        if (-not $doctorResult.ok) {
            $firstBlocker = ""
            foreach ($blocker in @($doctorResult.blockers)) { if ([string]$blocker -ne "") { $firstBlocker = [string]$blocker; break } }
            $detail = "doctor.ps1 ok=false (codigo " + [string]$doctorResult.exitCode + ")"
            if ($firstBlocker -ne "") { $detail += "; primer blocker: " + (Limit-Text $firstBlocker 240) }
            [void](Add-Check "doctor" $false $detail)
            Add-Step "doctor" "failed" $detail
            Complete-Install 3
        }
        [void](Add-Check "doctor" $true ("ok=true; bridgeVersion=" + [string](Get-Field $doctorResult.json "bridgeVersion" "") + "; phoneUrl=" + [string](Get-Field $doctorResult.json "phoneUrl" "")))
        Add-Step "doctor" "ok" ("doctor.ps1 -Json -Report ok=true; informe en " + $(if ($script:DoctorReportPath -ne "") { $script:DoctorReportPath } else { "(no escrito)" }))
    }

    $script:Stage = "verify-receipt"
    $receiptResult = Invoke-ReceiptCheck -Repo $script:RepoDir -ReportPath $script:DoctorReportPath -NodeExe $script:NodeExe
    $receiptSha = ""
    if ($null -ne $doctorResult.json) {
        $receiptObject = Get-Field $doctorResult.json "receipt" $null
        if ($null -ne $receiptObject) { $receiptSha = [string](Get-Field $receiptObject "sha256" "") }
    }
    $script:Receipt = [ordered]@{
        ok = [bool]$receiptResult.ok
        verified = [bool]($receiptResult.available -and $receiptResult.ok)
        sha256 = $receiptSha
        detail = [string]$receiptResult.detail
    }
    if (-not $receiptResult.available) {
        Add-Step "receipt" "skipped" ([string]$receiptResult.detail)
        Add-Warning ("No se pudo verificar el recibo de doctor-report.json: " + [string]$receiptResult.detail)
    } elseif (-not $receiptResult.ok) {
        # Un clon limpio del repo no trae DSH-Companion.apk (no se versiona): el
        # puente publica apkVersion pero apkSha256 queda vacio y verify-receipt lo
        # marca como incoherente. Es una limitacion conocida de la copia, no una
        # instalacion rota: se reporta como AVISO y la verificacion sigue con
        # /healthz y doctor. Cualquier otro hallazgo si es fallo de verificacion.
        $apkPath = Join-Path $script:RepoDir "DSH-Companion.apk"
        $apkMissing = -not (Test-Path -LiteralPath $apkPath -PathType Leaf)
        $doctorApkVersion = ""
        $doctorApkSha = ""
        if ($null -ne $doctorResult.json) {
            $doctorApkVersion = [string](Get-Field $doctorResult.json "apkVersion" "")
            $doctorApkSha = [string](Get-Field $doctorResult.json "apkSha256" "")
        }
        $benignReceipt = ($apkMissing -and $doctorApkVersion -ne "" -and $doctorApkSha -eq "")
        if ($benignReceipt) {
            [void](Add-Check "receipt" $false ("sin APK local (no se versiona): no hay ancla SHA-256 que comparar; usa el SHA del release publicado y la huella del certificado"))
            Add-Step "receipt" "warning" ([string]$receiptResult.detail + " (limitacion conocida: el APK no esta en la copia del repo)")
            Add-Warning ("El recibo no se pudo verificar porque esta copia del repo no incluye DSH-Companion.apk (no se versiona): " + [string]$receiptResult.detail)
        } else {
            [void](Add-Check "receipt" $false ([string]$receiptResult.detail))
            Add-Step "receipt" "failed" ([string]$receiptResult.detail)
            Complete-Install 3
        }
    } else {
        [void](Add-Check "receipt" $true ([string]$receiptResult.detail))
        Add-Step "receipt" "ok" ([string]$receiptResult.detail)
    }

    # ----- Inicio automatico -------------------------------------------------
    $script:Stage = "autostart"
    if ($script:RegisterAutostart) {
        if ($script:PortBound) {
            $currentPort = ""
            try { $currentPort = [string][System.Environment]::GetEnvironmentVariable("DSH_LISTEN_PORT", "User") } catch { $currentPort = "" }
            if ($currentPort -ne [string]$script:Port) {
                try {
                    [System.Environment]::SetEnvironmentVariable("DSH_LISTEN_PORT", [string]$script:Port, "User")
                    Add-Step "env-port" "ok" ("DSH_LISTEN_PORT=" + [string]$script:Port + " guardado en el entorno del usuario para el inicio automatico")
                } catch {
                    Add-Step "env-port" "failed" ("No se pudo guardar DSH_LISTEN_PORT en el entorno del usuario: " + $_.Exception.Message)
                    Complete-Install 2
                }
            } else {
                Add-Step "env-port" "skipped" ("DSH_LISTEN_PORT ya valia " + [string]$script:Port + " en el entorno del usuario")
            }
        } else {
            Add-Step "env-port" "skipped" "sin -Port no hay variable que guardar"
        }
        $autostart = Register-Autostart -Repo $script:RepoDir
        if (-not $autostart.ok) {
            Add-Step "autostart" "failed" ([string]$autostart.error)
            Complete-Install 2
        }
        $script:AutostartRegistered = $true
        $script:AutostartPath = [string]$autostart.path
        if ($autostart.skipped) { Add-Step "autostart" "skipped" ([string]$autostart.detail) }
        else { Add-Step "autostart" "ok" ([string]$autostart.detail + ": " + $script:AutostartPath) }
    } else {
        Add-Step "autostart" "skipped" "no solicitado; anade -RegisterAutostart para que el puente arranque con Windows"
    }

    Add-Step "pairing" "skipped" "el emparejamiento NO es automatico; cuando el telefono muestre el codigo, ejecuta panel.bat"

    if ($script:LogPath -ne "") {
        Add-Step "log" "ok" ("log guardado en " + $script:LogPath + " (sin secretos)")
    } else {
        Add-Step "log" "skipped" "no se pudo escribir el log en %TEMP%"
    }

    Complete-Install 0
} catch {
    $message = $_.Exception.Message
    Add-Step "error" "failed" ("Error inesperado: " + (Limit-Text $message 400))
    switch ($script:Stage) {
        "params" { Complete-Install 4 }
        "preflight" { Complete-Install 1 }
        "verify-healthz" { Complete-Install 3 }
        "verify-doctor" { Complete-Install 3 }
        "verify-receipt" { Complete-Install 3 }
        default { Complete-Install 2 }
    }
}
