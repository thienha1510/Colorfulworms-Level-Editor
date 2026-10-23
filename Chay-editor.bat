@echo off
rem Colorful Worms level editor + playtest. Keeps a small local web server running while this window is open.
cd /d "%~dp0"
echo Dang chay Colorful Worms Level Editor tai http://localhost:8793/
echo Dong cua so nay de tat.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-static.ps1" -Root "%~dp0." -Port 8793 -Open
pause
