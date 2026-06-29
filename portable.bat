@echo off
REM LedgerMitra Portable Launcher
REM Run this from the unpacked portable folder to start the app.
REM All data (DB, WhatsApp session, merge output) will be stored
REM alongside this script in the LedgerMitra folder.

echo === LedgerMitra Portable ===
echo All data will be stored on this drive.
echo.

set LEDGERMITRA_PORTABLE=1
set LEDGERMITRA_DATA_DIR=%~dp0data

REM Ensure data directory exists
if not exist "%LEDGERMITRA_DATA_DIR%" mkdir "%LEDGERMITRA_DATA_DIR%"
if not exist "%~dp0LedgerMitra" mkdir "%~dp0LedgerMitra"
if not exist "%~dp0LedgerMitra\data" mkdir "%~dp0LedgerMitra\data"

REM Find and run the exe
cd /d "%~dp0"
if exist "LedgerMitra.exe" (
    start "" LedgerMitra.exe
) else if exist "win-unpacked\LedgerMitra.exe" (
    start "" win-unpacked\LedgerMitra.exe
) else (
    echo ERROR: LedgerMitra.exe not found in this folder.
    echo Make sure you are running this from the portable build folder.
    pause
    exit /b 1
)
