@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js gerekli. Hazir tasinabilir ZIP paketini kullanabilirsiniz.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 goto failure
call npm run lint
if errorlevel 1 goto failure
call npm test
if errorlevel 1 goto failure
call npm run build:win
if errorlevel 1 goto failure
start "" "%~dp0release"
exit /b 0
:failure
echo Islem tamamlanamadi. Yukaridaki hata kaydini kontrol edin.
pause
exit /b 1
