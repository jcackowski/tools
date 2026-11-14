# Reddit Video Downloader

A userscript that adds a one-click download button to Reddit-hosted (`v.redd.it`) videos. The saved file is a single MP4 with both video and sound.

Works on **old.reddit.com** and **www.reddit.com**, on post pages and in subreddit and front-page listings.

## Install

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open [`reddit-video-downloader.user.js`](reddit-video-downloader.user.js) and add it as a new script.
3. On the first download, allow the script to connect to `www.reddit.com` and `packaged-media.redd.it`.

## Use

- **Old Reddit:** click **download** in a video post's link row (after *share*, *save*, *hide* and so on).
- **New Reddit:** click **Download video** under the video.

The button shows progress, then **downloaded**. If something goes wrong it shows **retry download (reason)**; click it again to retry.

Files are named `subreddit-postId-title.mp4`, for example `cats-1xvypiq-two_maine_coon_girls_they_look_absolutely_striking.mp4`.

## How it works

Reddit stores each video's picture and sound as separate files. The new Reddit post page also lists ready-made MP4s that contain both, in the `packaged-media-json` attribute of its `<shreddit-player>` element.

- On **www.reddit.com**, the script reads that attribute from the page.
- On **old.reddit.com**, which doesn't include it, the script fetches the new Reddit page for the post (about 1.4 MB) and reads it from there.

The script picks the highest-bitrate MP4 and downloads it with `GM_xmlhttpRequest`, because the file host doesn't allow ordinary cross-site requests. It then saves the file.

These MP4 links expire after a few hours, so the script reads a fresh one each time the button is pressed.

There are no external libraries.

## Accessibility

The button targets WCAG 2.2 AA:

- It is a real `<button>` that works with the keyboard and has a visible focus outline.
- Its accessible name includes the post title, for example "download video: …".
- Progress, success and errors are announced to screen readers through a `role="status"` region.
- On old Reddit the text colours have a contrast ratio of 6.0:1 (link blue) and 7.3:1 (error red), and the button is 24px tall. On new Reddit it uses the page's own text colour.

## Limitations

- Only Reddit-hosted videos (`v.redd.it`). Videos embedded from other sites (YouTube, Imgur, …) don't get a button.
- Promoted posts are skipped. Ads tested so far don't offer a ready-made MP4.
- Not yet tested:
  - Crossposts, NSFW or quarantined posts, and videos with no ready-made MP4 (these would show the error state).
  - Real Tampermonkey or Violentmonkey installs, and Firefox. See [Development](#development).
- Old Reddit redirects logged-out visitors to a login page (seen on post pages), so the script is only useful there when you're logged in.

## Development

Tested in Chrome with [`playwright-cli`](https://www.npmjs.com/package/@playwright/cli), which needs Node.js 20 or later:

- A persistent, logged-in browser session is used, because old Reddit redirects logged-out visitors to a login page.
- Playwright has no userscript manager, so a small stand-in replaces `GM_xmlhttpRequest`. It forwards requests to Playwright's own HTTP client, which uses the browser session's cookies.
- The script is injected after the page loads, which is when userscript managers run scripts by default (`document-idle`).
- Each test clicks the button, captures the download, and confirms with `ffprobe` that the file has both an `h264` video track and an `aac` audio track.

Test output goes in `.playwright-cli/`, which git ignores.

## License

MIT
