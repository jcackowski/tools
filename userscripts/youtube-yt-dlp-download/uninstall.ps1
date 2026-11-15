# Removes what install.ps1 added: the ytdlp: link type and
# %LOCALAPPDATA%\yt-dlp-handler. yt-dlp, Deno and FFmpeg stay installed.
#
#   irm https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/youtube-yt-dlp-download/uninstall.ps1 | iex

& {
    $key = 'HKCU:\Software\Classes\ytdlp'
    $installDir = Join-Path $env:LOCALAPPDATA 'yt-dlp-handler'

    if (Test-Path $key) {
        Remove-Item -Path $key -Recurse
        Write-Host 'Removed the ytdlp: link type.'
    } else {
        Write-Host 'The ytdlp: link type was not registered.'
    }
    $appKey = 'HKCU:\Software\Classes\AppUserModelId\jcackowski.ytdlp-handler'
    if (Test-Path $appKey) {
        Remove-Item -Path $appKey -Recurse
        Write-Host 'Removed the notification app name.'
    }
    if (Test-Path -LiteralPath $installDir) {
        Remove-Item -LiteralPath $installDir -Recurse
        Write-Host "Removed $installDir"
    }
    Write-Host 'yt-dlp, Deno and FFmpeg are still installed. Remove them with winget uninstall if you no longer need them.'
}
