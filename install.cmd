@echo off
rem Double-click to build and install the Halden 6 VST3 plugin. See install.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
