@echo off
cd /d "%~dp0"
if not exist node_modules\three call npm install
start "" http://localhost:8069
node server.js
