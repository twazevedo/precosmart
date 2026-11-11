# Instala o Servidor Local de Backup do PrecoSmart como Tarefa Agendada do Windows (nao precisa de administrador).
#
# O que a tarefa faz:
#   - inicia o backup-server.js (porta 10001) quando voce faz login no Windows;
#   - mantem o sentinela ativo em segundo plano vigiando o servidor primario (porta 10000);
#   - se o servidor primario cair, assume imediatamente os envios do grupo VIP;
#   - se o backup-server falhar, o Windows o religa em 1 minuto.
#
# Instalar:    powershell -ExecutionPolicy Bypass -File install_backup_windows.ps1
# Remover:     powershell -ExecutionPolicy Bypass -File install_backup_windows.ps1 -Uninstall
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$TaskName = 'PrecoSmartBackupServer'
$BotDir = $PSScriptRoot

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        $cmd -like "*backup-server.js*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Servidor de Backup removido ($TaskName)."
    return
}

$node = (Get-Command node -ErrorAction Stop).Source
$logs = Join-Path $BotDir 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null

# Launcher VBS: roda o Node totalmente oculto (sem janela preta) e aguarda a execucao
$vbs = Join-Path $logs 'start-backup.vbs'
@"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$BotDir"
sh.Run """$node"" ""$BotDir\backup-server.js""", 0, True
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
Write-Host "Servidor de Backup instalado e iniciado (tarefa '$TaskName')."
Write-Host "Dashboard de Redundancia: http://localhost:10001"
