# Removes the ytdlp: link type registered by install.ps1.

$key = 'HKCU:\Software\Classes\ytdlp'
if (Test-Path $key) {
    Remove-Item -Path $key -Recurse
    Write-Host 'Removed the ytdlp: link type.'
} else {
    Write-Host 'The ytdlp: link type is not registered.'
}
