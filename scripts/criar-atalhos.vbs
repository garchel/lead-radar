' ---------------------------------------------------------------
' Cria os atalhos do LeadFinder (area de trabalho + menu Iniciar)
' apontando para abrir-leadfinder.vbs, com o icone do app.
'
' Rode uma vez: clique duplo neste arquivo.
' ---------------------------------------------------------------
Option Explicit

Dim fso, shell, pasta, alvo, icone, atalho

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
alvo = pasta & "\scripts\abrir-leadfinder.vbs"
icone = pasta & "\public\icons\leadfinder.ico"

If Not fso.FileExists(alvo) Then
  shell.Popup "Nao achei " & alvo, 8, "LeadFinder", 16
  WScript.Quit 1
End If

If Not fso.FileExists(icone) Then icone = ""

' atalho precisa chamar o wscript (o .vbs nao e executavel direto)
Dim destino, argumentos
destino = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\wscript.exe"
argumentos = Chr(34) & alvo & Chr(34)

CriarAtalho shell.SpecialFolders("Desktop") & "\LeadFinder.lnk", destino, argumentos, icone, pasta
CriarAtalho shell.SpecialFolders("StartMenu") & "\LeadFinder.lnk", destino, argumentos, icone, pasta

' Popup (nao MsgBox) fecha sozinho: quem roda isso por script nao fica preso.
shell.Popup "Atalhos criados: Area de trabalho e Menu Iniciar." & vbCrLf & _
            "Clique no icone: o servidor sobe se estiver parado e o app abre.", _
            6, "LeadFinder", 64

Sub CriarAtalho(caminho, destino, argumentos, icone, pastaTrabalho)
  Dim link
  On Error Resume Next
  Set link = shell.CreateShortcut(caminho)
  link.TargetPath = destino
  link.Arguments = argumentos
  link.WorkingDirectory = pastaTrabalho
  link.Description = "LeadFinder - abrir o app (sobe o servidor se preciso)"
  If icone <> "" Then link.IconLocation = icone
  link.WindowStyle = 1
  link.Save
  On Error GoTo 0
End Sub
