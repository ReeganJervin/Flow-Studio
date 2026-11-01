@echo off
rem Flow Studio: install what it needs (once). Needs Node.js (https://nodejs.org) and Google Chrome.
cd /d "%~dp0"
echo Installing Flow Studio's tools (Playwright, FFmpeg)...
call npm install
if errorlevel 1 (
  echo.
  echo Something went wrong. Is Node.js installed? Get it from https://nodejs.org
  pause
  exit /b 1
)
echo.
echo All set! Next:
echo   flow-video.bat kitsu D:\Reegan\kitsu-studio     (where Kitsu Studio is, for its voices and music)
echo   flow-video.bat login 1                          (sign in to your first Google account)
pause
