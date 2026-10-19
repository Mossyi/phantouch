@echo off
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
set HIP_VISIBLE_DEVICES=0

rem Alias of 一键启动YOLO视觉服务.bat (same launcher, the name used by the docs).
rem Resolve a Python interpreter without hardcoding a developer machine path:
rem local venv -> py launcher -> python on PATH.
set "PY_BIN="
if exist "%~dp0.venv\Scripts\python.exe" set "PY_BIN=%~dp0.venv\Scripts\python.exe"
if not defined PY_BIN if exist "%~dp0venv\Scripts\python.exe" set "PY_BIN=%~dp0venv\Scripts\python.exe"
if not defined PY_BIN where py >nul 2>nul && set "PY_BIN=py -3"
if not defined PY_BIN where python >nul 2>nul && set "PY_BIN=python"

if not defined PY_BIN (
  echo [ERROR] Python was not found.
  echo         Install Python 3.10+ and run:  python -m pip install -r requirements.txt
  echo         Or create a virtual environment in this folder as .venv
  pause
  exit /b 1
)

echo ========================================================
echo   Phantouch YOLO Pose Service (12-class pose classifier)
echo   Interpreter : %PY_BIN%
echo   App address : ws://THIS-PC-LAN-IP:8000/ws
echo   Press Ctrl+C to stop, or close this window.
echo ========================================================
echo.

%PY_BIN% -u 5_yolo_classifier_server.py

echo.
echo Service stopped.
pause
