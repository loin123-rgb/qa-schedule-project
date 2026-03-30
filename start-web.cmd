@echo off
cd /d "%~dp0"
start "Plato Workflow Server" cmd /k node src\server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3000/
