@echo off
echo Stopping Magsic Server (node.exe)...
taskkill /F /IM node.exe
echo.
echo Server Stopped. You can verify by checking if the specific "node" window closed.
pause
