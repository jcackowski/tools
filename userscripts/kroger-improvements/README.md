# Kroger Improvements

Makes kroger.com less sluggish by stopping the analytics, survey and performance-monitoring scripts it loads on every page, and hides sponsored ads and products. Sign-in, cart, coupons and checkout are left alone.

## Install

Open [kroger-improvements.user.js](https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/kroger-improvements/kroger-improvements.user.js) with [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) installed.

## What it blocks

| Script | What it does |
|---|---|
| Adobe Launch (`assets.adobedtm.com`) | Marketing and analytics tag manager |
| Qualtrics (`qualtrics.com`, `/cdn/qualtrics.js`) | Survey pop-ups |
| Akamai mPulse (`go-mpulse.net`) | Page-speed monitoring |
| Dynatrace (`/ruxitagentjs_…`) | Session monitoring |
| Google Tag Manager, DoubleClick | Ad and conversion tracking |

The page stays interactive sooner, most noticeably on the home page. In testing, the time the home page spent frozen while loading dropped by roughly 15%. Search, product and cart pages changed less. Most of what's left is Kroger's own code.

## What it hides

- Banner and video ads marked **Sponsored**, including the one above search results. With it gone, search results no longer jump down the page while loading.
- Sponsored products in search results, carousels and the home page's sponsored sections. Search results close up so rows have no gaps.
- The **Shop More** links under search results.

## What it doesn't block

- **Akamai Bot Manager and iovation.** Kroger uses these to tell you apart from a bot at sign-in and checkout. Blocking them can lock you out.
- **Kroger's own analytics calls** (`/clickstream/…`). Stopping them would mean patching the browser functions the page uses to talk to Kroger's servers, which the bot protection may notice.

## With uBlock Origin

uBlock Origin's default lists already block Dynatrace, Google Tag Manager and DoubleClick. The script blocks them too, so they stay blocked if uBlock Origin is turned off on Kroger or loses features. To leave them to uBlock Origin, set `BLOCK_UBLOCK_OVERLAP` to `false` at the top of the script. The two don't conflict.

uBlock Origin also hides Kroger's banner ads, but not sponsored products or the Shop More links.
