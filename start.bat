@echo off
setlocal
echo ========================================================
echo   Iniciando DSH Mobile Companion en segundo plano...
echo ========================================================
wscript.exe "%~dp0run-hidden.vbs"

rem Comprueba de verdad que el puente responde (antes se anunciaba "OK"
rem aunque el puerto estuviera ocupado o node fallara al arrancar).
set "OK="
for /L %%i in (1,1,10) do (
  if not defined OK (
    for /f "delims=" %%c in ('curl -s -o nul -w "%%{http_code}" --max-time 2 http://127.0.0.1:57420/healthz 2^>nul') do (
      if "%%c"=="200" set "OK=1"
    )
    if not defined OK ping -n 2 127.0.0.1 >nul 2>&1
  )
)

if defined OK (
  echo [OK] Puente iniciado y respondiendo en http://127.0.0.1:57420/healthz
) else (
  echo [AVISO] El puente no respondio en 10 s. Revisa bridge.log.
  echo         Si el puerto esta ocupado, ejecuta stop.bat y vuelve a intentarlo.
)

echo.
echo Para acceder desde tu celular o tablet:
echo 1. Asegurate de tener ZeroTier o Tailscale activo en ambos dispositivos.
echo 2. Abre en tu navegador movil:
echo      http://^<TU_IP_VPN^>:57420
echo.
echo    * Revisa la IP asignada en tu aplicacion de ZeroTier o Tailscale.
echo ========================================================
ping -n 4 127.0.0.1 >nul 2>&1
