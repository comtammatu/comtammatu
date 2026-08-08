@echo off
REM One-shot print-agent setup for this branch PC.
REM Double-click or: right-click -> Run as administrator
REM Optional: SETUP.cmd -EnvFile C:\secure\branch.env
REM ASCII-only: avoids Windows cmd/PowerShell mojibake.

setlocal EnableExtensions
cd /d "%~dp0"
title Com Tam Ma Tu - Print Agent Setup
set "EXITCODE=0"

echo.
echo [SETUP] Folder: %CD%
echo.

REM Re-launch elevated via cmd /k so the window stays open on failure.
net session >nul 2>&1
if errorlevel 1 (
  echo [SETUP] Need Administrator - re-launching elevated...
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath '%ComSpec%' -Verb RunAs -ArgumentList '/k \"\"%~f0\" %*\"'"
  exit /b 0
)

echo [SETUP] Administrator: OK
echo.

if not exist "%~dp0scripts\setup-branch.ps1" (
  echo [ERROR] Missing scripts\setup-branch.ps1
  echo Unzip so SETUP.cmd sits next to scripts\ and dist\
  set "EXITCODE=1"
  goto :end
)

if not exist "%~dp0dist\index.js" (
  echo [ERROR] Missing dist\index.js - incomplete bundle.
  set "EXITCODE=1"
  goto :end
)

if not exist "%~dp0.env" (
  if "%~1"=="" (
    echo [WARN] No .env in this folder yet.
    echo If HQ sent .env / branch.env, copy it here and re-run.
    echo Continuing - setup-branch will fail if required keys are missing.
    echo.
  )
)

echo [SETUP] Running scripts\setup-branch.ps1 ...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-branch.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [SETUP] FAILED - exit code %EXITCODE%
  echo If the window closed too fast, open Admin cmd and run:
  echo   cd /d "%CD%"
  echo   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-branch.ps1
) else (
  echo [SETUP] Done.
)

:end
echo.
pause
endlocal & exit /b %EXITCODE%
