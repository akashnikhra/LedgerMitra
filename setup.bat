@echo off
setlocal enabledelayedexpansion
title LedgerMitra Setup

echo.
echo  ==============================================
echo   LedgerMitra - System Setup
echo  ==============================================
echo.
echo  This script checks for required dependencies
echo  and installs them if needed.
echo.
echo  Required:
echo    - Windows 10 or later
echo    - Node.js v18 or later
echo    - npm v9 or later
echo    - Git
echo.
echo  ==============================================
echo.

set "NEED_NODE=0"
set "NEED_GIT=0"

echo  [1/4] Checking Windows version...
for /f "tokens=2 delims=[]" %%a in ('ver') do set "VER_STR=%%a"
for /f "tokens=2-4 delims=. " %%a in ("!VER_STR!") do (
    set "WIN_MAJOR=%%a"
    set "WIN_MINOR=%%b"
    set "WIN_BUILD=%%c"
)
if defined WIN_MAJOR (
    if !WIN_MAJOR! LSS 10 (
        echo   [FAIL] Windows 10 or later is required
        pause
        exit /b 1
    ) else (
        echo   [OK] Windows !WIN_MAJOR!.!WIN_BUILD!
    )
) else (
    echo   [WARN] Could not determine Windows version, continuing...
)
echo.

echo  [2/4] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo   [MISSING] Node.js is not installed
    set "NEED_NODE=1"
) else (
    set "NODE_LINE="
    for /f "delims=" %%a in ('node --version 2^>nul') do set "NODE_LINE=%%a"
    if not defined NODE_LINE (
        echo   [MISSING] Node.js found but version could not be determined
        set "NEED_NODE=1"
    ) else (
        set "NODE_VER=!NODE_LINE:v=!"
        for /f "tokens=1 delims=." %%a in ("!NODE_VER!") do set "NODE_MAJOR=%%a"
        if !NODE_MAJOR! LSS 18 (
            echo   [OUTDATED] Node.js v!NODE_MAJOR! found, v18+ required
            set "NEED_NODE=1"
        ) else (
            echo   [OK] Node.js !NODE_LINE!
        )
    )
)

echo  [3/4] Checking npm...
where npm >nul 2>&1
if errorlevel 1 (
    if "!NEED_NODE!"=="1" (
        echo   [PENDING] Will be installed with Node.js
    ) else (
        echo   [MISSING] npm is not installed
    )
) else (
    set "NPM_LINE="
    for /f "delims=" %%a in ('npm --version 2^>nul') do set "NPM_LINE=%%a"
    if not defined NPM_LINE (
        echo   [WARN] npm found but version could not be determined
    ) else (
        echo   [OK] npm v!NPM_LINE!
    )
)

echo  [4/4] Checking Git...
where git >nul 2>&1
if errorlevel 1 (
    echo   [MISSING] Git is not installed
    set "NEED_GIT=1"
) else (
    set "GIT_LINE="
    for /f "delims=" %%a in ('git --version 2^>nul') do set "GIT_LINE=%%a"
    echo   [OK] !GIT_LINE!
)
echo.

echo  ==============================================
echo   Summary
echo  ==============================================
if "!NEED_NODE!"=="0" if "!NEED_GIT!"=="0" (
    echo   All dependencies are installed!
    echo.
    goto :RUN_PROJECT
)

if "!NEED_NODE!"=="1" (
    echo   [!] Node.js v18+ needs to be installed
)
if "!NEED_GIT!"=="1" (
    echo   [!] Git needs to be installed
)
echo.
echo  ==============================================
echo.

set /p "CONFIRM=  Install missing dependencies? (Y/N): "
if /i "!CONFIRM!" NEQ "Y" (
    echo.
    echo  Setup cancelled. Install manually:
    if "!NEED_NODE!"=="1" echo    Node.js: https://nodejs.org/
    if "!NEED_GIT!"=="1" echo    Git:     https://git-scm.com/
    echo.
    pause
    exit /b 1
)

net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [INFO] Some installations may require administrator rights.
    echo  If installation fails, right-click and "Run as administrator".
    echo.
)

if "!NEED_NODE!"=="1" (
    echo.
    echo  --- Installing Node.js LTS ---
    echo.
    set "NODE_URL=https://nodejs.org/dist/v20.15.1/node-v20.15.1-x64.msi"
    set "NODE_MSI=%TEMP%\ledgermitra-node-install.msi"

    echo  Downloading Node.js LTS...
    powershell -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
        "try { Invoke-WebRequest -Uri '!NODE_URL!' -OutFile '!NODE_MSI!' -UseBasicParsing; " ^
        "Write-Host '  Download complete.' -ForegroundColor Green } " ^
        "catch { Write-Host '  Download failed.' -ForegroundColor Red; exit 1 }"

    if errorlevel 1 (
        echo  [ERROR] Download failed. Install manually: https://nodejs.org/
        pause
        exit /b 1
    )

    echo  Installing Node.js...
    msiexec /i "!NODE_MSI!" /quiet /norestart
    if errorlevel 1 (
        echo  [ERROR] Install failed. Try running as administrator.
        pause
        exit /b 1
    )

    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
    set "PATH=C:\Program Files\nodejs;!SYS_PATH!"
    del "!NODE_MSI!" >nul 2>&1
    echo  [OK] Node.js installed
    echo.
)

if "!NEED_GIT!"=="1" (
    echo.
    echo  --- Installing Git ---
    echo.
    set "GIT_URL=https://github.com/git-for-windows/git/releases/download/v2.45.2.windows.1/Git-2.45.2-64-bit.exe"
    set "GIT_EXE=%TEMP%\ledgermitra-git-install.exe"

    echo  Downloading Git...
    powershell -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
        "try { Invoke-WebRequest -Uri '!GIT_URL!' -OutFile '!GIT_EXE!' -UseBasicParsing; " ^
        "Write-Host '  Download complete.' -ForegroundColor Green } " ^
        "catch { Write-Host '  Download failed.' -ForegroundColor Red; exit 1 }"

    if errorlevel 1 (
        echo  [ERROR] Download failed. Install manually: https://git-scm.com/
        pause
        exit /b 1
    )

    echo  Installing Git...
    "!GIT_EXE!" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
    if errorlevel 1 (
        echo  [ERROR] Install failed. Try running as administrator.
        pause
        exit /b 1
    )

    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
    set "PATH=C:\Program Files\Git\cmd;!SYS_PATH!"
    del "!GIT_EXE!" >nul 2>&1
    echo  [OK] Git installed
    echo.
)

echo  ==============================================
echo   Verifying installations
echo  ==============================================
echo.

set "VERIFY_OK=1"

where node >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] Node.js not found - restart terminal or reboot
    set "VERIFY_OK=0"
) else (
    for /f "delims=" %%a in ('node --version 2^>nul') do echo   [OK] %%a
)

where npm >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] npm not found
    set "VERIFY_OK=0"
) else (
    for /f "delims=" %%a in ('npm --version 2^>nul') do echo   [OK] npm v%%a
)

where git >nul 2>&1
if errorlevel 1 (
    echo   [FAIL] Git not found
    set "VERIFY_OK=0"
) else (
    for /f "delims=" %%a in ('git --version 2^>nul') do echo   [OK] %%a
)
echo.

if "!VERIFY_OK!"=="0" (
    echo  Some dependencies could not be verified.
    echo  Restart terminal or reboot, then run this script again.
    pause
    exit /b 1
)

:RUN_PROJECT
echo  ==============================================
echo   Installing LedgerMitra dependencies
echo  ==============================================
echo.

call "%~dp0install.bat"
if errorlevel 1 (
    echo.
    echo  [ERROR] Project installation failed.
    pause
    exit /b 1
)

echo.
echo  ==============================================
echo   Setup Complete!
echo  ==============================================
echo.
echo  LedgerMitra is ready to run.
echo.
echo  To start: start.bat
echo.
echo  ==============================================
echo.
pause
