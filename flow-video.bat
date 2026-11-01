@echo off
rem Flow Studio: make videos in Google Flow from a story file (no Claude needed).
rem   flow-video.bat login 1
rem   flow-video.bat credits
rem   flow-video.bat check stories\my-story.txt
rem   flow-video.bat make stories\my-story.txt
node "%~dp0flow-video.js" %*
if errorlevel 1 pause
