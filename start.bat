@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js fehlt auf diesem PC. Installiere es von https://nodejs.org und starte dann nochmal.
  echo.
  echo Nur mitspielen geht auch ohne: Oeffne im Browser die Adresse, die der andere PC in der Lobby zeigt.
  echo.
  pause
  exit /b 1
)
if not exist node_modules\three call npm install
set BW69_OPEN=1
node server.js
if errorlevel 1 pause
