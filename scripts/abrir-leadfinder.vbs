' ---------------------------------------------------------------
' LeadFinder - o icone do app: sobe o servidor se preciso e abre.
'
' 1. Se a porta 3000 estiver livre, sobe o servidor escondido.
' 2. Espera o servidor responder (/api/health).
' 3. Abre a janela do app: usa o app instalado (PWA) se existir,
'    senao abre em modo aplicativo do Chrome/Edge (janela sem abas).
'
' Nao abre uma segunda copia do servidor se ele ja estiver no ar.
' ---------------------------------------------------------------
Option Explicit

Dim fso, shell, pasta, porta, aspas, url, script
Dim chrome, edge, navegador
Dim appId, perfil, achou
Dim tentativa, respondeu, req

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
aspas = Chr(34)
porta = 3000
url = "http://localhost:" & porta

pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = pasta

' ---------- 1. servidor ----------
If Not PortaEmUso(porta) Then
  If Not fso.FileExists(pasta & "\dist\server.cjs") Then
    shell.Run "cmd /c npm run build", 0, True
  End If
  shell.Run "cmd /c set NODE_ENV=production&& set PORT=" & porta & "&& node " & aspas & "dist\server.cjs" & aspas, 0, False
End If

' ---------- 2. espera responder (ate 45s) ----------
respondeu = False
For tentativa = 1 To 45
  If ServidorResponde(url & "/api/health") Then
    respondeu = True
    Exit For
  End If
  WScript.Sleep 1000
Next
If Not respondeu Then
  MsgBox "O LeadFinder nao respondeu em " & porta & " depois de 45 segundos." & vbCrLf & vbCrLf & _
         "Rode scripts\iniciar-app.cmd para ver o erro na tela.", vbExclamation, "LeadFinder"
  WScript.Quit 1
End If

' ---------- 3. achou o navegador? ----------
chrome = AcharChrome()
edge = AcharEdge()
If chrome <> "" Then
  navegador = chrome
ElseIf edge <> "" Then
  navegador = edge
Else
  ' sem Chrome/Edge: abre no navegador padrao
  shell.Run url, 1, False
  WScript.Quit 0
End If

' ---------- 4. app instalado (PWA)? ----------
AcharAppInstalado appId, perfil

' ---------- 5. abre ----------
If appId <> "" Then
  If perfil <> "" Then
    shell.Run aspas & navegador & aspas & " --profile-directory=" & aspas & perfil & aspas & " --app-id=" & appId, 1, False
  Else
    shell.Run aspas & navegador & aspas & " --app-id=" & appId, 1, False
  End If
Else
  ' janela de aplicativo: sem barra de enderecos, sem abas
  shell.Run aspas & navegador & aspas & " --app=" & url, 1, False
End If


' ================= funcoes =================

Function PortaEmUso(p)
  Dim comando, resultado
  comando = "cmd /c netstat -ano | findstr " & aspas & ":" & p & aspas & " | findstr " & aspas & "LISTENING" & aspas
  resultado = shell.Run(comando, 0, True)
  PortaEmUso = (resultado = 0)
End Function

Function ServidorResponde(endereco)
  Dim http
  ServidorResponde = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then Exit Function
  http.setTimeouts 2000, 2000, 3000, 3000
  http.open "GET", endereco, False
  http.send
  If Err.Number = 0 Then
    If http.status >= 200 And http.status < 500 Then ServidorResponde = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

Function AcharChrome()
  Dim caminhos, i
  caminhos = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Google\Chrome\Application\chrome.exe", _
    shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\Application\chrome.exe")
  AcharChrome = ""
  For i = 0 To UBound(caminhos)
    If fso.FileExists(caminhos(i)) Then
      AcharChrome = caminhos(i)
      Exit Function
    End If
  Next
End Function

Function AcharEdge()
  Dim caminhos, i
  caminhos = Array( _
    shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe", _
    shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe")
  AcharEdge = ""
  For i = 0 To UBound(caminhos)
    If fso.FileExists(caminhos(i)) Then
      AcharEdge = caminhos(i)
      Exit Function
    End If
  Next
End Function

' Procura o app instalado que aponta para localhost:3000.
' Estrutura: User Data\<perfil>\Web Applications\_crx_<id>\
Sub AcharAppInstalado(ByRef idEncontrado, ByRef perfilEncontrado)
  Dim raiz, perfilPasta, webApps, appPasta, pastaWebApps
  idEncontrado = ""
  perfilEncontrado = ""

  raiz = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Google\Chrome\User Data"
  If Not fso.FolderExists(raiz) Then Exit Sub

  For Each perfilPasta In fso.GetFolder(raiz).SubFolders
    pastaWebApps = perfilPasta.Path & "\Web Applications"
    If fso.FolderExists(pastaWebApps) Then
      For Each appPasta In fso.GetFolder(pastaWebApps).SubFolders
        If Left(appPasta.Name, 5) = "_crx_" Then
          If FolderMenciona(appPasta.Path, "localhost:" & porta, 3) Then
            idEncontrado = Mid(appPasta.Name, 6)
            If perfilPasta.Name <> "Default" Then perfilEncontrado = perfilPasta.Name
            Exit Sub
          End If
        End If
      Next
    End If
  Next
End Sub

' Le os arquivos da pasta (ate 'profundidade' niveis) procurando o texto.
Function FolderMenciona(caminho, texto, profundidade)
  Dim sub_, arq, conteudo
  FolderMenciona = False
  If profundidade < 0 Then Exit Function

  For Each arq In fso.GetFolder(caminho).Files
    If LCase(fso.GetExtensionName(arq.Name)) = "json" Or LCase(arq.Name) = "manifest" Then
      On Error Resume Next
      conteudo = fso.OpenTextFile(arq.Path, 1, False).ReadAll
      On Error GoTo 0
      If InStr(1, conteudo, texto, vbTextCompare) > 0 Then
        FolderMenciona = True
        Exit Function
      End If
    End If
  Next

  For Each sub_ In fso.GetFolder(caminho).SubFolders
    If FolderMenciona(sub_.Path, texto, profundidade - 1) Then
      FolderMenciona = True
      Exit Function
    End If
  Next
End Function
