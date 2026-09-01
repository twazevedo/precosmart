@echo off
echo ====================================================
echo  Iniciando PrecoSmart - Comparador de Precos
echo ====================================================
echo.
echo 1. Iniciando Servidor Backend (Porta 3001)...
start "PrecoSmart Backend" cmd /k "cd /d %~dp0backend && npm start"

timeout /t 2 /nobreak >nul

echo 2. Iniciando Frontend React (Porta 5173)...
start "PrecoSmart Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Tudo pronto! O sistema estara acessivel em:
echo http://localhost:5173
echo.
pause
