# Runs yt-dlp for a ytdlp: link opened from the browser.
#
# Windows passes the whole link as the only argument. A web page can open any
# ytdlp: link it likes, so the link is never passed to yt-dlp as-is: only a
# bare video ID is accepted, and the download URL is rebuilt from it.
#
#   ytdlp:youtube/<11-character video ID>
#
# It runs without a window (install.ps1 starts it through conhost --headless)
# and reports through Windows notifications. yt-dlp's output is kept as a log
# only when something goes wrong; the failure notification opens it.
#
# Only one copy downloads at a time. A link opened while it is busy is sent to
# it over a named pipe and queued in its memory. If the busy copy is already
# finishing, the new one takes over.

param([string]$Link = '')

$saveDir = Join-Path $env:USERPROFILE 'Downloads\yt-dlp'
$dataDir = Join-Path $env:LOCALAPPDATA 'yt-dlp-handler'
$logDir = Join-Path $dataDir 'logs'
$keepLogs = 20
$appId = 'jcackowski.ytdlp-handler'
$pipeName = "ytdlp-handler-$env:USERNAME"
$maxQueued = 20
$idPattern = '^[A-Za-z0-9_-]{11}$'

# ------------------------------------------------------------ notifications

function Show-Notification([string]$title, [string]$body, [string]$openOnClick) {
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $escape = { param($text) [Security.SecurityElement]::Escape($text) }
        $launch = if ($openOnClick) { " activationType=`"protocol`" launch=`"$(& $escape ([Uri]$openOnClick).AbsoluteUri)`"" } else { '' }
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml("<toast$launch><visual><binding template=`"ToastGeneric`">" +
                     "<text>$(& $escape $title)</text><text>$(& $escape $body)</text>" +
                     '</binding></visual></toast>')
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show(
            [Windows.UI.Notifications.ToastNotification]::new($xml))
    } catch {
        # Notifications are best effort; failures still leave a log.
    }
}

# --------------------------------------------------------------------- logs

function New-LogPath([string]$id) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Get-ChildItem -LiteralPath $logDir -Filter '*.log' | Sort-Object LastWriteTime -Descending |
        Select-Object -Skip ($keepLogs - 1) | Remove-Item -ErrorAction SilentlyContinue
    Join-Path $logDir ("{0:yyyy-MM-dd_HH-mm-ss}_{1}.log" -f (Get-Date), $id)
}

function Write-FailureLog([string]$id, [string]$summary, [string[]]$details) {
    $log = New-LogPath $id
    $header = @(
        $summary
        "Link: $Link"
        "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        ''
    )
    Set-Content -LiteralPath $log -Value ($header + $details) -Encoding UTF8
    $log
}

function Stop-WithError([string]$summary) {
    $log = Write-FailureLog 'error' $summary @()
    Show-Notification 'yt-dlp: nothing downloaded' "$summary Click to open the log." $log
    exit 1
}

if ($Link -cnotmatch '^ytdlp:youtube/(?<id>[A-Za-z0-9_-]{11})/?$') {
    $shown = if ($Link.Length -gt 120) { $Link.Substring(0, 120) + '...' } else { $Link }
    Stop-WithError "Ignored link, not a YouTube video link: $shown"
}
$videoId = $Matches.id

# ------------------------------------------------- hand off to a busy copy

# Returns the busy copy's reply, or $null if no copy is listening.
function Send-ToBusyCopy([string]$id) {
    $client = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
    try {
        $client.Connect(1000)
        $writer = New-Object System.IO.StreamWriter($client)
        $writer.WriteLine($id)
        $writer.Flush()
        return (New-Object System.IO.StreamReader($client)).ReadLine()
    } catch {
        return $null
    } finally {
        $client.Dispose()
    }
}

function Enter-Lock($mutex) {
    try { return $mutex.WaitOne(0) }
    # The previous downloading copy was ended mid-download; the lock is ours now.
    catch [System.Threading.AbandonedMutexException] { return $true }
}

$mutex = New-Object System.Threading.Mutex($false, "Local\$pipeName")
while (-not (Enter-Lock $mutex)) {
    $reply = Send-ToBusyCopy $videoId
    if ($reply) {
        Show-Notification 'yt-dlp' $reply
        exit 0
    }
    # The busy copy is finishing up; wait for it to let go, then take over.
    Start-Sleep -Milliseconds 300
}

# ----------------------------------------------------------- downloading copy

# The browser that opened the link may have started before yt-dlp, deno or
# ffmpeg were installed, so its PATH can be stale. Read the current one.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path', 'User')
$ytDlp = (Get-Command yt-dlp -ErrorAction SilentlyContinue).Source
if (-not $ytDlp) {
    $mutex.ReleaseMutex()
    Stop-WithError 'yt-dlp was not found. Install it with: winget install yt-dlp.yt-dlp'
}

$queue = New-Object 'System.Collections.Generic.Queue[string]'
$queue.Enqueue($videoId)
$current = $null
$server = $null
$waiting = $null

function Start-Listening {
    $script:server = New-Object System.IO.Pipes.NamedPipeServerStream(
        $pipeName, [System.IO.Pipes.PipeDirection]::InOut, 1,
        [System.IO.Pipes.PipeTransmissionMode]::Byte, [System.IO.Pipes.PipeOptions]::Asynchronous)
    $script:waiting = $script:server.BeginWaitForConnection($null, $null)
}

# Accepts links sent by other copies. Never blocks while nobody is connecting.
function Receive-Links {
    while ($script:waiting.IsCompleted) {
        try {
            $script:server.EndWaitForConnection($script:waiting)
            $id = (New-Object System.IO.StreamReader($script:server)).ReadLine()
            if ($id -cnotmatch $idPattern) {
                $reply = 'Ignored: not a video ID.'
            } elseif ($id -ceq $script:current -or $queue.Contains($id)) {
                $reply = 'Already downloading or queued.'
            } elseif ($queue.Count -ge $maxQueued) {
                $reply = "The queue is full ($maxQueued videos); this one was not added."
            } else {
                $queue.Enqueue($id)
                $reply = "Added to the download queue (position $($queue.Count))."
            }
            $writer = New-Object System.IO.StreamWriter($script:server)
            $writer.WriteLine($reply)
            $writer.Flush()
            $script:server.WaitForPipeDrain()
        } catch {
            # A sender that gave up is ignored; it will retry on its own.
        } finally {
            $script:server.Dispose()
        }
        Start-Listening
    }
}

# Downloads one video. yt-dlp's output goes to temporary files, which become
# the log if the download fails.
function Invoke-Download([string]$id) {
    # yt-dlp appends to --print-to-file files, so start from an empty folder.
    $work = Join-Path $dataDir "running-$id"
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    $titleFile = Join-Path $work 'title.txt'
    $pathFile = Join-Path $work 'path.txt'
    $outFile = Join-Path $work 'out.txt'
    $errFile = Join-Path $work 'err.txt'
    $url = "https://www.youtube.com/watch?v=$id"

    # -t mp4 prefers H.264 + AAC in an MP4 file; res:1080 caps the resolution.
    $arguments = "--verbose --newline --no-playlist -t mp4 -S vcodec:h264,res:1080 " +
                 "-P `"$saveDir`" -o `"%(title)s [%(id)s].%(ext)s`" " +
                 "--print-to-file before_dl:%(title)s `"$titleFile`" " +
                 "--print-to-file after_move:%(filepath)s `"$pathFile`" -- $url"
    $process = Start-Process -FilePath $ytDlp -ArgumentList $arguments -NoNewWindow -PassThru `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    $null = $process.Handle  # keeps the exit code readable after the process ends

    $announced = $false
    while (-not $process.HasExited) {
        if (-not $announced -and (Test-Path -LiteralPath $titleFile)) {
            $title = (Get-Content -LiteralPath $titleFile -Encoding UTF8 -TotalCount 1)
            Show-Notification 'Downloading' $title
            $announced = $true
        }
        Receive-Links
        Start-Sleep -Milliseconds 250
    }
    $process.WaitForExit()

    $title = if (Test-Path -LiteralPath $titleFile) { Get-Content -LiteralPath $titleFile -Encoding UTF8 -TotalCount 1 } else { $url }
    $saved = if (Test-Path -LiteralPath $pathFile) { Get-Content -LiteralPath $pathFile -Encoding UTF8 -TotalCount 1 }

    if ($process.ExitCode -eq 0 -and $saved) {
        Show-Notification 'Saved' $title $saveDir
    } else {
        $details = @('--- yt-dlp output ---') + @(Get-Content -LiteralPath $outFile -ErrorAction SilentlyContinue) +
                   @('', '--- yt-dlp errors and details ---') + @(Get-Content -LiteralPath $errFile -ErrorAction SilentlyContinue)
        $log = Write-FailureLog $id "Download failed: $url (yt-dlp exit code $($process.ExitCode))" $details
        $reason = @($details | Where-Object { $_ -like 'ERROR:*' }) | Select-Object -Last 1
        $reason = if ($reason) { ($reason -replace '^ERROR:\s*(\[[^\]]+\]\s*)?([A-Za-z0-9_-]{11}:\s*)?', '').TrimEnd('.') } else { "yt-dlp exit code $($process.ExitCode)" }
        Show-Notification 'Download failed' "${title}: $reason. Click to open the log." $log
    }
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

try {
    Start-Listening
    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        Invoke-Download $current
        $current = $null
        Receive-Links
    }
} finally {
    # Stop listening before giving up the lock, so a link sent from now on
    # gets no reply and its copy takes over instead.
    if ($server) { $server.Dispose() }
    $mutex.ReleaseMutex()
}
