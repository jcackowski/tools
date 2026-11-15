# Reddit Video Downloader

Adds a **Download video** button to Reddit-hosted (v.redd.it) video posts. One click saves the video, with sound, as `subreddit-postId-title.mp4`.

Works on old and new Reddit, including www.reddit.com with the old layout (for example with Reddit Enhancement Suite), on post pages and listings.

A desktop notification says when a download is saved or fails, so you can switch tabs while it runs. Clicking it brings you back to the button. Your browser may ask once to allow notifications from your userscript manager.

No other software is needed. For YouTube downloads, see [YouTube yt-dlp Download](../youtube-yt-dlp-download/).

## Install

Open [reddit-video-downloader.user.js](https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/reddit-video-downloader/reddit-video-downloader.user.js) with [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) installed.

## How it works

Reddit stores video and audio as separate streams, but its new layout also lists ready-made MP4s with both. The script reads that list (fetching the post's new-layout page when you're on the old layout) and downloads the highest-quality MP4.

Only v.redd.it videos are supported, not YouTube, Imgur or other embeds.
