@echo off
chcp 65001 > nul
echo ==========================================
echo      KeyStats Auto Update & Restart
echo ==========================================

echo [1/3] Stopping Electron processes...
taskkill /F /IM electron.exe /T >nul 2>&1

echo [2/3] Building latest code...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Please check the errors above.
    pause
    exit /b %errorlevel%
)

echo [3/3] Starting application...
start /b wscript Start.vbs

echo [SUCCESS] Application updated and restarted.
timeout /t 2 >nul
exit
