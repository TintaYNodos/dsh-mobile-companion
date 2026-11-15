' DSH Mobile Companion - arranque silencioso con supervisor
' (c) 2026 Tinta y Nodos / Ismael Munoz Reyes - SPDX-License-Identifier: BUSL-1.1
'
' Si el puente cae por un fallo, lo vuelve a levantar con espera creciente.
' stop.bat crea companion.stop para que el supervisor no lo resucite.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurrentDir

strBridgeScript = strCurrentDir & "\bridge.mjs"
strLogFile = strCurrentDir & "\bridge.log"
strStopFlag = strCurrentDir & "\companion.stop"

strUserProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")
strDshNode = strUserProfile & "\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

strNodeExe = ""
If fso.FileExists(strDshNode) Then
    strNodeExe = strDshNode
ElseIf fso.FileExists(WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe") Then
    strNodeExe = WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
Else
    strNodeExe = "node"
End If

strCmd = "cmd.exe /c """"" & strNodeExe & """ """ & strBridgeScript & """ >> """ & strLogFile & """ 2>&1"""

If fso.FileExists(strStopFlag) Then WScript.Quit 0

intAttempts = 0
Do
    intCode = WshShell.Run(strCmd, 0, True)
    If fso.FileExists(strStopFlag) Then Exit Do
    ' cierre limpio (codigo 0): no se reinicia
    If intCode = 0 Then Exit Do
    intAttempts = intAttempts + 1
    If intAttempts > 50 Then Exit Do
    WScript.Sleep 5000
Loop
