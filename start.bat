@echo off
chcp 65001 >nul 2>&1
title BFS
echo ========================================
echo   BFS - Bookmark Favorites System
echo   http://localhost:8080
echo   Press Ctrl+C to stop
echo ========================================
cd /d "%~dp0"
start http://localhost:8080
python -m http.server 8080
