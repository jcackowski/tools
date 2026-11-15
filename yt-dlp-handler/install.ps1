# Registers the ytdlp: link type for the current user (no admin needed), so
# the browser can hand links to ytdlp-handler.ps1 in this folder.
# Run it again if this folder moves.

$handler = Join-Path $PSScriptRoot 'ytdlp-handler.ps1'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$key = 'HKCU:\Software\Classes\ytdlp'

New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -Path $key -Value 'URL:yt-dlp handler'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -Force | Out-Null
Set-Item -Path "$key\shell\open\command" `
    -Value "`"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$handler`" `"%1`""
# The name browsers show in their "Open ...?" prompt. Without it they show the
# launched program's name, "Windows PowerShell".
New-Item -Path "$key\Application" -Force | Out-Null
New-ItemProperty -Path "$key\Application" -Name 'ApplicationName' -Value 'yt-dlp' -Force | Out-Null

Write-Host "Registered ytdlp: links to $handler"
