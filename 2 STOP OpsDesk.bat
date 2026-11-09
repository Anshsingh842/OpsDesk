@echo off
setlocal enabledelayedexpansion
title OpsDesk Shutdown
cd /d "%~dp0"

echo ========================================================
echo       Stopping OpsDesk...
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

rem Step 2: Graceful shutdown request via tools\stop.js
if exist "!NODE_EXE!" (
    "!NODE_EXE!" tools\stop.js
    if !errorlevel! equ 0 (
        timeout /t 2 >nul
        exit /b 0
    )
)

rem Step 3: Fallback using pid.txt and taskkill for our own process only
if exist "data\pid.txt" (
    set /p APP_PID=<"data\pid.txt"
    if not "!APP_PID!"=="" (
        taskkill /PID !APP_PID! /F >nul 2>nul
        echo OpsDesk process [PID !APP_PID!] stopped.
        del /f /q "data\pid.txt" >nul 2>nul
    )
)

if exist "data\port.txt" (
    del /f /q "data\port.txt" >nul 2>nul
)

echo OpsDesk stopped.
timeout /t 2 >nul
exit /b 0
