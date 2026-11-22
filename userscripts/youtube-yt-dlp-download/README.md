# YouTube yt-dlp Download

Makes YouTube's own **Download** download the video on your PC with [yt-dlp](https://github.com/yt-dlp/yt-dlp): MP4, up to 1080p, saved to `Downloads\yt-dlp`. This covers Download in the ⋯ menu under a video, in a thumbnail's ⋮ menu, and the Download button in the row under a video. That row always has a Download button: YouTube's own when it has one, otherwise a copy of its Share button turned into Download.

Windows only. YouTube doesn't offer full-quality downloads a browser can save directly, so the script hands the video to yt-dlp through a small helper.

## Install

1. Install the helper: paste this into PowerShell.
   ```powershell
   irm https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/install.ps1 | iex
   ```
   It installs yt-dlp, Deno and FFmpeg with winget if they're missing, saves the helper to `%LOCALAPPDATA%\yt-dlp-handler`, and adds a `ytdlp:` link type for your Windows user (no admin needed). [Read install.ps1](install.ps1) first if you like. Run the same command again to update the helper.
2. Install the userscript: open [youtube-yt-dlp-download.user.js](https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/youtube-yt-dlp-download.user.js) with [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) installed.

The first download asks to open **yt-dlp**. You can allow it permanently for youtube.com. Every download opens a message naming the video: a Windows notification should follow within a few seconds, and if none does, the helper from step 1 isn't installed. The page can't detect that itself. The message comes from the shared [notifications.js](../_shared/notifications.js), which the userscript loads with `@require` from a tagged release.

## Using it

- Downloads run in the background, with no window. Each video gets one Windows notification with a progress bar that turns into **Saved** when done. Clicking the Saved pop-up shows the file in File Explorer. This doesn't work from the notification centre, a Windows limitation for scripts like this.
- A video that's already in `Downloads\yt-dlp` (matched by the `[video ID]` at the end of its file name) isn't downloaded again; you get an **Already downloaded** notification instead.
- When a download fails, the notification says why, and clicking it opens a log with yt-dlp's full output. Logs are kept only for failures, in `%LOCALAPPDATA%\yt-dlp-handler\logs` (the newest 20).
- Videos clicked while one is downloading are queued (up to 20). Repeat clicks are ignored.
- Keep yt-dlp current with `yt-dlp -U` or `winget upgrade yt-dlp.yt-dlp`. YouTube changes often break older versions.

## Security

Any web page can open a `ytdlp:` link, so the helper accepts only an 11-character YouTube video ID and builds the download URL itself. Nothing else from the link reaches yt-dlp. At worst, a page can start downloads of YouTube videos.

## Uninstall

```powershell
irm https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/uninstall.ps1 | iex
```

Then remove the userscript. yt-dlp, Deno and FFmpeg stay installed; remove them with `winget uninstall` if you no longer need them.
