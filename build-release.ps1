# ==============================================================================
# DSH Mobile Companion - build-release.ps1
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BUSL-1.1
#
# Compila y firma el APK con el keystore DE RELEASE (no el de depuracion).
# La contrasena no vive en el repositorio: se lee de un archivo fuera del repo.
#
#   powershell -ExecutionPolicy Bypass -File build-release.ps1
#
# Variables de entorno opcionales:
#   DSH_RELEASE_KEYSTORE  ruta del keystore (por defecto ~/.dsh/release-keys/
#                         dsh-companion-release.keystore)
#   DSH_RELEASE_ALIAS     alias de la clave (por defecto dsh-companion)
#   DSH_RELEASE_PASSWORD_FILE  archivo con la contrasena (por defecto
#                         ~/.dsh/release-keys/keystore-password.txt)
# ==============================================================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$keyDir = Join-Path $env:USERPROFILE ".dsh\release-keys"
$keyStore = if ($env:DSH_RELEASE_KEYSTORE) { $env:DSH_RELEASE_KEYSTORE } else { Join-Path $keyDir "dsh-companion-release.keystore" }
$alias = if ($env:DSH_RELEASE_ALIAS) { $env:DSH_RELEASE_ALIAS } else { "dsh-companion" }
$passFile = if ($env:DSH_RELEASE_PASSWORD_FILE) { $env:DSH_RELEASE_PASSWORD_FILE } else { Join-Path $keyDir "keystore-password.txt" }

if (-not (Test-Path $keyStore)) {
    Write-Host ""
    Write-Host "No existe el keystore de release: $keyStore" -ForegroundColor Red
    Write-Host ""
    Write-Host "Para generarlo (una sola vez, y guarda el archivo en lugar seguro):" -ForegroundColor Yellow
    Write-Host "  keytool -genkeypair -keystore `"$keyStore`" -alias $alias -keyalg RSA -keysize 4096 -validity 10950"
    Write-Host ""
    Write-Host "Si pierdes ese keystore no podras publicar actualizaciones que instalen encima." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $passFile)) {
    Write-Host "Falta el archivo con la contrasena del keystore: $passFile" -ForegroundColor Red
    exit 1
}

$storePass = (Get-Content $passFile -Raw).Trim()
if (-not $storePass) {
    Write-Host "El archivo de contrasena esta vacio: $passFile" -ForegroundColor Red
    exit 1
}

& (Join-Path $PSScriptRoot "build-apk.ps1") -KeyStore $keyStore -Alias $alias -StorePass $storePass
if ($LASTEXITCODE -ne 0) {
    Write-Host "La compilacion fallo." -ForegroundColor Red
    exit 1
}

$apk = Join-Path $PSScriptRoot "DSH-Companion.apk"
Write-Host ""
Write-Host "APK firmado con el keystore de release." -ForegroundColor Green
Write-Host ("SHA-256 del APK: " + (Get-FileHash $apk -Algorithm SHA256).Hash.ToLower())
