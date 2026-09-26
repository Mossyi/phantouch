@echo off
chcp 65001 >nul
title 役次元 AI 智控 App 服务端
echo ====================================================
echo        役次元 AI 智控移动端 App 启动管理
echo ====================================================
cd /d "%~dp0"
echo 正在准备环境...

:: 检查并自动释放可能卡住的 3000 端口
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo 正在清理端口 3000 旧进程 (PID: %%a)...
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo ====================================================
echo  💻 电脑浏览器访问:  http://localhost:3000
echo  📱 手机浏览器访问:  http://^<你的电脑局域网IP^>:3000
echo ====================================================
echo.
echo 正在启动 Vite 服务并自动打开浏览器...

:: 延时 2 秒自动在默认浏览器中打开
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

npm run dev
pause
