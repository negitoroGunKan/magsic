@echo off
echo Stopping any existing node processes...
taskkill /f /im node.exe >nul 2>&1
echo Starting Magusic Server...
echo Open http://localhost:8080/editor.html in your browser.
node server.js
pause
