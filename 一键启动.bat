@echo off
cd /d "%~dp0annual-product"
title One-Click Launcher - life-sim-studio
where npm >nul 2>&1
if errorlevel 1 (echo [ERROR] npm not found. Install Node.js first.
  pause
  exit /b 1
)
if not exist node_modules (echo First run: installing dependencies...
  call npm install
)
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "$p='http://localhost:4317/annual';for($i=0;$i -lt 180;$i++){try{$t=New-Object Net.Sockets.TcpClient('127.0.0.1',4317);if($t.Connected){$t.Close();Start-Process $p;break}}catch{Start-Sleep -m 500}}"
echo Starting: npm run studio
call npm run studio
pause
