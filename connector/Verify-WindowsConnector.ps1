#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
$task=Get-ScheduledTask -TaskName 'Maamul HR Attendance Connector'
$info=Get-ScheduledTaskInfo -TaskName $task.TaskName
$log=Join-Path $env:ProgramData 'MaamulHRConnector\state\connector.log'
$tail=if(Test-Path -LiteralPath $log){@(Get-Content -LiteralPath $log -Tail 4 | ForEach-Object { $_.ToString() })}else{@('No runtime log yet')}
$report=[ordered]@{state=[string]$task.State;result=$info.LastTaskResult;account=$task.Principal.UserId;executable=$task.Actions.Execute;bootTrigger=(@($task.Triggers | Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger'}).Count -gt 0);recentLog=$tail}
$reportFile=Join-Path (Split-Path $PSScriptRoot -Parent) '.preview\connector-service-verification.json'
New-Item -ItemType Directory -Path (Split-Path $reportFile -Parent) -Force | Out-Null
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $reportFile -Encoding utf8
