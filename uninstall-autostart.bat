@echo off
setlocal
echo ========================================================
echo   Desinstalando DSH Mobile Companion de Inicio de Windows
echo ========================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\DSH-Mobile-Companion.lnk"
set "TARGET_DIR=%~dp0"

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%"
    echo [OK] Acceso directo eliminado de la carpeta de inicio.
) else (
    echo [INFO] No se encontro el acceso directo en Startup.
)

echo Deteniendo procesos del puente...
powershell -NoProfile -Command ^
  "$target = [System.IO.Path]::GetFullPath('%TARGET_DIR%').TrimEnd('\'); " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge.mjs*' } | ForEach-Object { " ^
  "  if ($_.CommandLine -like ('*' + $target + '*')) { " ^
  "    Write-Host ('Terminando proceso ID: ' + $_.ProcessId); " ^
  "    Stop-Process -Id $_.ProcessId -Force " ^
  "  } " ^
  "}"

echo.
echo [OK] Desinstalacion completada exitosamente.
pause
