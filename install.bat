@echo off
cd /d "%~dp0"
echo Installing LedgerMitra dependencies...
echo (This may take a few minutes - downloading Chromium for WhatsApp integration...)
call npm install --legacy-peer-deps
if errorlevel 1 exit /b 1
echo Rebuilding native modules for Electron...
call npm run rebuild:native
if errorlevel 1 exit /b 1
echo.
echo Done. Run start.bat to launch.
pause
