@echo off
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set HIP_VISIBLE_DEVICES=0

set "PY_BIN=python"
if exist "F:\ComfyUI_old\python_embeded\python.exe" set "PY_BIN=F:\ComfyUI_old\python_embeded\python.exe"

echo ========================================================
echo   YOLO Pose Classification Server (AMD Radeon RX 9070 XT)
echo ========================================================

"%PY_BIN%" -u 5_yolo_classifier_server.py
pause
