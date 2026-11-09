# tools/make_batch_files.py
import os

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

start_bat = """@echo off
setlocal enabledelayedexpansion
title OpsDesk Launcher
cd /d "%~dp0"

echo ========================================================
echo       OpsDesk - Travel Operations Platform
echo ========================================================
echo.

rem Step 1: Detect Node.js runtime (bundled portable first, then system)
set "NODE_EXE="
if exist "%~dp0runtime\\node.exe" (
    set "NODE_EXE=%~dp0runtime\\node.exe"
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
    echo Please ensure runtime\\node.exe exists or install Node.js 22 LTS from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

rem Step 2: Check if OpsDesk is already running
if exist "data\\port.txt" (
    set /p CUR_PORT=<"data\\port.txt"
    "!NODE_EXE!" tools\\wait_ready.js >nul 2>nul
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
start "OpsDesk server" /min "!NODE_EXE!" --no-warnings server\\index.js

rem Step 5: Wait until server answers health check
set "APP_PORT="
for /f "tokens=2 delims=:" %%a in ('"!NODE_EXE!" tools\\wait_ready.js') do set "APP_PORT=%%a"

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
""".replace('\n', '\r\n')

stop_bat = """@echo off
setlocal enabledelayedexpansion
title OpsDesk Shutdown
cd /d "%~dp0"

echo ========================================================
echo       Stopping OpsDesk...
echo ========================================================
echo.

rem Step 1: Detect Node.js runtime
set "NODE_EXE="
if exist "%~dp0runtime\\node.exe" (
    set "NODE_EXE=%~dp0runtime\\node.exe"
) else (
    where node >nul 2>nul
    if !errorlevel! equ 0 (
        for /f "delims=" %%i in ('where node') do set "NODE_EXE=%%i"
    )
)

rem Step 2: Graceful shutdown request via tools\\stop.js
if exist "!NODE_EXE!" (
    "!NODE_EXE!" tools\\stop.js
    if !errorlevel! equ 0 (
        timeout /t 2 >nul
        exit /b 0
    )
)

rem Step 3: Fallback using pid.txt and taskkill for our own process only
if exist "data\\pid.txt" (
    set /p APP_PID=<"data\\pid.txt"
    if not "!APP_PID!"=="" (
        taskkill /PID !APP_PID! /F >nul 2>nul
        echo OpsDesk process [PID !APP_PID!] stopped.
        del /f /q "data\\pid.txt" >nul 2>nul
    )
)

if exist "data\\port.txt" (
    del /f /q "data\\port.txt" >nul 2>nul
)

echo OpsDesk stopped.
timeout /t 2 >nul
exit /b 0
""".replace('\n', '\r\n')

readme_txt = """============================================================
              OpsDesk - Read Me First (Pehle Yeh Padho)
============================================================

1. Pehle pura folder unzip karo:
   Zip file par Right-Click karo -> 'Extract All' (Sab Extract Karein).
2. '1 START OpsDesk.bat' par double-click karo.
3. Server background me start hoga aur browser me app khul jayegi:
   http://127.0.0.1:4173/
4. Login screen par 1-click Demo Persona Selector hai:
   Kisi bhi role (Lead, Agent, Escalation Manager, Requester) par
   click karke login kar sakte ho. Password: Demo@123
5. Kaam khatam hone par '2 STOP OpsDesk.bat' par double-click karo.

Agar Windows "SmartScreen protected your PC" blue popup dikhaye:
- 'More info' par click karo, fir 'Run anyway' par click karo.
- Reason: Yeh local script hai jo local database chala raha hai.
- Note: Zip download karne ke baad Right-Click -> Properties -> Unblock
  tick karke Apply karein.
============================================================
""".replace('\n', '\r\n')

with open(os.path.join(base_dir, '1 START OpsDesk.bat'), 'wb') as f:
    f.write(start_bat.encode('ascii', errors='replace'))

with open(os.path.join(base_dir, '2 STOP OpsDesk.bat'), 'wb') as f:
    f.write(stop_bat.encode('ascii', errors='replace'))

with open(os.path.join(base_dir, 'READ_ME_FIRST.txt'), 'wb') as f:
    f.write(readme_txt.encode('utf-8'))

print('Generated batch files and READ_ME_FIRST.txt with CRLF line endings.')
