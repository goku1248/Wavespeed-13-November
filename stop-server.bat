@echo off
echo Stopping Wavespeed Server...
echo.

REM Kill all node.exe processes
taskkill /F /IM node.exe >nul 2>nul

if %ERRORLEVEL% EQU 0 (
    echo ✓ Server stopped successfully
) else (
    echo No server processes found
)

echo.
pause

