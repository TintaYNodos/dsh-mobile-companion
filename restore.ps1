# ==============================================================================
# DSH Mobile Companion - restore.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Restaura una copia creada por backup.ps1: el registro de dispositivos, la
# clave de acceso y el token del panel del puente.
#
#   powershell -ExecutionPolicy Bypass -File restore.ps1
#   powershell -ExecutionPolicy Bypass -File restore.ps1 -From <carpeta>
#   powershell -ExecutionPolicy Bypass -File restore.ps1 -DshHome C:\ruta\temporal
#
# -From es opcional: por defecto se elige la copia valida mas reciente de
# <DSH_HOME>\backups (las copias automaticas -pre-restore no se eligen solas).
#
# Fail-closed: antes de escribir NADA se lee el manifest, se comprueba que los
# nombres sean de la lista blanca y que el tamano y el SHA-256 de cada copia
# coincidan con el manifest. Si algo no cuadra se sale con codigo 1 sin tocar
# los archivos vivos. Antes de restaurar se guarda el estado actual en
# <DSH_HOME>\backups\<fecha>-pre-restore. Cada archivo se escribe primero en un
# temporal de la misma carpeta y luego se mueve sobre el definitivo; al final se
# vuelve a verificar el SHA-256 de cada archivo restaurado.
#
# Seguridad: nunca imprime el contenido de los archivos, solo nombres, tamanos y
# hashes. Codigo de salida: 0 = restauracion verificada, 1 = rechazada o fallida.
# ==============================================================================

param(
    [string]$DshHome = "",
    [string]$From = ""
)

$ErrorActionPreference = "Stop"

$script:allowedNames = @("companion-devices.json", "companion-access-key", "companion-panel-token")

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
    $fallback = "restore.ps1/1.0"
    $pkgPath = Join-Path $PSScriptRoot "package.json"
    if (-not (Test-Path -LiteralPath $pkgPath)) { return $fallback }
    try {
        $text = [System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8)
        $pkg = $text | ConvertFrom-Json
        if ($pkg -and -not [string]::IsNullOrWhiteSpace([string]$pkg.version)) {
            return "restore.ps1/" + [string]$pkg.version
        }
    } catch {
        return $fallback
    }
    return $fallback
}

function Test-AllowedName {
    param([string]$Name)
    return ($script:allowedNames -contains $Name)
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
$backupRoot = Join-Path $DshHome "backups"

# ==============================================================================
# 2. Elegir la copia de origen
# ==============================================================================
$sourceDir = ""
if (-not [string]::IsNullOrWhiteSpace($From)) {
    if (-not (Test-Path -LiteralPath $From -PathType Container)) {
        Write-Fail ("No existe la carpeta de la copia: " + $From)
    }
    $sourceDir = (Resolve-Path -LiteralPath $From).Path
} else {
    if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
        Write-Fail ("No hay ninguna copia de seguridad en " + $backupRoot + ". Ejecuta backup.bat primero.")
    }
    $candidateDirs = @(Get-ChildItem -LiteralPath $backupRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
    foreach ($candidateDir in $candidateDirs) {
        if ($candidateDir.Name -like "*-pre-restore*") { continue }
        if (Test-Path -LiteralPath (Join-Path $candidateDir.FullName "manifest.json") -PathType Leaf) {
            $sourceDir = $candidateDir.FullName
            break
        }
    }
    if ([string]::IsNullOrWhiteSpace($sourceDir)) {
        Write-Fail ("No hay ninguna copia valida (con manifest.json) en " + $backupRoot + ". Ejecuta backup.bat primero.")
    }
}
Write-Host ("  Origen: " + $sourceDir) -ForegroundColor Cyan

# ==============================================================================
# 3. Verificar el manifest ANTES de escribir nada (fail-closed)
# ==============================================================================
$manifestPath = Join-Path $sourceDir "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    Write-Fail ("La carpeta no tiene manifest.json: " + $sourceDir + ". No se restaura nada.")
}
$manifest = $null
try {
    $manifestText = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
    $manifest = $manifestText | ConvertFrom-Json
} catch {
    Write-Fail ("manifest.json no es JSON valido (" + $_.Exception.Message + "). No se restaura nada.")
}
if ($null -eq $manifest -or $null -eq $manifest.files) {
    Write-Fail "El manifest.json no trae la lista files. No se restaura nada."
}
$fileEntries = @($manifest.files)
if ($fileEntries.Count -eq 0) {
    Write-Fail "El manifest.json no contiene ningun archivo que restaurar. No se restaura nada."
}

$plan = New-Object System.Collections.ArrayList
foreach ($entry in $fileEntries) {
    $name = [string]$entry.name
    if ([string]::IsNullOrWhiteSpace($name)) {
        Write-Fail "El manifest.json tiene una entrada sin nombre. No se restaura nada."
    }
    if (-not (Test-AllowedName $name)) {
        Write-Fail ("El manifest.json incluye un archivo no permitido: " + $name + ". No se restaura nada.")
    }
    $expectedHash = [string]$entry.sha256
    if ($expectedHash -notmatch "^[0-9a-fA-F]{64}$") {
        Write-Fail ("El manifest.json trae un sha256 invalido para " + $name + ". No se restaura nada.")
    }
    $expectedHash = $expectedHash.ToLowerInvariant()
    $expectedBytes = [long]$entry.bytes
    $copyPath = Join-Path $sourceDir $name
    if (-not (Test-Path -LiteralPath $copyPath -PathType Leaf)) {
        Write-Fail ("Falta la copia de " + $name + " en " + $sourceDir + ". No se restaura nada.")
    }
    $copyBytes = [long](Get-Item -LiteralPath $copyPath).Length
    if ($copyBytes -ne $expectedBytes) {
        Write-Fail ("La copia de " + $name + " tiene " + [string]$copyBytes + " bytes y el manifest dice " + [string]$expectedBytes + ". No se restaura nada.")
    }
    $copyHash = Get-FileSha256 $copyPath
    if ($copyHash -ne $expectedHash) {
        Write-Fail ("El sha256 de la copia de " + $name + " no coincide con el manifest (manifest " + $expectedHash + ", copia " + $copyHash + "). No se restaura nada.")
    }
    [void]$plan.Add([ordered]@{ name = $name; bytes = $expectedBytes; sha256 = $expectedHash; path = $copyPath })
}
Write-Host ("  [ OK ] Manifest y hashes verificados: " + [string]$plan.Count + " archivo(s).") -ForegroundColor Green

# ==============================================================================
# 4. Copia de seguridad del estado actual (<fecha>-pre-restore)
# ==============================================================================
$liveNames = New-Object System.Collections.ArrayList
foreach ($name in $script:allowedNames) {
    if (Test-Path -LiteralPath (Join-Path $DshHome $name) -PathType Leaf) { [void]$liveNames.Add($name) }
}
$preDir = ""
if ($liveNames.Count -gt 0) {
    try {
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
    } catch {
        Write-Fail ("No se pudo crear " + $backupRoot + ": " + $_.Exception.Message + ". No se restaura nada.")
    }
    $stamp = (Get-Date).ToString("yyyy-MM-dd-HHmmss")
    $preDir = Join-Path $backupRoot ($stamp + "-pre-restore")
    $suffix = 0
    while (Test-Path -LiteralPath $preDir) {
        $suffix++
        $preDir = Join-Path $backupRoot ($stamp + "-pre-restore-" + [string]$suffix)
    }
    $preEntries = New-Object System.Collections.ArrayList
    try {
        New-Item -ItemType Directory -Force -Path $preDir | Out-Null
        foreach ($name in $liveNames) {
            $livePath = Join-Path $DshHome $name
            $prePath = Join-Path $preDir $name
            $liveBytes = [System.IO.File]::ReadAllBytes($livePath)
            [System.IO.File]::WriteAllBytes($prePath, $liveBytes)
            $preHash = Get-FileSha256 $prePath
            if ($preHash -ne (Get-FileSha256 $livePath)) {
                Remove-Item -LiteralPath $preDir -Recurse -Force -ErrorAction SilentlyContinue
                Write-Fail "La copia del estado actual no coincide con el original. No se restaura nada."
            }
            [void]$preEntries.Add([ordered]@{ name = $name; bytes = [long]$liveBytes.Length; sha256 = $preHash })
        }
        $preManifest = [ordered]@{
            createdAt   = (Get-Date).ToString("o")
            source      = $DshHome
            files       = @($preEntries)
            toolVersion = (Get-ToolVersion).Replace("restore.ps1", "restore.ps1/pre-revert")
        }
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText((Join-Path $preDir "manifest.json"), ($preManifest | ConvertTo-Json -Depth 6), $utf8)
    } catch {
        Remove-Item -LiteralPath $preDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Fail ("No se pudo guardar el estado actual antes de restaurar: " + $_.Exception.Message + ". No se restaura nada.")
    }
    Write-Host ("  [ OK ] Estado actual guardado en " + $preDir) -ForegroundColor Green
} else {
    Write-Host "         No habia archivos que guardar antes de restaurar: no se crea -pre-restore." -ForegroundColor DarkGray
}

# ==============================================================================
# 5. Restauracion: temporal + move, y verificacion posterior
# ==============================================================================
$restored = New-Object System.Collections.ArrayList
foreach ($item in $plan) {
    $livePath = Join-Path $DshHome $item.name
    $tmpPath = Join-Path $DshHome ($item.name + ".restore-" + [guid]::NewGuid().ToString("N") + ".tmp")
    try {
        $bytes = [System.IO.File]::ReadAllBytes($item.path)
        [System.IO.File]::WriteAllBytes($tmpPath, $bytes)
        $tmpHash = Get-FileSha256 $tmpPath
        if ($tmpHash -ne $item.sha256) {
            throw ("el temporal de " + $item.name + " no coincide con el manifest")
        }
        Move-Item -LiteralPath $tmpPath -Destination $livePath -Force -ErrorAction Stop
    } catch {
        if (Test-Path -LiteralPath $tmpPath) { Remove-Item -LiteralPath $tmpPath -Force -ErrorAction SilentlyContinue }
        if (-not [string]::IsNullOrWhiteSpace($preDir)) {
            Write-Fail ("Fallo al restaurar " + $item.name + ": " + $_.Exception.Message + ". Puedes volver al estado anterior con: restore.ps1 -From `"" + $preDir + "`"")
        }
        Write-Fail ("Fallo al restaurar " + $item.name + ": " + $_.Exception.Message)
    }
    [void]$restored.Add($item)
}

foreach ($item in $restored) {
    $livePath = Join-Path $DshHome $item.name
    if (-not (Test-Path -LiteralPath $livePath -PathType Leaf)) {
        Write-Fail ("Falta " + $item.name + " despues de restaurar.")
    }
    $liveHash = Get-FileSha256 $livePath
    if ($liveHash -ne $item.sha256) {
        Write-Fail ("La verificacion posterior de " + $item.name + " fallo (se esperaba " + $item.sha256 + ", hay " + $liveHash + ").")
    }
    $liveSize = [long](Get-Item -LiteralPath $livePath).Length
    if ($liveSize -ne $item.bytes) {
        Write-Fail ("La verificacion posterior de " + $item.name + " fallo: " + [string]$liveSize + " bytes, se esperaban " + [string]$item.bytes + ".")
    }
}

Write-Host ("  [ OK ] Restauracion verificada: " + [string]$restored.Count + " archivo(s) en " + $DshHome) -ForegroundColor Green
foreach ($item in $restored) {
    Write-Host ("         " + $item.name + ": " + [string]$item.bytes + " bytes, sha256 " + $item.sha256) -ForegroundColor DarkGray
}
if (-not [string]::IsNullOrWhiteSpace($preDir)) {
    Write-Host ("         Para volver atras: restore.ps1 -From `"" + $preDir + "`"") -ForegroundColor DarkGray
}
Write-Host "  Reinicia el puente (stop.bat y start.bat) para que lea los datos restaurados." -ForegroundColor Cyan
exit 0
