# ==============================================================================
# DSH Mobile Companion - construye y firma DSH-Companion.apk sin Gradle
# Copyright (c) 2026 Tinta y Nodos / Ismael Munoz Reyes
# SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
#
# Requisitos: JDK 17+ en PATH, Android SDK con build-tools y la plataforma
# android-35, y un keystore (por defecto el de depuracion).
#
#   powershell -ExecutionPolicy Bypass -File build-apk.ps1
#   powershell -ExecutionPolicy Bypass -File build-apk.ps1 -SdkRoot "C:\sdk" -KeyStore "C:\mi.keystore"
#
# Variables de entorno:
#   ANDROID_SDK_ROOT   raiz del SDK (si no se pasa -SdkRoot)
#   DSH_KEYSTORE       keystore a usar (si no se pasa -KeyStore)
#   DSH_KEYSTORE_ALIAS alias (androiddebugkey por defecto)
#   DSH_KEYSTORE_PASS  contrasena del keystore y de la clave (android por defecto)
# ==============================================================================

param(
    [string]$SdkRoot = "",
    [string]$KeyStore = "",
    [string]$Alias = "",
    [string]$StorePass = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Fail($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
    exit 1
}

if (-not $SdkRoot) { $SdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $SdkRoot) { $SdkRoot = $env:ANDROID_HOME }
if (-not $SdkRoot) { Fail "Falta el Android SDK: usa -SdkRoot o define ANDROID_SDK_ROOT." }

if (-not $KeyStore) { $KeyStore = $env:DSH_KEYSTORE }
if (-not $KeyStore) { $KeyStore = Join-Path $env:USERPROFILE ".android\debug.keystore" }
if (-not (Test-Path $KeyStore)) { Fail "No existe el keystore: $KeyStore" }

if (-not $Alias) { if ($env:DSH_KEYSTORE_ALIAS) { $Alias = $env:DSH_KEYSTORE_ALIAS } else { $Alias = "androiddebugkey" } }
if (-not $StorePass) { if ($env:DSH_KEYSTORE_PASS) { $StorePass = $env:DSH_KEYSTORE_PASS } else { $StorePass = "android" } }

if (-not (Get-Command javac -ErrorAction SilentlyContinue)) { Fail "javac no esta en PATH. Instala un JDK 17 o superior." }

$platform = Join-Path $SdkRoot "platforms\android-35\android.jar"
if (-not (Test-Path $platform)) { Fail "Falta $platform (instala la plataforma android-35)." }

$buildTools = Get-ChildItem (Join-Path $SdkRoot "build-tools") -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.Name -replace "[^0-9.]", "") } -Descending | Select-Object -First 1
if (-not $buildTools) { Fail "No hay build-tools en $SdkRoot." }

$aapt2 = Join-Path $buildTools.FullName "aapt2.exe"
$d8 = Join-Path $buildTools.FullName "d8.bat"
$zipalign = Join-Path $buildTools.FullName "zipalign.exe"
$apksigner = Join-Path $buildTools.FullName "apksigner.bat"

$version = (Select-String -Path "src\config.mjs" -Pattern 'apkVersion:\s*"([^"]+)"').Matches[0].Groups[1].Value
$code = (Select-String -Path "src\config.mjs" -Pattern "apkVersionCode:\s*(\d+)").Matches[0].Groups[1].Value

Write-Host "== DSH Companion $version (versionCode $code) ==" -ForegroundColor Cyan
Write-Host "SDK: $SdkRoot"
Write-Host "build-tools: $($buildTools.Name)"

Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path out\classes, out\gen, out\dex | Out-Null

Write-Host "-- recursos (aapt2 compile/link)" -ForegroundColor DarkCyan
& $aapt2 compile --dir res -o out\res.zip
if ($LASTEXITCODE -ne 0) { Fail "aapt2 compile fallo" }
& $aapt2 link -o out\base.apk -I $platform --manifest android_src\AndroidManifest.xml --java out\gen --min-sdk-version 26 --target-sdk-version 35 out\res.zip
if ($LASTEXITCODE -ne 0) { Fail "aapt2 link fallo" }

Write-Host "-- javac" -ForegroundColor DarkCyan
$sources = @("out\gen\com\tintaynodos\dshcompanion\R.java") + (Get-ChildItem android_src\*.java | ForEach-Object { $_.FullName })
& javac -encoding UTF-8 -nowarn -cp $platform -d out\classes $sources
if ($LASTEXITCODE -ne 0) { Fail "javac fallo" }

Write-Host "-- dex (d8)" -ForegroundColor DarkCyan
# d8 recibe un jar, no cientos de rutas: con 70+ clases la linea de comandos de
# Windows se pasa de largo ("La linea de comandos es demasiado larga").
Add-Type -AssemblyName System.IO.Compression.FileSystem
$classesJar = Join-Path (Get-Location).Path "out\classes.jar"
if (Test-Path $classesJar) { Remove-Item $classesJar -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory((Resolve-Path "out\classes").Path, $classesJar)
& $d8 --min-api 26 --lib $platform --output out\dex $classesJar
if ($LASTEXITCODE -ne 0) { Fail "d8 fallo" }

Write-Host "-- inyectar classes.dex" -ForegroundColor DarkCyan
Copy-Item out\base.apk out\unsigned.apk -Force
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$PWD\out\unsigned.apk", [System.IO.Compression.ZipArchiveMode]::Update)
$existing = $zip.GetEntry("classes.dex")
if ($existing) { $existing.Delete() }
$entry = $zip.CreateEntry("classes.dex", [System.IO.Compression.CompressionLevel]::Optimal)
$srcStream = [System.IO.File]::OpenRead("$PWD\out\dex\classes.dex")
$dstStream = $entry.Open()
$srcStream.CopyTo($dstStream)
$dstStream.Dispose()
$srcStream.Dispose()
$zip.Dispose()

Write-Host "-- alinear y firmar" -ForegroundColor DarkCyan
& $zipalign -p -f 4 out\unsigned.apk out\aligned.apk
if ($LASTEXITCODE -ne 0) { Fail "zipalign fallo" }
& $apksigner sign --ks $KeyStore --ks-key-alias $Alias --ks-pass "pass:$StorePass" --key-pass "pass:$StorePass" out\aligned.apk
if ($LASTEXITCODE -ne 0) { Fail "apksigner fallo" }
& $apksigner verify out\aligned.apk
if ($LASTEXITCODE -ne 0) { Fail "la firma no verifica" }

Copy-Item out\aligned.apk "DSH-Companion.apk" -Force
$apk = Get-Item "DSH-Companion.apk"
$hash = (Get-FileHash $apk.FullName -Algorithm SHA256).Hash.ToLower()
Write-Host ""
Write-Host "OK: $($apk.FullName)" -ForegroundColor Green
Write-Host "    $($apk.Length) bytes | SHA-256 $hash"
Write-Host "    Sube ese archivo como asset del release; no va en el repositorio (.gitignore)."
