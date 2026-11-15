# ==============================================================================
# DSH Mobile Companion - install-agent.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Punto de entrada unico para que un agente de IA instale DSH Mobile Companion
# de principio a fin, de forma idempotente y con evidencia verificable.
#
#   powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Json
#   powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Json -SkipClone
#   powershell -ExecutionPolicy Bypass -File install-agent.ps1 -RegisterAutostart
#
# Que hace, en orden:
#   1. Comprueba PowerShell 5.1 o superior y que sea Windows.
#   2. Localiza el repo (o lo clona en -Dir si no existe).
#   3. Comprueba Node 22.15 o superior (primero el runtime de DSH, luego PATH).
#   4. Ejecuta doctor.ps1 -Json -Report y mapea cada FAIL/AVISO con las soluciones
#      de doctor-fixes.json. Si falta algo que no sea el puente detenido, se para
#      y sale 1 sin tocar nada mas.
#   5. Si lo unico que falta es que el puente este detenido, lo arranca con
#      run-hidden.vbs (nunca install-autostart.bat) y espera a que responda.
#   6. Vuelve a ejecutar doctor.ps1 para confirmar.
#   7. Con -RegisterAutostart, registra el acceso directo de Inicio.
#   8. Emite el informe: JSON si -Json, texto claro si no.
#
# Salida: 0 = doctor final ok=true (puente verificado); 1 = falta algo, con el
# comando exacto que lo corrige. -Json imprime SOLO el JSON en stdout.
#
# Seguridad: no imprime ni lee la clave de acceso, el token del panel, cookies
# ni .credentials.yaml; no abre puertos; no descarga binarios sueltos (solo hace
# git clone del repo); no ejecuta el kill switch.
# ==============================================================================

param(
    [string]$Dir = (Join-Path $env:USERPROFILE "dsh-mobile-companion"),
    [string]$RepoUrl = "https://github.com/TintaYNodos/dsh-mobile-companion.git",
    [switch]$Start = $true,
    [switch]$RegisterAutostart,
    [switch]$Json,
    [switch]$SkipClone
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:DirBound = $PSBoundParameters.ContainsKey("Dir")
$script:RepoUrl = $RepoUrl
$script:RepoDir = ""
$script:NodeExe = ""
$script:NodeVersion = ""
$script:Fixes = $null
$script:Doctor = $null
$script:DoctorReportPath = ""
$script:BridgeStarted = $false
$script:AutostartRegistered = $false
$script:Ok = $false
$script:Steps = New-Object System.Collections.ArrayList
$script:Blockers = New-Object System.Collections.ArrayList
$script:Warnings = New-Object System.Collections.ArrayList
$script:Notes = New-Object System.Collections.ArrayList

# ------------------------------------------------------------------------------
# Registro de pasos y del informe
# ------------------------------------------------------------------------------

function Write-Human {
    param([string]$Text = "", [string]$Color = "")
    if ($Json) { return }
    if ($Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Detail)
    [void]$script:Steps.Add([ordered]@{ step = $Name; status = $Status; detail = $Detail })
    if ($Json) { return }
    switch ($Status) {
        "ok"      { Write-Host ("  [ OK ] " + $Detail) -ForegroundColor Green }
        "skipped" { Write-Host ("  [SALTA] " + $Detail) -ForegroundColor DarkGray }
        default   { Write-Host ("  [FALLA] " + $Detail) -ForegroundColor Red }
    }
}

function Read-TextFileAny {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($null -eq $bytes -or $bytes.Length -eq 0) { return "" }
    $strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)
    try { $text = $strictUtf8.GetString($bytes) } catch { $text = [System.Text.Encoding]::Default.GetString($bytes) }
    return $text.TrimStart([char]0xFEFF)
}

function Get-Field {
    param($Object, [string]$Name, $Default = $null)
    if ($null -eq $Object) { return $Default }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $Default
    }
    $prop = $Object.PSObject.Properties[$Name]
    if ($null -eq $prop) { return $Default }
    return $prop.Value
}

function Get-ListField {
    param($Object, [string]$Name)
    $value = Get-Field $Object $Name $null
    if ($null -eq $value) { return @() }
    return @($value)
}

function Add-RawEntry {
    param([string]$Level, [string]$Message, [string]$Title = "", [string]$Command = "", [string]$Docs = "")
    $commandText = $null
    if ($Command -ne "") { $commandText = $Command }
    $entry = [ordered]@{
        message  = $Message
        fix      = $null
        title    = $Title
        command  = $commandText
        docs     = $Docs
        blocking = ($Level -eq "FAIL")
        mapped   = $false
    }
    if ($Level -eq "FAIL") { [void]$script:Blockers.Add($entry) } else { [void]$script:Warnings.Add($entry) }
}

function Add-FixEntry {
    param($Fix, [string]$Message, [string]$Level)
    $commandValue = Get-Field $Fix "command" $null
    $commandText = $null
    if ($null -ne $commandValue) { $commandText = [string]$commandValue }
    $entry = [ordered]@{
        message  = $Message
        fix      = [string](Get-Field $Fix "id" "")
        title    = [string](Get-Field $Fix "title" "")
        command  = $commandText
        docs     = [string](Get-Field $Fix "docs" "")
        blocking = [bool](Get-Field $Fix "blocking" ($Level -eq "FAIL"))
        mapped   = $true
    }
    if ($Level -eq "FAIL") { [void]$script:Blockers.Add($entry) } else { [void]$script:Warnings.Add($entry) }
}

function Add-Note {
    param([string]$Message, [string]$Title = "", [string]$Command = "", [string]$Docs = "")
    $commandText = $null
    if ($Command -ne "") { $commandText = $Command }
    [void]$script:Notes.Add([ordered]@{
        message  = $Message
        fix      = $null
        title    = $Title
        command  = $commandText
        docs     = $Docs
        blocking = $false
        mapped   = $false
    })
}

# ------------------------------------------------------------------------------
# Mapa de soluciones (doctor-fixes.json): el mismo algoritmo que
# skills/mobile-companion-setup/scripts/verify-fixes.mjs
# ------------------------------------------------------------------------------

function Get-MapFix {
    param([string]$Message)
    if ($null -eq $script:Fixes -or $null -eq $script:Fixes.fixes) { return $null }
    if ([string]::IsNullOrWhiteSpace($Message)) { return $null }
    $best = $null
    $bestScore = -1
    $tie = $false
    foreach ($prop in $script:Fixes.fixes.PSObject.Properties) {
        $fix = $prop.Value
        $runtime = Get-Field $fix "matchRuntime" $null
        if ($null -eq $runtime) { continue }
        if ($runtime -is [array]) { $parts = @($runtime) } else { $parts = @([string]$runtime) }
        if ($parts.Count -eq 0) { continue }
        $matched = $true
        foreach ($part in $parts) {
            if ($part -isnot [string] -or $part.Length -eq 0 -or -not $Message.Contains($part)) { $matched = $false; break }
        }
        if (-not $matched) { continue }
        $score = 0
        foreach ($part in $parts) { $score += $part.Length }
        if ($score -gt $bestScore) {
            $best = $fix
            $bestScore = $score
            $tie = $false
        } elseif ($score -eq $bestScore) {
            $tie = $true
        }
    }
    if ($null -eq $best -or $tie) { return $null }
    return $best
}

function Get-MapFixById {
    param([string]$Id)
    if ($null -eq $script:Fixes -or $null -eq $script:Fixes.fixes) { return $null }
    $prop = $script:Fixes.fixes.PSObject.Properties[$Id]
    if ($null -eq $prop) { return $null }
    return $prop.Value
}

function Add-DoctorMessage {
    param([string]$Level, [string]$Message)
    if ([string]::IsNullOrWhiteSpace($Message)) { return }
    $fix = Get-MapFix $Message
    if ($null -ne $fix) {
        Add-FixEntry $fix $Message $Level
        return
    }
    if ($Level -eq "FAIL") {
        Add-RawEntry "FAIL" $Message "Mensaje sin solucion verificada en doctor-fixes.json" "" "doctor-fixes.json"
    } else {
        Add-RawEntry "WARN" $Message "Aviso sin solucion verificada en doctor-fixes.json" "" "doctor-fixes.json"
    }
}

function Import-DoctorMessages {
    param($Report)
    $script:Blockers = New-Object System.Collections.ArrayList
    $script:Warnings = New-Object System.Collections.ArrayList
    if ($null -eq $Report) { return }
    foreach ($message in @(Get-ListField $Report "warnings")) {
        if ($null -ne $message) { Add-DoctorMessage "WARN" ([string]$message) }
    }
    $blockers = @(Get-ListField $Report "blockers")
    if ($blockers.Count -eq 0 -and (Get-Field $Report "ok" $true) -eq $false) {
        foreach ($check in @(Get-ListField $Report "checks")) {
            if ((Get-Field $check "level" "") -eq "FAIL") { $blockers += [string](Get-Field $check "message" "") }
        }
    }
    foreach ($message in $blockers) {
        if ($null -ne $message) { Add-DoctorMessage "FAIL" ([string]$message) }
    }
    if ((Get-Field $Report "ok" $true) -eq $false -and $script:Blockers.Count -eq 0) {
        Add-RawEntry "FAIL" "doctor.ps1 devolvio ok=false sin blockers ni checks FAIL: informe incoherente." "Diagnostico incoherente" "powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report" "doctor.ps1"
    }
}

# ------------------------------------------------------------------------------
# Entorno
# ------------------------------------------------------------------------------

function Start-InstallAgent {
    Write-Human ""
    Write-Human "== DSH Mobile Companion - instalador para agentes ==" Cyan
    Write-Human ("   Repo objetivo: " + $Dir)
    if (-not $SkipClone) {
        Write-Human "   Si ya tienes el repo en este equipo, anade -SkipClone para usar esa copia." DarkGray
    }
    Write-Human ""
}

function Test-RepoContent {
    param([string]$Path)
    $missing = New-Object System.Collections.ArrayList
    foreach ($name in @("doctor.ps1", "doctor-fixes.json", "bridge.mjs", "run-hidden.vbs")) {
        if (-not (Test-Path -LiteralPath (Join-Path $Path $name))) { [void]$missing.Add($name) }
    }
    return ,$missing
}

function Resolve-Repo {
    param([bool]$Skip, [string]$Target)
    $result = [ordered]@{ ok = $false; repoDir = ""; detail = ""; error = ""; needGit = $false }
    if ($Skip) {
        $candidates = New-Object System.Collections.ArrayList
        if ($script:DirBound -and (Test-Path -LiteralPath $Target)) { [void]$candidates.Add($Target) }
        if (-not [string]::IsNullOrEmpty($PSScriptRoot) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "doctor.ps1"))) { [void]$candidates.Add($PSScriptRoot) }
        if (Test-Path -LiteralPath $Target) { [void]$candidates.Add($Target) }
        foreach ($candidate in $candidates) {
            $full = (Resolve-Path -LiteralPath $candidate).Path
            $missing = Test-RepoContent $full
            if ($missing.Count -eq 0) {
                $result.ok = $true
                $result.repoDir = $full
                $result.detail = "Repo existente reutilizado (-SkipClone): " + $full
                return $result
            }
        }
        $result.error = "No encuentro un repo completo con doctor.ps1 y doctor-fixes.json para -SkipClone. Ejecuta desde la raiz del repo o pasa -Dir con la ruta correcta."
        return $result
    }
    if (Test-Path -LiteralPath $Target) {
        $full = (Resolve-Path -LiteralPath $Target).Path
        if (Test-Path -LiteralPath (Join-Path $full "doctor.ps1")) {
            $missing = Test-RepoContent $full
            if ($missing.Count -gt 0) {
                $result.error = "La carpeta " + $full + " parece el repo pero le faltan: " + ($missing -join ", ")
                return $result
            }
            $result.ok = $true
            $result.repoDir = $full
            if (Test-Path -LiteralPath (Join-Path $full ".git")) {
                $result.detail = "Repo existente reutilizado: " + $full
            } else {
                $result.detail = "Carpeta existente reutilizada (sin .git, copia del ZIP): " + $full
            }
            return $result
        }
        $children = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue)
        if ($children.Count -gt 0) {
            $result.error = "La carpeta " + $full + " ya existe y no contiene doctor.ps1. Usa otra -Dir o vacia esa carpeta."
            return $result
        }
    }
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($null -eq $gitCommand -or [string]::IsNullOrEmpty([string]$gitCommand.Source)) {
        $result.needGit = $true
        $result.error = "No hay git instalado. Instala Git o descarga el ZIP del repo en https://github.com/TintaYNodos/dsh-mobile-companion/archive/refs/heads/main.zip y ejecuta con -SkipClone desde esa carpeta."
        return $result
    }
    $existedBefore = Test-Path -LiteralPath $Target
    $parent = Split-Path -Parent $Target
    if (-not [string]::IsNullOrEmpty($parent) -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $cloneErr = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-install-clone-" + [guid]::NewGuid().ToString("N") + ".err")
    $cloneCode = 1
    try {
        $null = & $gitCommand.Source clone --depth 1 $script:RepoUrl $Target 2> $cloneErr
        $cloneCode = $LASTEXITCODE
    } catch {
        $cloneCode = 1
    }
    $cloneErrorText = ""
    if (Test-Path -LiteralPath $cloneErr) {
        $cloneErrorText = (Read-TextFileAny $cloneErr).Trim()
        Remove-Item -LiteralPath $cloneErr -Force -ErrorAction SilentlyContinue
    }
    if ($cloneCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $Target "doctor.ps1"))) {
        if (-not $existedBefore -and (Test-Path -LiteralPath $Target)) {
            $resolvedClone = (Resolve-Path -LiteralPath $Target).Path
            if ($resolvedClone -eq [System.IO.Path]::GetFullPath($Target)) {
                Remove-Item -LiteralPath $resolvedClone -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        $result.error = "git clone fallo (codigo " + [string]$cloneCode + ")."
        if ($cloneErrorText -ne "") {
            $result.error = $result.error + " Detalle: " + (($cloneErrorText -split "`r?`n")[0]) + "."
        }
        $result.error = $result.error + " Comprueba la conexion o descarga el ZIP en https://github.com/TintaYNodos/dsh-mobile-companion/archive/refs/heads/main.zip y ejecuta con -SkipClone."
        return $result
    }
    $full = (Resolve-Path -LiteralPath $Target).Path
    $result.ok = $true
    $result.repoDir = $full
    $result.detail = "Repo clonado en " + $full
    return $result
}

function Resolve-Node {
    $candidates = New-Object System.Collections.ArrayList
    $dshNode = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    if (Test-Path -LiteralPath $dshNode) { [void]$candidates.Add($dshNode) }
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($null -ne $nodeCommand -and -not [string]::IsNullOrEmpty([string]$nodeCommand.Source)) { [void]$candidates.Add([string]$nodeCommand.Source) }
    $programNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path -LiteralPath $programNode) { [void]$candidates.Add($programNode) }
    $oldest = $null
    foreach ($exe in $candidates) {
        $version = ""
        try {
            $rawVersion = (& $exe --version 2>$null)
            if ($null -ne $rawVersion) { $version = ([string]$rawVersion).Trim() }
        } catch {
            continue
        }
        if ($version -match "^v(\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            $cleanVersion = $version -replace "^v", ""
            if ($major -gt 22 -or ($major -eq 22 -and $minor -ge 15)) {
                return [ordered]@{ ok = $true; exe = $exe; version = $cleanVersion; error = "" }
            }
            if ($null -eq $oldest) { $oldest = [ordered]@{ exe = $exe; version = $cleanVersion } }
        } elseif ($null -eq $oldest) {
            $oldest = [ordered]@{ exe = $exe; version = "" }
        }
    }
    if ($null -ne $oldest) {
        $message = "Node v" + $oldest.version + " es demasiado antiguo; hace falta 22.15 o superior."
        if ($oldest.version -eq "") { $message = "Node encontrado en " + $oldest.exe + " pero no se pudo leer su version; hace falta 22.15 o superior." }
        return [ordered]@{ ok = $false; exe = $oldest.exe; version = $oldest.version; error = $message }
    }
    return [ordered]@{ ok = $false; exe = ""; version = ""; error = "No encuentro Node.js. Hace falta 22.15 o superior." }
}

# ------------------------------------------------------------------------------
# Diagnostico
# ------------------------------------------------------------------------------

function Invoke-Doctor {
    param([string]$Repo)
    $doctor = Join-Path $Repo "doctor.ps1"
    if (-not (Test-Path -LiteralPath $doctor)) {
        return [ordered]@{ exitCode = $null; json = $null; error = "No existe doctor.ps1 en el repo."; reportPath = "" }
    }
    $psExe = (Get-Process -Id $PID).Path
    if ([string]::IsNullOrEmpty([string]$psExe)) { $psExe = "powershell.exe" }
    $errFile = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-install-doctor-" + [guid]::NewGuid().ToString("N") + ".err")
    $exitCode = $null
    $raw = ""
    $errText = ""
    try {
        $raw = (& $psExe -NoProfile -ExecutionPolicy Bypass -File $doctor -Json -Report 2> $errFile | Out-String)
        $exitCode = $LASTEXITCODE
    } catch {
        $raw = ""
        $errText = $_.Exception.Message
    } finally {
        if (Test-Path -LiteralPath $errFile) {
            $fileErr = (Read-TextFileAny $errFile).Trim()
            if ($fileErr -ne "") { $errText = $fileErr }
            Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
        }
    }
    $trimmed = ([string]$raw).Trim()
    $trimmed = $trimmed.TrimStart([char]0xFEFF).Trim()
    $json = $null
    if ($trimmed.Length -gt 0) {
        try { $json = $trimmed | ConvertFrom-Json } catch { $json = $null }
    }
    if ($null -eq $json) {
        $errorText = "doctor.ps1 no devolvio JSON valido (codigo de salida " + [string]$exitCode + ")."
        if ($errText -ne "") {
            $errorText = $errorText + " " + (($errText -split "`r?`n")[0])
        } elseif ($trimmed.Length -gt 0) {
            $errorText = $errorText + " Salida: " + $trimmed.Substring(0, [Math]::Min(400, $trimmed.Length))
        }
        return [ordered]@{ exitCode = $exitCode; json = $null; error = $errorText; reportPath = "" }
    }
    $reportPath = Join-Path $Repo "doctor-report.json"
    if (-not (Test-Path -LiteralPath $reportPath)) { $reportPath = "" }
    return [ordered]@{ exitCode = $exitCode; json = $json; error = ""; reportPath = $reportPath }
}

# ------------------------------------------------------------------------------
# Puente
# ------------------------------------------------------------------------------

function Test-BridgeListening {
    param([string]$Address, [int]$Port)
    if ([string]::IsNullOrEmpty($Address) -or $Port -le 0) { return $false }
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($Address, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(1500)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        try { $client.Close() } catch { }
    }
}

function Get-RepoBridgeProcesses {
    param([string]$Repo)
    $found = New-Object System.Collections.ArrayList
    try {
        $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'wscript.exe' OR Name = 'cmd.exe'" -ErrorAction Stop)
    } catch {
        return [ordered]@{ queried = $false; processes = @() }
    }
    foreach ($process in $processes) {
        $commandLine = [string]$process.CommandLine
        if ([string]::IsNullOrEmpty($commandLine)) { continue }
        if ($commandLine.IndexOf($Repo, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        $isBridge = ($commandLine.IndexOf("bridge.mjs", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
        $isSupervisor = ($commandLine.IndexOf("run-hidden.vbs", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
        if (-not ($isBridge -or $isSupervisor)) { continue }
        [void]$found.Add($process)
    }
    return [ordered]@{ queried = $true; processes = @($found) }
}

function Register-AutostartShortcut {
    param([string]$Repo)
    $vbs = Join-Path $Repo "run-hidden.vbs"
    if (-not (Test-Path -LiteralPath $vbs)) {
        return [ordered]@{ ok = $false; path = ""; error = "Falta run-hidden.vbs en " + $Repo }
    }
    try {
        $startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
        if (-not (Test-Path -LiteralPath $startup)) { New-Item -ItemType Directory -Force -Path $startup | Out-Null }
        $shortcutPath = Join-Path $startup "DSH-Mobile-Companion.lnk"
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "wscript.exe"
        $shortcut.Arguments = '"' + $vbs + '"'
        $shortcut.WorkingDirectory = $Repo
        $shortcut.Description = "DeepSeek Harness Mobile Companion Auto-Start"
        $shortcut.Save()
        if (-not (Test-Path -LiteralPath $shortcutPath)) {
            return [ordered]@{ ok = $false; path = ""; error = "No se creo el acceso directo de Inicio." }
        }
        return [ordered]@{ ok = $true; path = $shortcutPath; error = "" }
    } catch {
        return [ordered]@{ ok = $false; path = ""; error = $_.Exception.Message }
    }
}

# ------------------------------------------------------------------------------
# Informe final
# ------------------------------------------------------------------------------

function Complete-Install {
    param([int]$ExitCode)
    $script:Ok = ($ExitCode -eq 0)
    $last = $script:Doctor
    $warningsAll = New-Object System.Collections.ArrayList
    foreach ($note in $script:Notes) { [void]$warningsAll.Add($note) }
    foreach ($warning in $script:Warnings) { [void]$warningsAll.Add($warning) }
    $nodeVersion = [string](Get-Field $last "nodeVersion" "")
    if ($nodeVersion -eq "") { $nodeVersion = $script:NodeVersion }
    $report = [ordered]@{
        tool                = "dsh-companion-install-agent"
        reportVersion       = 1
        ok                  = [bool]$script:Ok
        repoDir             = $script:RepoDir
        repoUrl             = $script:RepoUrl
        nodeVersion         = $nodeVersion
        bridgeVersion       = [string](Get-Field $last "bridgeVersion" "")
        phoneUrl            = [string](Get-Field $last "phoneUrl" "")
        tunnel              = [string](Get-Field $last "tunnel" "")
        bridgePort          = [string](Get-Field $last "bridgePort" "")
        panelPort           = [string](Get-Field $last "panelPort" "")
        reportPath          = $script:DoctorReportPath
        started             = [bool]$script:BridgeStarted
        autostartRegistered = [bool]$script:AutostartRegistered
        steps               = @($script:Steps)
        blockers            = @($script:Blockers)
        warnings            = @($warningsAll)
        generatedAt         = (Get-Date).ToString("o")
    }
    if ($Json) {
        $text = ($report | ConvertTo-Json -Depth 8)
        $encoder = New-Object System.Text.UTF8Encoding($false)
        $bytes = $encoder.GetBytes($text + "`r`n")
        $stdout = [System.Console]::OpenStandardOutput()
        $stdout.Write($bytes, 0, $bytes.Length)
        $stdout.Flush()
        exit $ExitCode
    }
    if ($script:Ok) {
        Write-Human ""
        Write-Human "  LISTO: el diagnostico final dice ok=true y el puente responde." Green
        Write-Human ("  Tunel:            " + [string](Get-Field $last "tunnel" ""))
        Write-Human ("  URL del telefono: " + [string](Get-Field $last "phoneUrl" ""))
        Write-Human ("  Puente:           version " + [string](Get-Field $last "bridgeVersion" ""))
        Write-Human ("  Panel:            127.0.0.1:" + [string](Get-Field $last "panelPort" ""))
        if ($script:DoctorReportPath -ne "") { Write-Human ("  Informe:          " + $script:DoctorReportPath) }
        Write-Human ""
        Write-Human "  Emparejamiento: cuando el telefono muestre un codigo, ejecuta panel.bat en la PC." White
        if ($warningsAll.Count -gt 0) {
            Write-Human ""
            Write-Human "  AVISOS (no cambian la salida, pero pueden impedir que el telefono funcione):" Yellow
            foreach ($warning in $warningsAll) {
                Write-Human ("   [AVISO] " + [string]$warning.message) Yellow
                if ($warning.title) { Write-Human ("           Que revisar: " + [string]$warning.title) DarkGray }
                if ($warning.command) { Write-Human ("           Comando:     " + [string]$warning.command) DarkGray }
                if ($warning.docs) { Write-Human ("           Docs:        " + [string]$warning.docs) DarkGray }
            }
        }
        Write-Human ""
    } else {
        Write-Human ""
        Write-Human "  NO ESTA LISTO: falta algo y aqui esta la salida exacta." Red
        if ($script:Blockers.Count -eq 0) { Write-Human "   No hay blockers registrados; revisa los pasos de arriba." }
        foreach ($blocker in $script:Blockers) {
            Write-Human ("   [FALLA] " + [string]$blocker.message) Red
            if ($blocker.title) { Write-Human ("           Que falta: " + [string]$blocker.title) DarkGray }
            if ($blocker.command) {
                Write-Human ("           Comando:   " + [string]$blocker.command) Yellow
            } elseif ($blocker.mapped) {
                Write-Human "           Comando:   requiere accion humana (no hay comando automatico)" DarkGray
            }
            if ($blocker.docs) { Write-Human ("           Docs:      " + [string]$blocker.docs) DarkGray }
            if (-not $blocker.mapped) {
                Write-Human "           SIN MAPA: no improvises; reporta el mensaje exacto y anade el fix a doctor-fixes.json." Yellow
            }
        }
        Write-Human ""
        Write-Human "  Cuando corrijas lo marcado, vuelve a ejecutar:" White
        Write-Human "    powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Json" Cyan
        Write-Human ""
    }
    exit $ExitCode
}

# ------------------------------------------------------------------------------
# Flujo principal
# ------------------------------------------------------------------------------

Start-InstallAgent

try {
    if ($env:OS -ne "Windows_NT") {
        Add-Step "powershell" "failed" "Este instalador solo soporta Windows; en macOS/Linux usa install-launchd.sh o install-systemd.sh."
        Add-RawEntry "FAIL" "install-agent.ps1 solo soporta Windows porque doctor.ps1 y el arranque silencioso usan APIs de Windows." "Sistema operativo no soportado" "powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Json" "README.md"
        Complete-Install 1
    }
    $psVersion = $PSVersionTable.PSVersion
    if ($psVersion.Major -lt 5 -or ($psVersion.Major -eq 5 -and $psVersion.Minor -lt 1)) {
        Add-Step "powershell" "failed" ("PowerShell " + $psVersion.ToString() + " es antiguo; hace falta 5.1 o superior.")
        Add-RawEntry "FAIL" ("PowerShell " + $psVersion.ToString() + " es antiguo. Abre una consola de Windows PowerShell 5.1 o superior y repite.") "PowerShell demasiado antiguo" "powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Json" "README.md"
        Complete-Install 1
    }
    Add-Step "powershell" "ok" ("PowerShell " + $psVersion.ToString())

    $repoResult = Resolve-Repo -Skip ([bool]$SkipClone) -Target $Dir
    if (-not $repoResult.ok) {
        Add-Step "repo" "failed" $repoResult.error
        if ($repoResult.needGit) {
            Add-RawEntry "FAIL" $repoResult.error "Falta Git o el ZIP del repo" "winget install --id Git.Git -e" "https://github.com/TintaYNodos/dsh-mobile-companion/archive/refs/heads/main.zip"
        } else {
            Add-RawEntry "FAIL" $repoResult.error "El repo no esta disponible en -Dir" ('git clone ' + $script:RepoUrl + ' "' + $Dir + '"') $script:RepoUrl
        }
        Complete-Install 1
    }
    $script:RepoDir = $repoResult.repoDir
    Add-Step "repo" "ok" $repoResult.detail
    if (-not (Test-Path -LiteralPath (Join-Path $script:RepoDir ".git"))) {
        Add-Note "La carpeta del repo no tiene .git (copia del ZIP): se usa tal cual; para actualizar, clona con git." "Copia sin historial de git" "" $script:RepoUrl
    }

    $fixesPath = Join-Path $script:RepoDir "doctor-fixes.json"
    try {
        $script:Fixes = (Read-TextFileAny $fixesPath) | ConvertFrom-Json
    } catch {
        $script:Fixes = $null
    }
    if ($null -eq $script:Fixes -or $null -eq $script:Fixes.fixes) {
        Add-Step "map" "failed" "doctor-fixes.json es ilegible o no tiene la clave fixes."
        Add-RawEntry "FAIL" ("El mapa de soluciones es ilegible o invalido: " + $fixesPath + ". Sin el mapa no se puede decir que comando corrige cada fallo.") "Mapa de soluciones ilegible" "node skills/mobile-companion-setup/scripts/verify-fixes.mjs static" "skills/mobile-companion-setup/references/fixes.md"
        Complete-Install 1
    }
    $fixCount = @($script:Fixes.fixes.PSObject.Properties).Count
    Add-Step "map" "ok" ("doctor-fixes.json cargado (" + [string]$fixCount + " soluciones)")

    $nodeResult = Resolve-Node
    if (-not $nodeResult.ok) {
        Add-Step "node" "failed" $nodeResult.error
        $nodeFixId = "node-too-old"
        if ($nodeResult.exe -eq "") { $nodeFixId = "node-missing" }
        $nodeFix = Get-MapFixById $nodeFixId
        if ($null -ne $nodeFix) {
            Add-FixEntry $nodeFix $nodeResult.error "FAIL"
        } else {
            Add-RawEntry "FAIL" $nodeResult.error "Falta Node.js 22.15 o superior" "winget install --id OpenJS.NodeJS.LTS -e" "https://nodejs.org/en/download"
        }
        Complete-Install 1
    }
    $script:NodeExe = $nodeResult.exe
    $script:NodeVersion = $nodeResult.version
    Add-Step "node" "ok" ("Node v" + $nodeResult.version + " (" + $nodeResult.exe + ")")

    $pre = Invoke-Doctor $script:RepoDir
    if ($null -eq $pre.json) {
        Add-Step "doctor-preflight" "failed" $pre.error
        Add-RawEntry "FAIL" $pre.error "doctor.ps1 no devolvio JSON" "powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report" "doctor.ps1"
        Complete-Install 1
    }
    $script:Doctor = $pre.json
    $script:DoctorReportPath = [string]$pre.reportPath
    Import-DoctorMessages $pre.json
    $preOk = [bool](Get-Field $pre.json "ok" $false)
    $recoverableIds = @("bridge-unreachable", "panel-not-listening")
    $fatalCount = 0
    $recoverableCount = 0
    foreach ($blocker in $script:Blockers) {
        if ($blocker.mapped -and ($recoverableIds -contains $blocker.fix) -and $blocker.blocking) {
            $recoverableCount++
        } else {
            $fatalCount++
        }
    }
    if ($preOk) {
        Add-Step "doctor-preflight" "ok" ("ok=true; bridgeVersion=" + [string](Get-Field $pre.json "bridgeVersion" ""))
    } elseif ($fatalCount -gt 0) {
        Add-Step "doctor-preflight" "failed" ("ok=false; " + [string]$fatalCount + " fallo(s) que requieren accion antes de arrancar el puente")
        Complete-Install 1
    } elseif (-not $Start) {
        Add-Step "doctor-preflight" "failed" ("ok=false; el puente esta detenido y -Start esta desactivado")
        Complete-Install 1
    } else {
        Add-Step "doctor-preflight" "ok" ("ok=false recuperable: " + [string]$recoverableCount + " fallo(s) del puente detenido; se arranca")
    }

    $bindHost = [string](Get-Field $script:Doctor "bindHost" "")
    $bridgePort = 57420
    $bridgePortText = [string](Get-Field $script:Doctor "bridgePort" "")
    if ($bridgePortText -match "^\d+$") { $bridgePort = [int]$bridgePortText }
    $listening = Test-BridgeListening $bindHost $bridgePort
    if (-not $listening -and -not $Start) {
        Add-Step "bridge-start" "failed" "El puente no responde y -Start esta desactivado."
        Add-RawEntry "FAIL" ("El puente no responde en http://" + $bindHost + ":" + [string]$bridgePort + " y -Start esta desactivado. Arrancalo con start.bat o quita -Start:`$false.") "Arranque desactivado por -Start" "start.bat" "README.md"
        Complete-Install 1
    }
    if ($listening) {
        Add-Step "bridge-start" "skipped" ("ya estaba escuchando en http://" + $bindHost + ":" + [string]$bridgePort + "; no se arranca otra instancia")
    } else {
        if ([string]::IsNullOrEmpty($bindHost)) {
            Add-Step "bridge-start" "failed" "El doctor no devolvio bindHost (no hay IP privada): no se puede arrancar el puente."
            Add-RawEntry "FAIL" "El doctor no devolvio bindHost, asi que no hay donde enlazar el puente. Resuelve primero el tunel privado (ZeroTier o Tailscale)." "Sin IP privada" "powershell -ExecutionPolicy Bypass -File doctor.ps1" "AI_SETUP_PROMPT.md"
            Complete-Install 1
        }
        $vbs = Join-Path $script:RepoDir "run-hidden.vbs"
        if (-not (Test-Path -LiteralPath $vbs)) {
            Add-Step "bridge-start" "failed" "Falta run-hidden.vbs en el repo."
            Add-RawEntry "FAIL" ("Falta run-hidden.vbs en " + $script:RepoDir + "; el repo esta incompleto.") "Repo incompleto" ('git clone ' + $script:RepoUrl + ' "' + $Dir + '"') $script:RepoUrl
            Complete-Install 1
        }
        $stopFlag = Join-Path $script:RepoDir "companion.stop"
        if (Test-Path -LiteralPath $stopFlag) {
            Add-Step "bridge-start" "failed" "Existe companion.stop: el supervisor no arrancara el puente."
            Add-RawEntry "FAIL" ("Existe la bandera de parada en " + $stopFlag + ". Borrala si no hay una parada en curso y vuelve a ejecutar.") "Bandera de parada presente" ('Remove-Item "' + $stopFlag + '"') "README.md"
            Complete-Install 1
        }
        $existing = Get-RepoBridgeProcesses $script:RepoDir
        if (-not $existing.queried) {
            Add-Note "No se pudo comprobar si ya habia procesos del puente (CIM no disponible); se arranca igualmente." "Comprobacion de procesos no disponible" "" "README.md"
        } elseif (@($existing.processes).Count -gt 0) {
            Add-Step "bridge-start" "failed" ("Ya hay " + [string]@($existing.processes).Count + " proceso(s) del puente para este repo, pero no responde en el puerto.")
            Add-RawEntry "FAIL" ("Hay procesos del puente para este repo (" + $script:RepoDir + ") que no responden en http://" + $bindHost + ":" + [string]$bridgePort + ". No se arranca una segunda instancia (fallaria con EADDRINUSE): revisa DSH_BIND_HOST o detenlo con stop.bat y repite.") "Puente ya en marcha pero en otra interfaz" "stop.bat" "README.md"
            Complete-Install 1
        }
        $waitStart = Get-Date
        try {
            Start-Process -FilePath "wscript.exe" -ArgumentList ('"' + $vbs + '"') -WorkingDirectory $script:RepoDir -ErrorAction Stop | Out-Null
        } catch {
            Add-Step "bridge-start" "failed" ("No se pudo lanzar run-hidden.vbs: " + $_.Exception.Message)
            Add-RawEntry "FAIL" ("No se pudo lanzar run-hidden.vbs: " + $_.Exception.Message + ". Prueba start.bat para ver el error.") "No se pudo arrancar el puente" "start.bat" "README.md"
            Complete-Install 1
        }
        $script:BridgeStarted = $true
        $deadline = (Get-Date).AddSeconds(45)
        $answered = $false
        while ((Get-Date) -lt $deadline) {
            if (Test-BridgeListening $bindHost $bridgePort) { $answered = $true; break }
            Start-Sleep -Milliseconds 800
        }
        $elapsedText = [string][int]((Get-Date) - $waitStart).TotalSeconds
        if (-not $answered) {
            Add-Step "bridge-start" "failed" ("El puente no respondio en " + $elapsedText + " s tras run-hidden.vbs.")
            Add-RawEntry "FAIL" ("El puente no respondio en http://" + $bindHost + ":" + [string]$bridgePort + " en 45 s tras arrancarlo con run-hidden.vbs. Revisa bridge.log con: Get-Content bridge.log -Tail 20") "El puente no arranco" "Get-Content bridge.log -Tail 20" "README.md"
            Complete-Install 1
        }
        Add-Step "bridge-start" "ok" ("run-hidden.vbs iniciado; el puente escucha en http://" + $bindHost + ":" + [string]$bridgePort + " tras " + $elapsedText + " s")
    }

    $final = Invoke-Doctor $script:RepoDir
    if ($null -eq $final.json) {
        Add-Step "doctor-final" "failed" $final.error
        Add-RawEntry "FAIL" $final.error "doctor.ps1 no devolvio JSON en la confirmacion" "powershell -ExecutionPolicy Bypass -File doctor.ps1 -Json -Report" "doctor.ps1"
        Complete-Install 1
    }
    $script:Doctor = $final.json
    $script:DoctorReportPath = [string]$final.reportPath
    Import-DoctorMessages $final.json
    $finalOk = [bool](Get-Field $final.json "ok" $false)
    if (-not $finalOk) {
        Add-Step "doctor-final" "failed" ("ok=false; " + [string]@($script:Blockers).Count + " fallo(s) tras arrancar el puente")
        Complete-Install 1
    }
    Add-Step "doctor-final" "ok" ("ok=true; bridgeVersion=" + [string](Get-Field $final.json "bridgeVersion" "") + "; phoneUrl=" + [string](Get-Field $final.json "phoneUrl" ""))

    if ($RegisterAutostart) {
        $autostart = Register-AutostartShortcut $script:RepoDir
        if (-not $autostart.ok) {
            Add-Step "autostart" "failed" ("No se pudo registrar el inicio automatico: " + $autostart.error)
            Add-RawEntry "FAIL" ("No se pudo registrar el inicio automatico: " + $autostart.error) "Inicio automatico no registrado" ("powershell -ExecutionPolicy Bypass -File install-agent.ps1 -SkipClone -RegisterAutostart") "README.md"
            Complete-Install 1
        }
        $script:AutostartRegistered = $true
        Add-Step "autostart" "ok" ("Acceso directo de Inicio creado: " + $autostart.path)
    } else {
        Add-Step "autostart" "skipped" "no solicitado; anade -RegisterAutostart para que el puente arranque con Windows"
    }

    Complete-Install 0
} catch {
    $message = $_.Exception.Message
    Add-Step "error" "failed" ("Error inesperado: " + $message)
    Add-RawEntry "FAIL" ("Error inesperado durante la instalacion: " + $message) "Fallo inesperado" "powershell -ExecutionPolicy Bypass -File install-agent.ps1 -Json" "README.md"
    Complete-Install 1
}
