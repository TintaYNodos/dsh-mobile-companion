@echo off
echo ========================================================
echo   Iniciando DSH Mobile Companion en segundo plano...
echo ========================================================
wscript.exe "%~dp0run-hidden.vbs"
echo.
echo [OK] Puente iniciado exitosamente en segundo plano.
echo.
echo Para acceder desde tu celular o tablet:
echo 1. Asegurate de tener ZeroTier o Tailscale activo en ambos dispositivos.
echo 2. Abre en tu navegador movil:
echo      http://^<TU_IP_VPN^>:57420
echo.
echo    * Revisa la IP asignada en tu aplicacion de ZeroTier o Tailscale.
echo ========================================================
echo.
timeout /t 3 >nul
