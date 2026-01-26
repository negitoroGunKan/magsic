@echo off
cd /d "%~dp0"
echo Starting Magsic Server...
echo ---------------------------------------------------
echo Game URL:   http://localhost:8080/
echo Editor URL: http://localhost:8080/editor.html
echo iPad URL:   http://192.168.1.7:8080/
echo ---------------------------------------------------
echo.
start "" "http://localhost:8080"
start "" "http://localhost:8080/editor.html"
node server.js
pause
