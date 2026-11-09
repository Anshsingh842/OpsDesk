@echo off
setlocal enabledelayedexpansion
title OpsDesk Launcher
cd /d "%~dp0"

echo ========================================================
echo       OpsDesk - Travel Operations Platform
echo ========================================================
echo.

rem Step 1: Detect Node.js runtime (bundled portable first, then system)
set "NODE_EXE="
if exist "%~dp0runtime\node.exe" (
    set "NODE_EXE=%~dp0runtime\node.exe"
    echo [OK] Using bundled portable Node.js runtime.
) else (
    where node >nul 2>nul
    if !errorlevel! equ 0 (
        for /f "delims=" %%i in ('where node') do set "NODE_EXE=%%i"
        echo [OK] Using system Node.js: !NODE_EXE!
    )
)

if "!NODE_EXE!"=="" (
    echo [ERROR] Node.js was not found!
    echo Please ensure runtime\node.exe exists or install Node.js 22 LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

rem Step 2: Check if OpsDesk is already running
if exist "data\port.txt" (
    set /p CUR_PORT=<"data\port.txt"
    "!NODE_EXE!" tools\wait_ready.js >nul 2>nul
    if !errorlevel! equ 0 (
        echo [INFO] OpsDesk is already running on port !CUR_PORT!.
        echo Opening browser...
        start "" "http://127.0.0.1:!CUR_PORT!/"
        timeout /t 3 >nul
        exit /b 0
    )
)

rem Step 3: Ensure data and logs folders exist
if not exist "data" mkdir "data"
if not exist "logs" mkdir "logs"

rem Step 4: Launch server in minimized background window
echo Starting OpsDesk server...
start "OpsDesk server" /min "!NODE_EXE!" --no-warnings server\index.js

rem Step 5: Wait until server answers health check
set "APP_PORT="
for /f "tokens=2 delims=:" %%a in ('"!NODE_EXE!" tools\wait_ready.js') do set "APP_PORT=%%a"

if "!APP_PORT!"=="" (
    echo [ERROR] Server startup timed out.
    echo Check logs or run manually to inspect errors.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   [SUCCESS] OpsDesk is LIVE!
echo   URL: http://127.0.0.1:!APP_PORT!/
echo   Demo accounts are available directly on the login page.
echo   To stop OpsDesk, double-click '2 STOP OpsDesk.bat'.
echo ========================================================
echo.

start "" "http://127.0.0.1:!APP_PORT!/"
timeout /t 4 >nul
exit /b 0
