@echo off
setlocal
echo Deteniendo DSH Mobile Companion de forma segura...
set "TARGET_DIR=%~dp0"

rem El supervisor de run-hidden.vbs no debe resucitar el puente mientras se para.
type nul > "%TARGET_DIR%companion.stop"

powershell -NoProfile -Command ^
  "$target = [System.IO.Path]::GetFullPath('%TARGET_DIR%').TrimEnd('\'); " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ($_.CommandLine -like '*bridge.mjs*' -or $_.CommandLine -like '*run-hidden.vbs*') } | ForEach-Object { " ^
  "  if ($_.CommandLine -like ('*' + $target + '*')) { " ^
  "    Write-Host ('Terminando proceso ID: ' + $_.ProcessId); " ^
  "    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue " ^
  "  } " ^
  "}"

timeout /t 2 >nul
del "%TARGET_DIR%companion.stop" >nul 2>&1
echo [OK] Servicio detenido limpiamente sin afectar otros programas.
timeout /t 2 >nul
