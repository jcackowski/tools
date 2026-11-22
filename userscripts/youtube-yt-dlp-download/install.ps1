# Installs the helper for the YouTube yt-dlp Download userscript.
#
#   irm https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/install.ps1 | iex
#
# - Installs yt-dlp, Deno and FFmpeg with winget if they're missing.
# - Puts ytdlp-handler.ps1 in %LOCALAPPDATA%\yt-dlp-handler. Run from a copy
#   of the repo, it copies the handler next to this file; run with irm | iex,
#   it downloads it from GitHub.
# - Registers the ytdlp: link type for the current user (no admin needed).
#
# Run it again to update the handler. Everything runs inside a script block so
# an error can't close the PowerShell window it was pasted into.

& {
    $ErrorActionPreference = 'Stop'
    $handlerSource = 'https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/ytdlp-handler.ps1'
    $userscriptUrl = 'https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/youtube-yt-dlp-download.user.js'
    $installDir = Join-Path $env:LOCALAPPDATA 'yt-dlp-handler'
    $handler = Join-Path $installDir 'ytdlp-handler.ps1'
    $key = 'HKCU:\Software\Classes\ytdlp'

    function Update-Path {
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                    [Environment]::GetEnvironmentVariable('Path', 'User')
    }

    # ------------------------------------------------------------ dependencies

    Update-Path
    $dependencies = @(
        @{ Command = 'yt-dlp'; Id = 'yt-dlp.yt-dlp'; Name = 'yt-dlp' }
        @{ Command = 'deno'; Id = 'DenoLand.Deno'; Name = 'Deno (needed for YouTube)' }
        @{ Command = 'ffmpeg'; Id = 'Gyan.FFmpeg'; Name = 'FFmpeg (joins video and audio)' }
    )
    $missing = @($dependencies | Where-Object { -not (Get-Command $_.Command -ErrorAction SilentlyContinue) })

    if ($missing.Count -gt 0) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            Write-Host 'winget was not found. Install these, then run this installer again:' -ForegroundColor Red
            $missing | ForEach-Object { Write-Host "  $($_.Name): winget id $($_.Id)" }
            return
        }
        foreach ($dependency in $missing) {
            Write-Host "Installing $($dependency.Name)..." -ForegroundColor Cyan
            # winget asks to accept source or package terms itself when needed.
            winget install --id $dependency.Id --exact --source winget
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Installing $($dependency.Name) failed (winget exit code $LASTEXITCODE)." -ForegroundColor Red
                return
            }
        }
        Update-Path
    }
    foreach ($dependency in $dependencies) {
        $found = Get-Command $dependency.Command -ErrorAction SilentlyContinue
        if ($found) { Write-Host "Found $($dependency.Command): $($found.Source)" }
        else { Write-Host "$($dependency.Command) is installed but not on PATH yet; it will be after you sign out and in." -ForegroundColor Yellow }
    }

    # ----------------------------------------------------------------- handler

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    $localCopy = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'ytdlp-handler.ps1' }
    if ($localCopy -and (Test-Path -LiteralPath $localCopy)) {
        Copy-Item -LiteralPath $localCopy -Destination $handler -Force
        Write-Host "Copied the handler from $localCopy"
    } else {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $content = Invoke-RestMethod -Uri $handlerSource
        Set-Content -LiteralPath $handler -Value $content -Encoding UTF8
        Write-Host "Downloaded the handler from $handlerSource"
    }

    # ------------------------------------------------------- ytdlp: link type

    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
    New-Item -Path "$key\shell\open\command" -Force | Out-Null
    Set-Item -Path $key -Value 'URL:yt-dlp handler'
    New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -Force | Out-Null
    # conhost --headless runs the handler without a console window.
    Set-Item -Path "$key\shell\open\command" `
        -Value "`"$conhost`" --headless `"$powershell`" -NoProfile -ExecutionPolicy Bypass -File `"$handler`" `"%1`""
    # The name browsers show in their "Open ...?" prompt. Without it they show
    # the launched program's name, "Windows PowerShell".
    New-Item -Path "$key\Application" -Force | Out-Null
    New-ItemProperty -Path "$key\Application" -Name 'ApplicationName' -Value 'yt-dlp' -Force | Out-Null

    # The app name shown on the handler's Windows notifications.
    $appKey = 'HKCU:\Software\Classes\AppUserModelId\jcackowski.ytdlp-handler'
    New-Item -Path $appKey -Force | Out-Null
    New-ItemProperty -Path $appKey -Name 'DisplayName' -Value 'yt-dlp' -Force | Out-Null

    Write-Host ''
    Write-Host "Installed. ytdlp: links now run $handler" -ForegroundColor Green
    Write-Host "Next, install the userscript: $userscriptUrl"
}
