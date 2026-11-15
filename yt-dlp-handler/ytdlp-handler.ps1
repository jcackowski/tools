# Runs yt-dlp for a ytdlp: link opened from the browser.
#
# Windows passes the whole link as the only argument. A web page can open any
# ytdlp: link it likes, so the link is never passed to yt-dlp as-is: only a
# bare video ID is accepted, and the download URL is rebuilt from it.
#
#   ytdlp:youtube/<11-character video ID>
#
# Only one window downloads at a time. A link opened while it is busy is sent
# to it over a named pipe and queued in its memory; the new window confirms
# and closes. If the busy window is already finishing, the new one takes over.

param([string]$Link = '')

$saveDir = Join-Path $env:USERPROFILE 'Downloads\yt-dlp'
$pipeName = "ytdlp-handler-$env:USERNAME"
$maxQueued = 20
$idPattern = '^[A-Za-z0-9_-]{11}$'
$Host.UI.RawUI.WindowTitle = 'yt-dlp'

function Stop-WithError([string]$message) {
    Write-Host $message -ForegroundColor Red
    Read-Host 'Press Enter to close' | Out-Null
    exit 1
}

if ($Link -cnotmatch '^ytdlp:youtube/(?<id>[A-Za-z0-9_-]{11})/?$') {
    $shown = if ($Link.Length -gt 120) { $Link.Substring(0, 120) + '...' } else { $Link }
    Stop-WithError "Ignored link, not a YouTube video link: $shown"
}
$videoId = $Matches.id

# ------------------------------------------------- hand off to a busy window

# Returns the busy window's reply, or $null if no window is listening.
function Send-ToBusyWindow([string]$id) {
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
    # The previous downloading window was closed mid-download; the lock is ours now.
    catch [System.Threading.AbandonedMutexException] { return $true }
}

$mutex = New-Object System.Threading.Mutex($false, "Local\$pipeName")
while (-not (Enter-Lock $mutex)) {
    $reply = Send-ToBusyWindow $videoId
    if ($reply) {
        Write-Host $reply
        Start-Sleep -Seconds 2
        exit 0
    }
    # The busy window is finishing up; wait for it to let go, then take over.
    Start-Sleep -Milliseconds 300
}

# --------------------------------------------------------- downloading window

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

# Accepts links sent by other windows. Never blocks while nobody is connecting.
function Receive-Links {
    while ($script:waiting.IsCompleted) {
        try {
            $script:server.EndWaitForConnection($script:waiting)
            $id = (New-Object System.IO.StreamReader($script:server)).ReadLine()
            if ($id -cnotmatch $idPattern) {
                $reply = 'Ignored: not a video ID.'
            } elseif ($id -ceq $script:current -or $queue.Contains($id)) {
                $reply = "Already downloading or queued: $id"
            } elseif ($queue.Count -ge $maxQueued) {
                $reply = "Queue is full ($maxQueued); ignored $id"
                Write-Host $reply -ForegroundColor Yellow
            } else {
                $queue.Enqueue($id)
                $reply = "Added to the download queue (position $($queue.Count))."
                Write-Host "Queued $id ($($queue.Count) waiting)" -ForegroundColor Cyan
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

$saved = 0
$failed = New-Object System.Collections.Generic.List[string]
try {
    Start-Listening
    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $url = "https://www.youtube.com/watch?v=$current"
        Write-Host ''
        Write-Host "Downloading $url" -ForegroundColor Cyan
        Write-Host "Saving to $saveDir"

        # -t mp4 prefers H.264 + AAC in an MP4 file; res:1080 caps the resolution.
        $start = New-Object System.Diagnostics.ProcessStartInfo
        $start.FileName = $ytDlp
        $start.Arguments = "--no-playlist -t mp4 -S vcodec:h264,res:1080 -P `"$saveDir`" " +
                           "-o `"%(title)s [%(id)s].%(ext)s`" -- $url"
        $start.UseShellExecute = $false
        $process = [System.Diagnostics.Process]::Start($start)
        while (-not $process.WaitForExit(250)) { Receive-Links }

        if ($process.ExitCode -eq 0) { $saved++ } else { $failed.Add($current) }
        $current = $null
        Receive-Links
    }
} finally {
    # Stop listening before giving up the lock, so a link sent from now on
    # gets no reply and its window takes over instead.
    if ($server) { $server.Dispose() }
    $mutex.ReleaseMutex()
}

Write-Host ''
if ($failed.Count -gt 0) {
    Stop-WithError "Saved $saved, failed $($failed.Count): $($failed -join ', ')"
}
Write-Host "Done. Saved $saved to $saveDir" -ForegroundColor Green
Start-Sleep -Seconds 4
