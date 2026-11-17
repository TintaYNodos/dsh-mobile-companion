@echo off
setlocal
echo Deteniendo DSH Mobile Companion de forma segura...
set "TARGET_DIR=%~dp0"
set "STOP_FLAG=%TARGET_DIR%companion.stop"

rem El supervisor de run-hidden.vbs no debe resucitar el puente mientras se para.
rem M1/H-06: la bandera es el cierre ordenado en Windows (no hay SIGTERM POSIX):
rem bridge.mjs la vigila, cierra sus servidores y sale con codigo 0.
type nul > "%STOP_FLAG%"

rem Espera hasta 5 s a que el puente se cierre solo; solo entonces fuerza.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$target = [System.IO.Path]::GetFullPath('%TARGET_DIR%').TrimEnd('\'); " ^
  "$bridge = '*bridge.mjs*'; " ^
  "$deadline = (Get-Date).AddSeconds(5); " ^
  "$alive = @(); " ^
  "while ((Get-Date) -lt $deadline) { " ^
  "  $alive = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like $bridge -and $_.CommandLine -like ('*' + $target + '*') }); " ^
  "  if ($alive.Count -eq 0) { break }; " ^
  "  Start-Sleep -Milliseconds 200 " ^
  "}; " ^
  "if ($alive.Count -gt 0) { " ^
  "  Write-Host 'El puente no cerro en 5 s: se fuerza.'; " ^
  "  $alive | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } " ^
  "}; " ^
  "$vbs = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*run-hidden.vbs*' -and $_.CommandLine -like ('*' + $target + '*') }); " ^
  "$vbs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

del "%STOP_FLAG%" >nul 2>&1
echo [OK] Servicio detenido limpiamente sin afectar otros programas.
rem Espera breve sin depender de la consola (timeout falla si no hay stdin).
ping -n 2 127.0.0.1 >nul 2>&1
