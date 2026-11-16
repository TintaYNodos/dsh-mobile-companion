# ==============================================================================
# DSH Mobile Companion - backup.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Guarda una copia verificable de los datos que enlazan el telefono con el
# puente: el registro de dispositivos, la clave de acceso y el token del panel.
#
#   powershell -ExecutionPolicy Bypass -File backup.ps1
#   powershell -ExecutionPolicy Bypass -File backup.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File backup.ps1 -RegistryOnly
#   powershell -ExecutionPolicy Bypass -File backup.ps1 -DshHome C:\ruta\temporal
#
# Destino: <DSH_HOME>\backups\<AAAA-MM-DD-HHMMSS>\ con una copia de cada archivo
# y manifest.json (createdAt, source, files[{name,bytes,sha256}], toolVersion).
# Cada copia se verifica con SHA-256 contra el origen antes de dar la copia por
# buena; si algo no cuadra se sale con codigo 1.
#
# -DryRun no escribe nada (solo lee y muestra el plan).
# -RegistryOnly respalda unicamente el registro de dispositivos.
# -DshHome aislado para pruebas: escribe en esa carpeta, nunca en el .dsh real.
#
# Seguridad: nunca imprime el contenido de los archivos (clave, token ni
# registro), solo nombres, tamanos y hashes. No modifica los archivos de origen.
# Codigo de salida: 0 = copia verificada, 1 = fallo.
# ==============================================================================

param(
    [string]$DshHome = "",
    [switch]$DryRun,
    [switch]$RegistryOnly
)

$ErrorActionPreference = "Stop"

$script:allNames = @("companion-devices.json", "companion-access-key", "companion-panel-token")
$script:registryName = "companion-devices.json"

function Write-Fail {
    param([string]$Message)
    Write-Host ("  [FALLA] " + $Message) -ForegroundColor Red
    exit 1
}

function Get-FileSha256 {
    param([string]$Path)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            $hash = $sha.ComputeHash($stream)
        } finally {
            $stream.Dispose()
        }
        return ([System.BitConverter]::ToString($hash) -replace "-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-ToolVersion {
    $fallback = "backup.ps1/1.0"
    $pkgPath = Join-Path $PSScriptRoot "package.json"
    if (-not (Test-Path -LiteralPath $pkgPath)) { return $fallback }
    try {
        $text = [System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8)
        $pkg = $text | ConvertFrom-Json
        if ($pkg -and -not [string]::IsNullOrWhiteSpace([string]$pkg.version)) {
            return "backup.ps1/" + [string]$pkg.version
        }
    } catch {
        return $fallback
    }
    return $fallback
}

# ==============================================================================
# 1. Resolver el directorio de datos (DSH_HOME)
# ==============================================================================
if ([string]::IsNullOrWhiteSpace($DshHome)) {
    if (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) { $DshHome = $env:DSH_HOME }
    elseif (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) { $DshHome = Join-Path $env:USERPROFILE ".dsh" }
}
if ([string]::IsNullOrWhiteSpace($DshHome)) {
    Write-Fail "No se pudo determinar el directorio de DSH: define DSH_HOME o usa -DshHome."
}
$DshHome = [System.IO.Path]::GetFullPath($DshHome)
if (-not (Test-Path -LiteralPath $DshHome -PathType Container)) {
    Write-Fail ("No existe el directorio de DSH: " + $DshHome)
}

$targetNames = $script:allNames
if ($RegistryOnly) { $targetNames = @($script:registryName) }

# ==============================================================================
# 2. Inventario de origen (solo metadatos: nombre y tamano)
# ==============================================================================
$sources = New-Object System.Collections.ArrayList
$missing = New-Object System.Collections.ArrayList
foreach ($name in $targetNames) {
    $path = Join-Path $DshHome $name
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $item = Get-Item -LiteralPath $path
        [void]$sources.Add([ordered]@{ name = $name; path = $path; bytes = [long]$item.Length })
    } else {
        [void]$missing.Add($name)
    }
}
if ($sources.Count -eq 0) {
    Write-Fail ("No hay nada que respaldar en " + $DshHome + ": no existe " + ($targetNames -join ", ") + ".")
}

$backupRoot = Join-Path $DshHome "backups"
$stamp = (Get-Date).ToString("yyyy-MM-dd-HHmmss")
$destDir = Join-Path $backupRoot $stamp
$suffix = 0
while (Test-Path -LiteralPath $destDir) {
    $suffix++
    $destDir = Join-Path $backupRoot ($stamp + "-" + [string]$suffix)
}
$toolVersion = Get-ToolVersion

# ==============================================================================
# 3. -DryRun: solo muestra el plan, no escribe nada
# ==============================================================================
if ($DryRun) {
    Write-Host ("DRY-RUN: se guardarian " + [string]$sources.Count + " archivo(s) en " + $destDir) -ForegroundColor Yellow
    foreach ($src in $sources) {
        $hash = Get-FileSha256 $src.path
        Write-Host ("         " + $src.name + ": " + [string]$src.bytes + " bytes, sha256 " + $hash) -ForegroundColor DarkGray
    }
    foreach ($name in $missing) {
        Write-Host ("         No existe (se omitiria): " + $name) -ForegroundColor Yellow
    }
    Write-Host "DRY-RUN: no se ha escrito nada." -ForegroundColor Yellow
    exit 0
}

# ==============================================================================
# 4. Copia + verificacion de hash por archivo
# ==============================================================================
try {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
} catch {
    Write-Fail ("No se pudo crear la carpeta de copia " + $destDir + ": " + $_.Exception.Message)
}

$entries = New-Object System.Collections.ArrayList
foreach ($src in $sources) {
    $destPath = Join-Path $destDir $src.name
    try {
        $bytes = [System.IO.File]::ReadAllBytes($src.path)
        [System.IO.File]::WriteAllBytes($destPath, $bytes)
    } catch {
        Remove-Item -LiteralPath $destDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Fail ("No se pudo copiar " + $src.name + ": " + $_.Exception.Message)
    }
    $sourceHash = Get-FileSha256 $src.path
    $copyHash = Get-FileSha256 $destPath
    if ($sourceHash -ne $copyHash) {
        Remove-Item -LiteralPath $destDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Fail ("La copia de " + $src.name + " no coincide con el origen (origen " + $sourceHash + ", copia " + $copyHash + "). Copia descartada.")
    }
    $destSize = [long](Get-Item -LiteralPath $destPath).Length
    if ($destSize -ne $src.bytes) {
        Remove-Item -LiteralPath $destDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Fail ("La copia de " + $src.name + " tiene " + [string]$destSize + " bytes; el origen tiene " + [string]$src.bytes + ". Copia descartada.")
    }
    [void]$entries.Add([ordered]@{ name = $src.name; bytes = $destSize; sha256 = $copyHash })
}

# ==============================================================================
# 5. manifest.json (UTF-8 sin BOM) + resumen sin secretos
# ==============================================================================
$manifest = [ordered]@{
    createdAt   = (Get-Date).ToString("o")
    source      = $DshHome
    files       = @($entries)
    toolVersion = $toolVersion
}
$manifestPath = Join-Path $destDir "manifest.json"
try {
    $json = ($manifest | ConvertTo-Json -Depth 6)
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $json, $utf8)
} catch {
    Remove-Item -LiteralPath $destDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Fail ("No se pudo escribir manifest.json: " + $_.Exception.Message)
}

Write-Host ("  [ OK ] Copia verificada en " + $destDir) -ForegroundColor Green
foreach ($entry in $entries) {
    Write-Host ("         " + $entry.name + ": " + [string]$entry.bytes + " bytes, sha256 " + $entry.sha256) -ForegroundColor DarkGray
}
foreach ($name in $missing) {
    Write-Host ("         No existe (se omite): " + $name) -ForegroundColor Yellow
}
if ($RegistryOnly) {
    Write-Host "         Modo -RegistryOnly: solo el registro de dispositivos." -ForegroundColor DarkGray
}
exit 0
