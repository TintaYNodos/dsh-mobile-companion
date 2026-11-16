@echo off
setlocal
title DSH Mobile Companion - Copia de seguridad
echo ========================================================
echo   DSH Mobile Companion - Copia de seguridad
echo ========================================================
echo.
echo Guarda el registro de dispositivos, la clave de acceso y el
echo token del panel en la carpeta .dsh\backups.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backup.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Copia terminada y verificada. El detalle esta arriba.
) else (
  echo La copia NO se pudo completar. Revisa el mensaje en rojo.
)
echo.
pause
exit /b %RC%
