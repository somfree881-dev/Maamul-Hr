# Launch the installer with a UAC prompt; the continuous connector stays windowless.
$ErrorActionPreference='Stop'
$installer=Join-Path $PSScriptRoot 'Install-WindowsConnector.ps1'
$arguments='-NoProfile -ExecutionPolicy Bypass -File "'+$installer+'" -StopExisting'
try {
 $process=Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
 if ($process.ExitCode -ne 0) { throw 'Installation did not complete. Run Install-WindowsConnector.ps1 in an Administrator PowerShell to see the error.' }
 Write-Host 'Connector installed. It starts at boot without a terminal. Check Maamul HR Attendance for synchronization status.'
} catch {
 Write-Host 'Installation requires the Windows administrator prompt to be accepted.'
 Write-Host $_.Exception.Message
 exit 1
}
