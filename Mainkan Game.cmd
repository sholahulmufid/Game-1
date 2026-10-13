@echo off
cd /d "%~dp0"
echo CONNECTED - Chained Together Adventure
echo.
echo Buka http://127.0.0.1:4175 di browser lalu pilih Main berdua di satu keyboard.
echo Biarkan jendela ini terbuka selama bermain.
echo Tekan Ctrl+C untuk menghentikan server.
echo.
node scripts/serve.mjs
pause
