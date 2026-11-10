# Instala o Guardiao do PrecoSmart como Tarefa Agendada do Windows (nao precisa de administrador).
#
# O que a tarefa faz:
#   - inicia o guardian.js (que inicia e vigia o bot) quando voce faz login no Windows;
#   - tenta iniciar de novo a cada 5 minutos (se o guardiao ja estiver rodando, nada acontece);
#   - se o guardiao falhar, o Windows o religa em 1 minuto.
#
# Instalar:    powershell -ExecutionPolicy Bypass -File install_guardian_windows.ps1
# Remover:     powershell -ExecutionPolicy Bypass -File install_guardian_windows.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'PrecoSmartGuardian'
$BotDir = $PSScriptRoot

if ($Uninstall) {
    try { & node (Join-Path $BotDir 'guardian.js') stop } catch {}
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Guardiao removido ($TaskName)."
    return
}

$node = (Get-Command node -ErrorAction Stop).Source
$logs = Join-Path $BotDir 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null

# Launcher VBS: roda o Node totalmente oculto (sem janela) e fica aguardando, assim a tarefa
# permanece "Em execucao" enquanto o guardiao viver (o Agendador nao cria instancias duplicadas).
$vbs = Join-Path $logs 'start-guardian.vbs'
@"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$BotDir"
sh.Run """$node"" ""$BotDir\guardian.js""", 0, True
"@ | Set-Content -Path $vbs -Encoding ASCII

$action    = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $BotDir
$atLogon   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$repeat    = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
              -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($atLogon, $repeat) `
    -Settings $settings -Principal $principal -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Guardiao instalado e iniciado (tarefa '$TaskName')."
Write-Host "Ver estado:  node guardian.js status"
Write-Host "Logs:        $logs"
