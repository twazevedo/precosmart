@echo off
title PrecoSmart Bot em Segundo Plano
cd /d "C:\Users\Thiago\Desktop\Projetos_GitHub\precosmart\whatsapp-bot"
:loop
echo Iniciando o PrecoSmart Bot...
node bot.js > bot_debug.log 2>&1
echo O bot parou! Reiniciando em 5 segundos...
ping 127.0.0.1 -n 6 > nul
goto loop
