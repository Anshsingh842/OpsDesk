@echo off
title OpsDesk - Push to GitHub
setlocal

:: Locate base directory
set "BASE_DIR=%~dp0"
if exist "%BASE_DIR%tools\push_to_github.py" goto found
set "BASE_DIR=%USERPROFILE%\.gemini\antigravity\scratch\OpsDesk\"
if exist "%BASE_DIR%tools\push_to_github.py" goto found

echo [ERROR] OpsDesk project directory not found!
pause
exit /b 1

:found
cd /d "%BASE_DIR%"
echo =======================================================
echo          OpsDesk GitHub Repository Publisher
echo =======================================================
echo.
python tools\push_to_github.py
pause
