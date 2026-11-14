// ==UserScript==
// @name         Reddit Video Downloader
// @namespace    reddit-video-downloader
// @version      0.3.0
// @description  One-click download of Reddit-hosted (v.redd.it) videos, with sound, on old and new Reddit layouts.
// @match        https://old.reddit.com/*
// @match        https://www.reddit.com/*
// @connect      sh.reddit.com
// @connect      packaged-media.redd.it
// @grant        GM_xmlhttpRequest
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/reddit-video-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/reddit-video-downloader.user.js
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

    // ----------------------------------------------------------------- button

    const ICON =
        '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="14" height="14">' +
        '<path fill="currentColor" d="M9 2h2v8.6l3.3-3.3 1.4 1.4L10 14.4 4.3 8.7l1.4-1.4L9 10.6V2zM3 16h14v2H3z"/></svg>';

    const setButtonState = (button, state, text) => {
        button.dataset.state = state;
        button.querySelector('.rvd-label').textContent = text;
        button.setAttribute('aria-disabled', String(state === 'busy'));
    };

    // Inline !important declarations outrank every stylesheet rule, including
    // !important ones, so Reddit or RES themes can't restyle the button.
    const LOCKED_BUTTON_STYLE = {
        'box-sizing': 'border-box',
        position: 'relative',
        display: 'inline-flex',
        'align-items': 'center',
        gap: '4px',
        width: 'auto',
        'min-width': '0',
        height: '18px',
        'min-height': '18px',
        'max-height': '18px',
        margin: '0',
        padding: '0 6px',
        'vertical-align': 'middle',
        border: '1px solid currentColor',
        'border-radius': '999px',
        'background-image': 'none',
        'box-shadow': 'none',
        'text-shadow': 'none',
        appearance: 'none',
        color: 'inherit',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        'font-size': '11px',
        'font-style': 'normal',
        'font-weight': '600',
        'line-height': '1',
        'letter-spacing': 'normal',
        'text-transform': 'none',
        'white-space': 'nowrap',
        cursor: 'pointer',
    };
    const LOCKED_ICON_STYLE = { width: '10px', height: '10px', 'flex-shrink': '0', margin: '0' };

    const lockStyle = (element, declarations) => {
        for (const [property, value] of Object.entries(declarations)) {
            element.style.setProperty(property, value, 'important');
        }
    };

    const createButton = (info) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.innerHTML = `${ICON}<span class="rvd-label"></span><span class="rvd-sr-only"></span>`;
        lockStyle(button, LOCKED_BUTTON_STYLE);
        lockStyle(button.querySelector('svg'), LOCKED_ICON_STYLE);
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
        } catch (error) {
            setButtonState(button, 'error', `retry download (${error.message})`);
            announce(`Download failed: ${error.message}. Press the button to try again.`);
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
            button.style.setProperty('margin-top', '8px', 'important');
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
        /* Fixed styles are set inline (see LOCKED_BUTTON_STYLE); only state styles live here.
           position: relative (inline) also lifts the button above the full-post link
           overlay on new-layout feed cards. */
        button.${BUTTON_CLASS}.${BUTTON_CLASS} { background-color: transparent !important; }
        button.${BUTTON_CLASS}.${BUTTON_CLASS}:hover { background-color: rgba(128, 128, 128, 0.15) !important; }
        button.${BUTTON_CLASS}.${BUTTON_CLASS}[aria-disabled="true"] { cursor: progress !important; }
        button.${BUTTON_CLASS}.${BUTTON_CLASS}:focus-visible { outline: 2px solid currentColor !important; outline-offset: 2px !important; }
        /* Extends the click target to 24px tall (WCAG 2.2 AA target size) without changing the look. */
        button.${BUTTON_CLASS}.${BUTTON_CLASS}::before { content: ""; position: absolute; inset: -4px 0; }
    `;
    document.head.append(style);

    // -------------------------------------------------------------- bootstrap

    // Each enhancer only matches its own layout's markup, so both can run on any page.
    const enhance = () => {
        enhanceOldReddit();
        enhanceNewReddit();
    };
    let pending = null;
    const scheduleEnhance = () => {
        clearTimeout(pending);
        pending = setTimeout(enhance, 150);
    };

    new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
    enhance();
})();
