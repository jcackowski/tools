# userscripts

Small browser tweaks for sites I use: userscripts that add features, and userstyles that change how pages look.

- **Userscripts** (`userscripts/`) run in a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/). Open the `.user.js` file and add it as a new script.
- **yt-dlp handler** (`yt-dlp-handler/`) lets the YouTube download button run [yt-dlp](https://github.com/yt-dlp/yt-dlp) on your PC. Install yt-dlp, Deno and FFmpeg (`winget install yt-dlp.yt-dlp`, `DenoLand.Deno`, `Gyan.FFmpeg`), then run `install.ps1` once to register the `ytdlp:` link type.
- **Userstyles** (`userstyles/`) are plain CSS. Add them in a style manager such as [Stylus](https://add0n.com/stylus.html) for the site they target.
