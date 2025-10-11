@echo off
echo Starting Wavespeed Server in background...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found
    echo Please create a .env file with your MONGODB_URI
    echo See .env.example for template
    pause
    exit /b 1
)

REM Kill any existing node processes on port 3001
echo Checking for existing server processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo Stopping process %%a on port 3001...
    taskkill /F /PID %%a >nul 2>nul
)

REM Start server in a new hidden window
echo Starting server on port 3001...
start /B node server.js

REM Wait a moment and check if server started
timeout /t 3 /nobreak >nul

REM Verify server is running
curl http://localhost:3001/health >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✓ Server started successfully on http://localhost:3001
    echo ✓ Server is running in the background
    echo.
    echo To stop the server, run: stop-server.bat
) else (
    echo.
    echo ✗ Server may have failed to start
    echo Check server.log for details
)

echo.
pause

