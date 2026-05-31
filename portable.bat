@echo off
REM LedgerMitra Portable Launcher
REM Run this from a USB drive to test portable mode.
REM All data (DB, WhatsApp session, merge output) will be stored
REM on the USB drive alongside this script.

echo === LedgerMitra Portable ===
echo All data will be stored on this drive.
echo.

set LEDGERMITRA_PORTABLE=1
set LEDGERMITRA_DATA_DIR=%~dp0data

REM Ensure data directory exists
if not exist "%LEDGERMITRA_DATA_DIR%" mkdir "%LEDGERMITRA_DATA_DIR%"

REM Run the app
cd /d "%~dp0"
npx electron .

REM Cleanup temp files on exit
if exist "%~dp0temp" rd /s /q "%~dp0temp"
