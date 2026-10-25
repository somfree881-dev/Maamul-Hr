#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param([switch]$StopExisting)
$ErrorActionPreference = 'Stop'
$taskName = 'Maamul HR Attendance Connector'
$source = $PSScriptRoot
$target = Join-Path $env:ProgramData 'MaamulHRConnector'
$sourcePython = Join-Path $source '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $sourcePython)) { throw 'Create the connector Python virtual environment first. See README.md.' }
foreach ($file in @('devices.json','.env','connector.py','requirements.txt','service_setup.py','service_entry.py')) {
 if (!(Test-Path -LiteralPath (Join-Path $source $file))) { throw "Missing connector file: $file" }
}
# Refuse competing manual instances unless the operator explicitly chooses takeover.
$manual = @(Get-CimInstance Win32_Process | Where-Object {
 $_.ExecutablePath -eq $sourcePython -and $_.CommandLine -match 'connector\.py'
})
if ($manual.Count -and !$StopExisting) { throw 'Close the manual connector with Ctrl+C, or rerun with -StopExisting to take over.' }
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
 Stop-ScheduledTask -TaskName $taskName
 Start-Sleep -Seconds 2
}
foreach ($process in $manual) { Stop-Process -Id $process.ProcessId -Force }
# Only administrators/SYSTEM can change executable code/configuration. Local Service gets read access.
New-Item -ItemType Directory -Path $target -Force | Out-Null
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
foreach ($rule in @(@('S-1-5-18','FullControl'),@('S-1-5-32-544','FullControl'),@('S-1-5-19','ReadAndExecute'))) {
 $sid = New-Object System.Security.Principal.SecurityIdentifier($rule[0])
 $access = New-Object System.Security.AccessControl.FileSystemAccessRule($sid,$rule[1],'ContainerInherit,ObjectInherit','None','Allow')
 $acl.AddAccessRule($access)
}
Set-Acl -LiteralPath $target -AclObject $acl
Copy-Item -LiteralPath (Join-Path $source 'connector.py') -Destination (Join-Path $target 'connector.py') -Force
Copy-Item -LiteralPath (Join-Path $source 'service_entry.py') -Destination (Join-Path $target 'service_entry.py') -Force
Copy-Item -LiteralPath (Join-Path $source 'requirements.txt') -Destination (Join-Path $target 'requirements.txt') -Force
& $sourcePython (Join-Path $source 'service_setup.py') $source $target
if ($LASTEXITCODE -ne 0) { throw 'Configuration setup failed.' }
$state = Join-Path $target 'state'
& icacls.exe $state /grant '*S-1-5-19:(OI)(CI)(M)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure runtime directory.' }
$python = Join-Path $target '.venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) {
 & $sourcePython -m venv (Join-Path $target '.venv')
 if ($LASTEXITCODE -ne 0) { throw 'Virtual environment setup failed.' }
}
& $python -m pip install --disable-pip-version-check -r (Join-Path $target 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed; existing queue is preserved. Rerun setup when online.' }
& $python -c "import zk, dotenv; from zoneinfo import ZoneInfo; ZoneInfo('Africa/Mogadishu')"
if ($LASTEXITCODE -ne 0) { throw 'Python runtime validation failed.' }
$pythonw = Join-Path $target '.venv\Scripts\pythonw.exe'
if (!(Test-Path -LiteralPath $pythonw)) { throw 'Windowless Python runtime not found.' }
$arguments = '"' + (Join-Path $target 'service_entry.py') + '" --config "' + (Join-Path $target 'devices.json') + '"'
$action = New-ScheduledTaskAction -Execute $pythonw -Argument $arguments -WorkingDirectory $target
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Maamul HR windowless attendance sync. Protected state and logs in ProgramData. No user login required.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host 'Installed and started: Maamul HR Attendance Connector'
Write-Host "State/log folder: $state"
Write-Host 'Use Manage-WindowsConnector.ps1 -Action Status to check startup and recent safe logs.'
