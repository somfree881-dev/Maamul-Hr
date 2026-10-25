#Requires -Version 5.1
#Requires -RunAsAdministrator
param([ValidateSet('Status','Start','Stop','Restart','Uninstall')][string]$Action='Status')
$ErrorActionPreference='Stop'
$name='Maamul HR Attendance Connector'
switch ($Action) {
 'Start' { Start-ScheduledTask -TaskName $name }
 'Stop' { Stop-ScheduledTask -TaskName $name }
 'Restart' { Stop-ScheduledTask -TaskName $name; Start-Sleep -Seconds 2; Start-ScheduledTask -TaskName $name }
 'Uninstall' { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Host 'Task removed. Credentials, logs and attendance queue retained in ProgramData.' }
 'Status' {
  Get-ScheduledTask -TaskName $name | Select-Object TaskName,State
  Get-ScheduledTaskInfo -TaskName $name | Select-Object LastRunTime,LastTaskResult,NextRunTime
  $log=Join-Path $env:ProgramData 'MaamulHRConnector\state\connector.log'
  if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 12 }
  Write-Host 'Running confirms the background process only. A synchronized log confirms device read and API delivery.'
 }
}
