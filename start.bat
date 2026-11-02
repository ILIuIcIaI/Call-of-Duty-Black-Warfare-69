@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js fehlt auf diesem PC. Das Spiel braucht es aber nicht:
  echo   - Allein gegen Bots: index.html doppelklicken, das Spiel laeuft direkt im Browser.
  echo   - Mit Multiplayer: die Windows-Version nehmen ^(Black Warfare 69.exe^), da ist alles drin.
  echo   - Nur mitspielen: im Browser die Adresse oeffnen, die der andere PC in seiner Lobby zeigt.
  echo.
  echo Wer trotzdem start.bat nutzen will: Node.js gibt es auf https://nodejs.org
  echo.
  pause
  exit /b 1
)
rem (only a copy of the source needs three.js from npm, the packed game carries it inside)
if exist src\main.js if not exist node_modules\three call npm install
set BW69_OPEN=1
node server.js
if errorlevel 1 pause
