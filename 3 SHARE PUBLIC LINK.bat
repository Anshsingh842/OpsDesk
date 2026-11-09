@echo off
setlocal enabledelayedexpansion
title OpsDesk Public Link Generator
cd /d "%~dp0"

echo ========================================================
echo       OpsDesk - Live Public Link Generator
echo ========================================================
echo.

rem Step 1: Detect Node.js runtime
set "NODE_EXE="
if exist "%~dp0runtime\node.exe" (
    set "NODE_EXE=%~dp0runtime\node.exe"
) else (
    where node >nul 2>nul
    if !errorlevel! equ 0 (
        for /f "delims=" %%i in ('where node') do set "NODE_EXE=%%i"
    )
)

if "!NODE_EXE!"=="" (
    echo [ERROR] Node.js runtime was not found!
    pause
    exit /b 1
)

rem Step 2: Ensure server is running
if not exist "data\port.txt" (
    echo Starting OpsDesk server...
    start "OpsDesk server" /min "!NODE_EXE!" --no-warnings server\index.js
    "!NODE_EXE!" tools\wait_ready.js >nul 2>nul
)

rem Step 3: Run Cloudflare tunnel
echo Establishing secure public HTTPS tunnel...
"!NODE_EXE!" tools\start_public_tunnel.js

pause
