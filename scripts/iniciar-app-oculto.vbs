' ---------------------------------------------------------------
' LeadFinder - inicia o servidor SEM janela nenhuma.
'
' Use este arquivo (nao o .cmd) para o app ficar sempre disponivel:
'   - atalho na pasta Inicializar do Windows, ou
'   - tarefa agendada "ao fazer logon".
'
' Se a porta 3000 ja estiver em uso, ele nao faz nada.
' ---------------------------------------------------------------
Option Explicit

Dim fso, shell, pastaProjeto, porta, comando, aspas, jaRodando

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
aspas = Chr(34)

' pasta do projeto = pasta deste script \ ..
pastaProjeto = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
porta = 3000
shell.CurrentDirectory = pastaProjeto

' Algo ja escutando na porta? Sai calado (evita servidor duplicado).
comando = "cmd /c netstat -ano | findstr " & aspas & ":" & porta & aspas & " | findstr " & aspas & "LISTENING" & aspas
jaRodando = (shell.Run(comando, 0, True) = 0)
If jaRodando Then WScript.Quit 0

' Sem build de producao: gera uma vez (a primeira execucao pode demorar).
If Not fso.FileExists(pastaProjeto & "\dist\server.cjs") Then
  shell.Run "cmd /c npm run build", 0, True
End If

' As variaveis vao no proprio comando: Environment("PROCESS") do WScript nao
' chega no processo filho. 0 = janela escondida, False = nao esperar terminar.
shell.Run "cmd /c set NODE_ENV=production&& set PORT=" & porta & "&& node " & aspas & "dist\server.cjs" & aspas, 0, False
