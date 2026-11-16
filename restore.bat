@echo off
setlocal
title DSH Mobile Companion - Restaurar copia
echo ========================================================
echo   DSH Mobile Companion - Restaurar copia de seguridad
echo ========================================================
echo.
echo Restaura la copia valida mas reciente de .dsh\backups sobre
echo los datos del puente. Antes guarda el estado actual en una
echo carpeta -pre-restore.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Restauracion terminada y verificada. Reinicia el puente: stop.bat y start.bat
) else (
  echo La restauracion NO se pudo completar. Los datos vivos no se tocaron.
)
echo.
pause
exit /b %RC%
