@echo off
setlocal
echo ========================================================
echo   Instalando DSH Mobile Companion en Inicio de Windows
echo ========================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "VBS_PATH=%SCRIPT_DIR%run-hidden.vbs"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\DSH-Mobile-Companion.lnk"

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$sc = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
  "$sc.TargetPath = 'wscript.exe'; " ^
  "$sc.Arguments = '\"%VBS_PATH%\"'; " ^
  "$sc.WorkingDirectory = '%SCRIPT_DIR%'; " ^
  "$sc.Description = 'DeepSeek Harness Mobile Companion Auto-Start'; " ^
  "$sc.Save();"

if exist "%SHORTCUT_PATH%" (
    echo [OK] Acceso directo de inicio automatico creado exitosamente en:
    echo      %SHORTCUT_PATH%
    echo.
    echo Iniciando el puente ahora mismo en segundo plano...
    wscript.exe "%VBS_PATH%"
    echo.
    echo ========================================================
    echo   Instalacion completada. Se iniciara con Windows!
    echo ========================================================
) else (
    echo [ERROR] No se pudo crear el acceso directo de inicio.
)

pause
