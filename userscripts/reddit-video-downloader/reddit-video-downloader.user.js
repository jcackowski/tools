// ==UserScript==
// @name         Reddit Video Downloader
// @namespace    reddit-video-downloader
// @version      0.5.2
// @description  One-click download of Reddit-hosted (v.redd.it) videos, with sound, on old and new Reddit layouts.
// @author       Jay Cackowski
// @match        https://old.reddit.com/*
// @match        https://www.reddit.com/*
// @connect      sh.reddit.com
// @connect      packaged-media.redd.it
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @license      MIT
// @icon         https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/_shared/icon.svg
// @downloadURL  https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/reddit-video-downloader/reddit-video-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/reddit-video-downloader/reddit-video-downloader.user.js
// ==/UserScript==

/*
 * How it works
 * - Reddit stores v.redd.it videos as separate video and audio streams, but the
 *   new-Reddit post page also lists "packaged" MP4s (video + audio in one file)
 *   in the `packaged-media-json` attribute of its <shreddit-player>.
 * - The layout is detected from the page, not the hostname: www.reddit.com
 *   serves the old layout when the `redesign_optout` cookie is set.
 * - On the new layout that attribute is read straight from the page.
 * - On the old layout, which doesn't expose it, the post page is fetched from
 *   sh.reddit.com (which always serves the new layout) and parsed for the same
 *   attribute.
 * - The highest-bitrate MP4 is downloaded with GM_xmlhttpRequest (the file host
 *   sends no CORS headers) and saved through a temporary blob link.
 * - Packaged-media links are signed and expire after a few hours, so they are
 *   always read fresh when the button is pressed.
 */

(() => {
    'use strict';

    const BUTTON_CLASS = 'rvd-download';
    const BUTTON = `button.${BUTTON_CLASS}.${BUTTON_CLASS}:not(#rvd-a):not(#rvd-b)`;
    const DARK_THEME_GREEN = '#7ee787';

    // ---------------------------------------------------------------- network

    const request = (url, responseType, onProgress) =>
        new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType,
                onprogress: onProgress,
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(responseType === 'blob' ? res.response : res.responseText);
                    } else {
                        reject(new Error(`HTTP ${res.status}`));
                    }
                },
                onerror: () => reject(new Error('network error')),
                ontimeout: () => reject(new Error('timed out')),
            });
        });

    // ---------------------------------------------------------- media lookup

    const pickBestMp4 = (packagedJson) => {
        let permutations = [];
        try {
            permutations = JSON.parse(packagedJson)?.playbackMp4s?.permutations || [];
        } catch {
            return null;
        }
        let best = null;
        for (const { source } of permutations) {
            if (source?.url && (!best || source.bitrateBps > best.bitrateBps)) best = source;
        }
        return best?.url || null;
    };

    // Prefers the player that belongs to the post; falls back to the first
    // player on the page (e.g. a crosspost showing the original's video).
    const findPackagedMp4 = (root, postId) => {
        const players = [...root.querySelectorAll('shreddit-player[packaged-media-json]')];
        const player = players.find((p) => p.getAttribute('post-id') === `t3_${postId}`) || players[0];
        return player ? pickBestMp4(player.getAttribute('packaged-media-json')) : null;
    };

    const fetchPackagedMp4 = async (postId) => {
        const html = await request(`https://sh.reddit.com/comments/${postId}/`, 'text');
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const url = findPackagedMp4(doc, postId);
        if (!url) throw new Error('no downloadable MP4 for this post');
        return url;
    };

    // ------------------------------------------------------------ file saving

    const slugify = (text) =>
        text
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60)
            .replace(/_+$/, '');

    const buildFilename = ({ subreddit, postId, title }) =>
        [subreddit, postId, slugify(title || '')].filter(Boolean).join('-') + '.mp4';

    const saveBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    // ------------------------------------------------------- screen readers

    let liveRegion = null;
    const announce = (message) => {
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.setAttribute('role', 'status');
            liveRegion.className = 'rvd-sr-only';
            document.body.append(liveRegion);
        }
        liveRegion.textContent = '';
        setTimeout(() => {
            liveRegion.textContent = message;
        }, 50);
    };

    // ---------------------------------------------------------- notifications

    // A desktop notification when a download finishes or fails, so you can
    // switch tabs while it runs. Clicking it returns to the button. The post ID
    // is used as the tag, so a retry replaces the earlier notification.
    const notify = (button, postId, title, text) => {
        if (typeof GM_notification !== 'function') return;
        GM_notification({
            title,
            text,
            tag: postId,
            onclick: () => {
                window.focus();
                button.scrollIntoView({ block: 'center' });
                button.focus();
            },
        });
    };

    // ----------------------------------------------------------------- button

    const ICON =
        '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="14" height="14">' +
        '<path fill="currentColor" d="M9 2h2v8.6l3.3-3.3 1.4 1.4L10 14.4 4.3 8.7l1.4-1.4L9 10.6V2zM3 16h14v2H3z"/></svg>';

    const setButtonState = (button, state, text) => {
        button.dataset.state = state;
        button.querySelector('.rvd-label').textContent = text;
        button.setAttribute('aria-disabled', String(state === 'busy'));
    };

    const createButton = (info) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.innerHTML = `${ICON}<span class="rvd-label"></span><span class="rvd-sr-only"></span>`;
        button.querySelector('.rvd-sr-only').textContent = `: ${info.title}`;
        setButtonState(button, 'idle', 'Download video');
        return button;
    };

    // `getUrl(forceFetch)` returns { url, fromPage }. A URL read from the current
    // page may have expired, so a failed download of one is retried once with a
    // freshly fetched URL.
    const runDownload = async (button, info, getUrl) => {
        if (button.dataset.state === 'busy') return;

        const filename = buildFilename(info);
        const showProgress = (event) => {
            if (event.lengthComputable && event.total) {
                const percent = Math.round((event.loaded / event.total) * 100);
                setButtonState(button, 'busy', `downloading ${percent}%`);
            }
        };

        setButtonState(button, 'busy', 'preparing…');
        announce(`Downloading ${filename}`);

        try {
            let { url, fromPage } = await getUrl(false);
            let blob;
            try {
                blob = await request(url, 'blob', showProgress);
            } catch (error) {
                if (!fromPage) throw error;
                ({ url } = await getUrl(true));
                blob = await request(url, 'blob', showProgress);
            }
            saveBlob(blob, filename);
            setButtonState(button, 'done', 'downloaded');
            announce(`Saved ${filename}`);
            notify(button, info.postId, 'Saved', filename);
        } catch (error) {
            setButtonState(button, 'error', `retry download (${error.message})`);
            announce(`Download failed: ${error.message}. Press the button to try again.`);
            notify(button, info.postId, 'Download failed', `${(info.title || filename).replace(/[.!?]+$/, '')}: ${error.message}. Click to go back and try again.`);
        }
    };

    const onActivate = (button, info, getUrl) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            runDownload(button, info, getUrl);
        });
    };

    // ------------------------------------------------------------ old reddit

    const enhanceOldReddit = () => {
        const things = document.querySelectorAll('.thing.link[data-domain="v.redd.it"]:not([data-promoted="true"])');
        for (const thing of things) {
            const buttons = thing.querySelector('ul.flat-list.buttons');
            if (!buttons || buttons.querySelector(`.${BUTTON_CLASS}`)) continue;

            const info = {
                postId: (thing.dataset.fullname || '').replace(/^t3_/, ''),
                subreddit: thing.dataset.subreddit || '',
                title: thing.querySelector('a.title')?.textContent.trim() || '',
            };
            if (!info.postId) continue;

            const button = createButton(info);
            onActivate(button, info, async () => ({ url: await fetchPackagedMp4(info.postId), fromPage: false }));

            const item = document.createElement('li');
            item.append(button);
            buttons.append(item);
        }
    };

    // ------------------------------------------------------------ new reddit

    const enhanceNewReddit = () => {
        const posts = document.querySelectorAll('shreddit-post[post-type="video"][domain="v.redd.it"]');
        for (const post of posts) {
            const container = post.querySelector(':scope > [slot="post-media-container"]');
            if (!container || container.querySelector(`:scope > .${BUTTON_CLASS}`)) continue;

            const info = {
                postId: (post.id || '').replace(/^t3_/, ''),
                subreddit: post.getAttribute('subreddit-name') || '',
                title: post.getAttribute('post-title') || '',
            };
            if (!info.postId) continue;

            const button = createButton(info);
            button.classList.add('rvd-below-video');
            onActivate(button, info, async (forceFetch) => {
                const onPage = forceFetch ? null : findPackagedMp4(post, info.postId);
                if (onPage) return { url: onPage, fromPage: true };
                return { url: await fetchPackagedMp4(info.postId), fromPage: false };
            });
            container.append(button);
        }
    };

    // ----------------------------------------------------------------- styles

    const style = document.createElement('style');
    style.textContent = `
        .rvd-sr-only {
            position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        /* The :not(#id) parts add ID-level specificity, so theme rules (Reddit, RES)
           can't outrank these !important declarations without heavier selectors of
           their own. position: relative also lifts the button above the full-post
           link overlay on new-layout feed cards. */
        ${BUTTON} {
            box-sizing: border-box !important; position: relative !important;
            display: inline-flex !important; align-items: center !important; gap: 4px !important;
            width: auto !important; min-width: 0 !important;
            height: 22px !important; min-height: 22px !important; max-height: 22px !important;
            margin: 0 !important; padding: 0 8px !important; vertical-align: middle !important;
            border: 1px solid currentColor !important; border-radius: 999px !important;
            background: transparent none !important; box-shadow: none !important; text-shadow: none !important;
            appearance: none !important; color: inherit !important; cursor: pointer !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 11px !important; font-style: normal !important; font-weight: 600 !important;
            line-height: 1 !important; letter-spacing: normal !important; text-transform: none !important;
            white-space: nowrap !important;
        }
        ${BUTTON} svg { width: 10px !important; height: 10px !important; flex-shrink: 0 !important; margin: 0 !important; }
        ${BUTTON}.rvd-below-video { margin-top: 8px !important; }
        ${BUTTON}[data-theme="dark"] { color: ${DARK_THEME_GREEN} !important; }
        ${BUTTON}:hover { background-color: rgba(128, 128, 128, 0.15) !important; }
        ${BUTTON}[data-theme="dark"]:hover { background-color: rgba(126, 231, 135, 0.15) !important; }
        ${BUTTON}[aria-disabled="true"] { cursor: progress !important; }
        ${BUTTON}:focus-visible { outline: 2px solid currentColor !important; outline-offset: 2px !important; }
        /* Extends the click target to 26px tall (WCAG 2.2 AA target size is 24px) without changing the look. */
        ${BUTTON}::before { content: "" !important; position: absolute !important; inset: -2px 0 !important; }
    `;
    document.head.append(style);

    // -------------------------------------------------------------- theming

    // Reads the first mostly-opaque background behind the button, so any theme
    // (new Reddit dark mode, RES night mode, subreddit styles) is handled the same way.
    const isOnDarkBackground = (element) => {
        for (let node = element.parentElement; node; node = node.parentElement) {
            const match = getComputedStyle(node).backgroundColor.match(/[\d.]+/g);
            if (!match) continue;
            const [r, g, b, alpha = 1] = match.map(Number);
            if (alpha < 0.5) continue;
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
        }
        return false;
    };

    const updateThemes = () => {
        for (const button of document.querySelectorAll(`.${BUTTON_CLASS}`)) {
            const theme = isOnDarkBackground(button) ? 'dark' : 'light';
            if (button.dataset.theme !== theme) button.dataset.theme = theme;
        }
    };

    // -------------------------------------------------------------- bootstrap

    // Each enhancer only matches its own layout's markup, so both can run on any page.
    const enhance = () => {
        enhanceOldReddit();
        enhanceNewReddit();
        updateThemes();
    };
    let pending = null;
    const scheduleEnhance = () => {
        clearTimeout(pending);
        pending = setTimeout(enhance, 150);
    };

    new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
    // Theme switches usually toggle a class or attribute on <html> or <body>.
    const themeObserver = new MutationObserver(scheduleEnhance);
    for (const root of [document.documentElement, document.body]) {
        themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'theme', 'data-theme'] });
    }
    enhance();
})();
