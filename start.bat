@echo off
title Djole Barber
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nije instaliran.
  echo Instaliraj Node.js sa https://nodejs.org/
  echo.
  pause
  exit /b 1
)
echo Pokrecem Djole Barber...
start "" http://127.0.0.1:3000
node server.js
pause
