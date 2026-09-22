@echo off
chcp 65001 >nul
title Xuong Video
cd /d "%~dp0"
if not exist config.env copy config.env.mau config.env >nul
echo.
echo   Dang mo Xuong Video tai http://localhost:5196
echo   Dong cua so nay la tat server.
echo.
start "" http://localhost:5196
node server.mjs
pause
