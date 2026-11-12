@echo off
setlocal
echo ========================================================
echo   Panel de autorizacion de dispositivos
echo ========================================================
echo.

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject Wscript.Shell;" ^
  "if ($ws.AppActivate('Autorizar dispositivos') -or $ws.AppActivate('DSH Companion')) {" ^
  "  Write-Host 'Enfocando ventana del panel existente...'; exit 0 " ^
  "}" ^
  "$urlFile = Join-Path $env:USERPROFILE '.dsh\companion-panel-url.txt';" ^
  "if (Test-Path $urlFile) {" ^
  "  $url = (Get-Content $urlFile -Raw).Trim();" ^
  "  if ($url) { Write-Host 'Abriendo el panel...'; Start-Process $url; exit 0 }" ^
  "}" ^
  "$tokenFile = Join-Path $env:USERPROFILE '.dsh\companion-panel-token';" ^
  "if (Test-Path $tokenFile) {" ^
  "  $token = (Get-Content $tokenFile -Raw).Trim();" ^
  "  Write-Host 'Abriendo el panel en el puerto por defecto...';" ^
  "  Start-Process ('http://127.0.0.1:57421/pair?t=' + $token); exit 0" ^
  "}" ^
  "Write-Host '[ERROR] El puente no ha arrancado todavia.';" ^
  "exit 1"

echo.
echo Si el navegador no se abrio, revisa que el puente este corriendo:
echo   start.bat
echo.
pause
