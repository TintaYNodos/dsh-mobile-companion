@echo off
setlocal
echo Deteniendo DSH Mobile Companion de forma segura...
set "TARGET_DIR=%~dp0"

powershell -NoProfile -Command ^
  "$target = [System.IO.Path]::GetFullPath('%TARGET_DIR%').TrimEnd('\'); " ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bridge.mjs*' } | ForEach-Object { " ^
  "  if ($_.CommandLine -like ('*' + $target + '*')) { " ^
  "    Write-Host ('Terminando proceso ID: ' + $_.ProcessId); " ^
  "    Stop-Process -Id $_.ProcessId -Force " ^
  "  } " ^
  "}"
echo [OK] Servicio detenido limpiamente sin afectar otros programas.
timeout /t 2 >nul
