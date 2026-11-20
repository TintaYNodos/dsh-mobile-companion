# ==============================================================================
# DSH Mobile Companion - test/verify_install_agent.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Verificador seguro de install-agent.ps1. NO instala nada, NO arranca el
# puente, NO toca el inicio automatico y NO escribe fuera de %TEMP%.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File test/verify_install_agent.ps1
#
# Comprueba:
#   1. Sintaxis con Windows PowerShell 5.1 y, si existe, con pwsh 7.
#   2. -DryRun -Json: JSON unico y valido, exit 0, esquema del contrato y que no
#      se escriba ningun archivo (log ni directorio de instalacion).
#   3. Parametros invalidos: exit 4 y JSON valido con ok=false/exitCode=4.
#   4. -DryRun humano: exit 0 y plan legible.
#   5. -Help: exit 0 y documentacion de los codigos de salida.
#   6. Guardas estaticas: sin secretos, sin descargas, sin elevacion, solo URLs
#      oficiales, ASCII sin BOM (necesario para Windows PowerShell 5.1).
#
# Codigo de salida: 0 = todas las comprobaciones pasan, 1 = hay fallos.
# ==============================================================================

$ErrorActionPreference = "Stop"

$script:Installer = ""
if (-not [string]::IsNullOrEmpty($PSScriptRoot)) {
    $candidate = Join-Path (Split-Path -Parent $PSScriptRoot) "install-agent.ps1"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { $script:Installer = (Resolve-Path -LiteralPath $candidate).Path }
}
if ($script:Installer -eq "") {
    Write-Host "[FALLA] No encuentro install-agent.ps1 junto a test/." -ForegroundColor Red
    exit 1
}

$script:Total = 0
$script:Failed = 0
$script:InvocationCount = 0

function Write-Report {
    param([string]$Name, [bool]$Ok, [string]$Detail = "")
    $script:Total++
    if ($Ok) {
        Write-Host ("  [ OK ] " + $Name + $(if ($Detail -ne "") { ": " + $Detail } else { "" })) -ForegroundColor Green
    } else {
        $script:Failed++
        Write-Host ("  [FALLA] " + $Name + $(if ($Detail -ne "") { ": " + $Detail } else { "" })) -ForegroundColor Red
    }
}

function Get-TempFilePath {
    param([string]$Prefix)
    return (Join-Path ([System.IO.Path]::GetTempPath()) ($Prefix + "-" + [guid]::NewGuid().ToString("N") + ".tmp"))
}

function Invoke-InstallerHost {
    param([string]$HostExe, [string[]]$InstallerArguments)
    $result = [ordered]@{ exitCode = -1; stdout = ""; stderr = "" }
    $errFile = Get-TempFilePath "dsh-verify-install"
    try {
        $result.stdout = (& $HostExe -NoProfile -ExecutionPolicy Bypass -File $script:Installer @InstallerArguments 2> $errFile | Out-String)
        $result.exitCode = $LASTEXITCODE
    } catch {
        $result.stderr = $_.Exception.Message
    }
    if (Test-Path -LiteralPath $errFile -PathType Leaf) {
        $errText = ""
        try { $errText = [System.IO.File]::ReadAllText($errFile, [System.Text.Encoding]::UTF8).Trim() } catch { $errText = "" }
        if ($errText -ne "") { $result.stderr = $errText }
        Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue
    }
    $script:InvocationCount++
    return $result
}

function Get-JsonResult {
    param([string]$Text)
    $trimmed = ""
    if ($null -ne $Text) { $trimmed = ([string]$Text).Trim() }
    if ($trimmed.StartsWith([string][char]0xFEFF, [System.StringComparison]::Ordinal)) { $trimmed = $trimmed.Substring(1).Trim() }
    $json = $null
    $errorText = ""
    if ($trimmed -eq "") { return [ordered]@{ ok = $false; json = $null; error = "salida vacia" } }
    if (-not $trimmed.StartsWith("{", [System.StringComparison]::Ordinal)) {
        return [ordered]@{ ok = $false; json = $null; error = "stdout no empieza con '{': " + $trimmed.Substring(0, [Math]::Min(80, $trimmed.Length)) }
    }
    try { $json = $trimmed | ConvertFrom-Json } catch { $errorText = $_.Exception.Message }
    if ($null -eq $json) {
        return [ordered]@{ ok = $false; json = $null; error = "JSON invalido: " + $errorText }
    }
    return [ordered]@{ ok = $true; json = $json; error = "" }
}

function Test-JsonContract {
    param($Json)
    $errors = New-Object System.Collections.ArrayList
    if ($null -eq $Json) { [void]$errors.Add("JSON nulo"); return @($errors) }
    $required = @("ok", "version", "steps", "checks", "exitCode")
    foreach ($name in $required) {
        if ($null -eq $Json.PSObject.Properties[$name]) { [void]$errors.Add("falta la clave obligatoria '" + $name + "'") }
    }
    if ($null -ne $Json.PSObject.Properties["ok"] -and $Json.ok -isnot [bool]) { [void]$errors.Add("ok no es booleano") }
    if ($null -ne $Json.PSObject.Properties["version"] -and [string]::IsNullOrEmpty([string]$Json.version)) { [void]$errors.Add("version vacio") }
    if ($null -ne $Json.PSObject.Properties["exitCode"] -and -not ($Json.exitCode -is [int] -or $Json.exitCode -is [long])) { [void]$errors.Add("exitCode no es entero") }
    if ($null -ne $Json.PSObject.Properties["steps"]) {
        $steps = @($Json.steps)
        if ($steps.Count -lt 5) { [void]$errors.Add("steps tiene menos de 5 elementos") }
        foreach ($step in $steps) {
            if ($null -eq $step.PSObject.Properties["name"] -or [string]::IsNullOrEmpty([string]$step.name)) { [void]$errors.Add("step sin name"); break }
            if ($null -eq $step.PSObject.Properties["status"]) { [void]$errors.Add("step sin status"); break }
            if ($null -eq $step.PSObject.Properties["detail"]) { [void]$errors.Add("step sin detail"); break }
            if (@("ok", "skipped", "failed", "warning", "planned") -notcontains [string]$step.status) { [void]$errors.Add("status no documentado: " + [string]$step.status); break }
        }
    }
    if ($null -ne $Json.PSObject.Properties["checks"]) {
        $checks = @($Json.checks)
        if ($checks.Count -lt 5) { [void]$errors.Add("checks tiene menos de 5 elementos") }
        foreach ($check in $checks) {
            if ($null -eq $check.PSObject.Properties["id"] -or [string]::IsNullOrEmpty([string]$check.id)) { [void]$errors.Add("check sin id"); break }
            if ($null -eq $check.PSObject.Properties["ok"] -or $check.ok -isnot [bool]) { [void]$errors.Add("check.ok no es booleano"); break }
            if ($null -eq $check.PSObject.Properties["detail"]) { [void]$errors.Add("check sin detail"); break }
        }
    }
    return @($errors)
}

function Test-NoSecretsInText {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $true }
    if ($Text -match "(?i)authorization\s*:\s*basic") { return $false }
    if ($Text -match "(?i)dsh-auth-[A-Za-z0-9_-]{8,}") { return $false }
    if ($Text -match "(?i)companion-access-key\s*[:=]\s*[A-Za-z0-9]") { return $false }
    if ($Text -match "(?i)companion-panel-token\s*[:=]\s*[A-Za-z0-9]") { return $false }
    return $true
}

function Get-PowerShell51Path {
    if (-not [string]::IsNullOrEmpty($env:SystemRoot)) {
        $legacy = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
        if (Test-Path -LiteralPath $legacy -PathType Leaf) { return $legacy }
    }
    return ""
}

Write-Host ""
Write-Host "== Verificacion de install-agent.ps1 ==" -ForegroundColor Cyan
Write-Host ("   Instalador: " + $script:Installer)

# ------------------------------------------------------------------------------
# 1. Guardas estaticas
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "== Guardas estaticas ==" -ForegroundColor Cyan
$bytes = [System.IO.File]::ReadAllBytes($script:Installer)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$nonAscii = @($bytes | Where-Object { $_ -gt 127 })
Write-Report "encoding ASCII sin BOM (Windows PowerShell 5.1)" ((-not $hasBom) -and ($nonAscii.Count -eq 0)) ("BOM=" + [string]$hasBom + "; bytes no ASCII=" + [string]$nonAscii.Count)
$sourceText = [System.IO.File]::ReadAllText($script:Installer, (New-Object System.Text.UTF8Encoding($false)))
$codeLines = @($sourceText -split "`r?`n" | Where-Object { -not $_.TrimStart().StartsWith("#") })
$codeText = ($codeLines -join "`n")
Write-Report "documenta los codigos de salida 0-4" (($sourceText -match "(?m)^#\s+0 =") -and ($sourceText -match "(?m)^#\s+1 =") -and ($sourceText -match "(?m)^#\s+2 =") -and ($sourceText -match "(?m)^#\s+3 =") -and ($sourceText -match "(?m)^#\s+4 ="))
Write-Report "declara el contrato JSON" (($sourceText -match '"steps"') -and ($sourceText -match '"checks"') -and ($sourceText -match '"exitCode"') -and ($sourceText -match '"version"'))
Write-Report "soporta los modos pedidos" (($sourceText -match "-DryRun") -and ($sourceText -match "-SkipClone") -and ($sourceText -match "-RegisterAutostart") -and ($sourceText -match "-Force") -and ($sourceText -match "-Port"))
Write-Report "instala en LOCALAPPDATA por defecto" ($sourceText -match "LOCALAPPDATA")
Write-Report "verifica /healthz" ($sourceText -match "/healthz")
Write-Report "verifica el recibo" ($sourceText -match "tools/verify-receipt.mjs")
$downloadPatterns = @("Invoke-WebRequest", "Invoke-RestMethod", "Start-BitsTransfer", "DownloadFile", "DownloadString", "System.Net.WebClient")
$foundDownload = @($downloadPatterns | Where-Object { $codeText.Contains($_) })
Write-Report "no descarga binarios externos" ($foundDownload.Count -eq 0) ($foundDownload -join ", ")
$adminPatterns = @("RunAs", "netsh", "Set-ExecutionPolicy", "Start-Process -Verb")
$foundAdmin = @($adminPatterns | Where-Object { $codeText.Contains($_) })
Write-Report "no pide elevacion ni ejecuta netsh" ($foundAdmin.Count -eq 0) ($foundAdmin -join ", ")
$secretReadPatterns = @("Get-Content", "ReadAllText", "ReadAllBytes")
$secretReadHit = $false
foreach ($readPattern in $secretReadPatterns) {
    if ($codeText -match ("(?i)" + $readPattern + "[^\r\n]*(\.credentials\.yaml|companion-access-key|companion-panel-token)")) { $secretReadHit = $true }
}
Write-Report "no lee contenido de archivos secretos" (-not $secretReadHit)
$urls = @([regex]::Matches($sourceText, 'https?://[^\s"''<>\)]+') | ForEach-Object { $_.Value })
$badUrls = @($urls | Where-Object {
    $value = $_.ToLowerInvariant()
    -not ($value.StartsWith("https://github.com/tintaynodos/dsh-mobile-companion") -or $value.StartsWith("http://127.0.0.1"))
})
Write-Report "solo URLs oficiales o loopback" ($badUrls.Count -eq 0) ($badUrls -join ", ")

# ------------------------------------------------------------------------------
# 2. Sintaxis con Windows PowerShell 5.1 y pwsh 7
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "== Sintaxis ==" -ForegroundColor Cyan
$ps51 = Get-PowerShell51Path
$hosts = New-Object System.Collections.ArrayList
if ($ps51 -ne "") { [void]$hosts.Add(@{ name = "Windows PowerShell 5.1"; path = $ps51 }) }
$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($null -ne $pwshCommand) {
    $pwshPath = [string]$pwshCommand.Source
    $duplicate = $false
    foreach ($known in $hosts) { if ($known.path.ToLowerInvariant() -eq $pwshPath.ToLowerInvariant()) { $duplicate = $true } }
    if (-not $duplicate) { [void]$hosts.Add(@{ name = "pwsh 7"; path = $pwshPath }) }
}
if ($hosts.Count -eq 0) {
    [void]$hosts.Add(@{ name = "host actual"; path = (Get-Process -Id $PID).Path })
}
$parseScript = "& { " + '$parseErrors = $null; ' + "[void][System.Management.Automation.Language.Parser]::ParseFile('" + $script:Installer.Replace("'", "''") + "', [ref]`$null, [ref]`$parseErrors); " + 'if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { Write-Output ("PARSE_ERROR " + $_.Extent.StartLineNumber + ": " + $_.Message) }; exit 1 }; Write-Output "PARSE_OK"; exit 0 }'
foreach ($parseHost in $hosts) {
    $parseOutput = ""
    $parseCode = -1
    try {
        $parseOutput = (& $parseHost.path -NoProfile -ExecutionPolicy Bypass -Command $parseScript 2>&1 | Out-String)
        $parseCode = $LASTEXITCODE
    } catch {
        $parseOutput = $_.Exception.Message
    }
    $script:InvocationCount++
    Write-Report ("sintaxis con " + $parseHost.name) (($parseCode -eq 0) -and ($parseOutput -match "PARSE_OK")) (([string]$parseOutput).Trim())
}

# ------------------------------------------------------------------------------
# 3. -DryRun -Json: contrato, exit 0 y cero escrituras
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "== -DryRun -Json ==" -ForegroundColor Cyan
$planDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-install-verify-plan-" + [guid]::NewGuid().ToString("N"))
$tempLogsBefore = @(Get-ChildItem -Path ([System.IO.Path]::GetTempPath()) -Filter "dsh-companion-install-*.log" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$defaultInstallDir = ""
if (-not [string]::IsNullOrEmpty($env:LOCALAPPDATA)) { $defaultInstallDir = Join-Path $env:LOCALAPPDATA "DSH-Companion" }
$defaultExistedBefore = ($defaultInstallDir -ne "") -and (Test-Path -LiteralPath $defaultInstallDir)
$dryHost = $ps51
if ($dryHost -eq "") { $dryHost = (Get-Process -Id $PID).Path }
$dryRun = Invoke-InstallerHost -HostExe $dryHost -InstallerArguments @("-Json", "-DryRun", "-Dir", $planDir)
$dryJson = Get-JsonResult -Text $dryRun.stdout
Write-Report "exit 0" ($dryRun.exitCode -eq 0) ([string]$dryRun.exitCode)
Write-Report "stdout es un unico JSON" ($dryJson.ok) ([string]$dryJson.error)
if ($dryJson.ok) {
    $contractErrors = @(Test-JsonContract -Json $dryJson.json)
    Write-Report "esquema {ok,version,steps,checks,exitCode}" ($contractErrors.Count -eq 0) ($contractErrors -join "; ")
    Write-Report "exitCode del JSON coincide con el proceso" ([int]$dryJson.json.exitCode -eq [int]$dryRun.exitCode) ([string]$dryJson.json.exitCode)
    Write-Report "ok=true" ([bool]$dryJson.json.ok -eq $true)
    Write-Report "stderr vacio" ([string]::IsNullOrWhiteSpace([string]$dryRun.stderr)) ([string]$dryRun.stderr)
    Write-Report "sin marcas de secretos en stdout" (Test-NoSecretsInText -Text ([string]$dryRun.stdout))
    $planStep = @($dryJson.json.steps | Where-Object { [string]$_.name -eq "plan" -or [string]$_.status -eq "planned" })
    Write-Report "incluye pasos de plan" ($planStep.Count -gt 0)
}
Start-Sleep -Milliseconds 200
$tempLogsAfter = @(Get-ChildItem -Path ([System.IO.Path]::GetTempPath()) -Filter "dsh-companion-install-*.log" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$newLogs = @(Compare-Object -ReferenceObject $tempLogsBefore -DifferenceObject $tempLogsAfter | Where-Object { $_.SideIndicator -eq "=>" })
Write-Report "-DryRun no crea log" ($newLogs.Count -eq 0) ([string]$newLogs.Count)
Write-Report "-DryRun no crea el directorio de instalacion" (-not (Test-Path -LiteralPath $planDir)) $planDir
if ($defaultInstallDir -ne "") {
    Write-Report "-DryRun no toca la instalacion real" ((Test-Path -LiteralPath $defaultInstallDir) -eq $defaultExistedBefore) $defaultInstallDir
}
if (Test-Path -LiteralPath $planDir) { Remove-Item -LiteralPath $planDir -Recurse -Force -ErrorAction SilentlyContinue }

# ------------------------------------------------------------------------------
# 4. Parametros invalidos: exit 4 y JSON valido
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "== Parametros invalidos ==" -ForegroundColor Cyan
$invalidCases = @(
    @{ name = "-Port no numerico"; args = @("-Json", "-DryRun", "-Port", "abc") },
    @{ name = "-Port cero"; args = @("-Json", "-DryRun", "-Port", "0") },
    @{ name = "-Port fuera de rango"; args = @("-Json", "-DryRun", "-Port", "70000") },
    @{ name = "-RepoUrl no oficial"; args = @("-Json", "-DryRun", "-RepoUrl", "https://ejemplo.example.com/repo.git") },
    @{ name = "-Dir relativa"; args = @("-Json", "-DryRun", "-Dir", "carpeta\relativa") },
    @{ name = "opcion desconocida"; args = @("-Json", "-DryRun", "-NoExiste") },
    @{ name = "opcion repetida"; args = @("-Json", "-DryRun", "-Json") },
    @{ name = "valor faltante"; args = @("-Json", "-DryRun", "-Dir") }
)
foreach ($case in $invalidCases) {
    $caseResult = Invoke-InstallerHost -HostExe $dryHost -InstallerArguments $case.args
    $caseJson = Get-JsonResult -Text $caseResult.stdout
    $caseOk = ($caseResult.exitCode -eq 4) -and $caseJson.ok -and ([bool]$caseJson.json.ok -eq $false) -and ([int]$caseJson.json.exitCode -eq 4)
    $caseDetail = "exit=" + [string]$caseResult.exitCode
    if ($caseJson.ok) { $caseDetail += "; ok=" + [string]$caseJson.json.ok + "; exitCode=" + [string]$caseJson.json.exitCode }
    else { $caseDetail += "; " + [string]$caseJson.error }
    Write-Report ([string]$case.name) $caseOk $caseDetail
    if (-not $caseOk -and $null -ne $caseResult.stderr -and [string]$caseResult.stderr -ne "") {
        Write-Host ("         stderr: " + ([string]$caseResult.stderr).Trim()) -ForegroundColor DarkGray
    }
}

# ------------------------------------------------------------------------------
# 5. -DryRun humano y -Help
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "== Modo humano ==" -ForegroundColor Cyan
$humanDir = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-install-verify-human-" + [guid]::NewGuid().ToString("N"))
$human = Invoke-InstallerHost -HostExe $dryHost -InstallerArguments @("-DryRun", "-Dir", $humanDir)
Write-Report "-DryRun humano exit 0" ($human.exitCode -eq 0) ([string]$human.exitCode)
Write-Report "-DryRun humano muestra el plan" (([string]$human.stdout) -match "DRY-RUN" -and ([string]$human.stdout) -match "Plan")
if (Test-Path -LiteralPath $humanDir) { Remove-Item -LiteralPath $humanDir -Recurse -Force -ErrorAction SilentlyContinue }

$help = Invoke-InstallerHost -HostExe $dryHost -InstallerArguments @("-Help")
Write-Report "-Help exit 0" ($help.exitCode -eq 0) ([string]$help.exitCode)
Write-Report "-Help documenta los codigos" (([string]$help.stdout) -match "Codigos de salida")

# ------------------------------------------------------------------------------
# Resumen
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "== Resumen ==" -ForegroundColor Cyan
$script:Failed = [int]$script:Failed
Write-Host ("  Comprobaciones: " + [string]($script:Total - $script:Failed) + "/" + [string]$script:Total + " correctas; invocaciones al instalador: " + [string]$script:InvocationCount)
if ($script:Failed -gt 0) {
    Write-Host "  RESULTADO: FALLA" -ForegroundColor Red
    exit 1
}
Write-Host "  RESULTADO: OK" -ForegroundColor Green
exit 0
