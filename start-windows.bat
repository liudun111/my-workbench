@echo off
chcp 65001 >nul
title 我的工作台
cd /d "%~dp0"

echo.
echo   我的工作台 正在启动 ...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [错误] 未检测到 Node.js。
  echo   请先安装 Node.js 22.5 或更高版本: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node server.js

echo.
pause
