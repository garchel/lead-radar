@echo off
rem ---------------------------------------------------------------
rem LeadFinder - sobe o servidor do app (build de producao) no PC.
rem Clique duplo. Se o app ja estiver no ar na porta 3000, apenas abre.
rem Para iniciar escondido no logon, use iniciar-app-oculto.vbs
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0.."
set PORTA=3000

netstat -ano | findstr /C:":%PORTA%" | findstr /C:"LISTENING" >nul 2>&1
if not errorlevel 1 goto jaRodando

if not exist "dist\server.cjs" goto gerarBuild
goto subir

:gerarBuild
echo Gerando o build de producao...
call npm run build
if errorlevel 1 goto falhouBuild

:subir
echo Iniciando o LeadFinder em http://localhost:%PORTA%
echo Feche esta janela para encerrar o app.
set NODE_ENV=production
node "dist\server.cjs"
echo.
echo O servidor parou.
pause
exit /b 0

:jaRodando
echo LeadFinder ja esta rodando em http://localhost:%PORTA%
start "" "http://localhost:%PORTA%"
exit /b 0

:falhouBuild
echo.
echo Falhou o build. Rode "npm install" e tente de novo.
pause
exit /b 1
