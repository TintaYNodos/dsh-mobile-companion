Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strCurrentDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strCurrentDir

strBridgeScript = strCurrentDir & "\bridge.mjs"
strLogFile = strCurrentDir & "\bridge.log"

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

' Redirige salida estandar y errores a bridge.log para trazabilidad y evitar ceguera operativa
strCmd = "cmd.exe /c """"" & strNodeExe & """ """ & strBridgeScript & """ >> """ & strLogFile & """ 2>&1"""
WshShell.Run strCmd, 0, False
