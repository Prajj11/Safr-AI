@echo off
echo Checking for dependencies...
call npm install
echo.
echo Launching project on Mozilla Firefox...
set BROWSER=firefox
start "" "C:\Program Files\Mozilla Firefox\firefox.exe" "http://localhost:5173"
echo Starting development server...
call npm run dev

