// ==UserScript==
// @name         YouTube yt-dlp Download
// @namespace    github.com/jcackowski/tools
// @version      0.3.0
// @description  Adds a download button under YouTube videos that hands the video to yt-dlp on your computer.
// @author       Jay Cackowski
// @homepageURL  https://github.com/jcackowski/tools
// @supportURL   https://github.com/jcackowski/tools/issues
// @license      MIT
// @icon         https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/_shared/icon.svg
// @match        https://www.youtube.com/*
// @grant        none
// @require      https://raw.githubusercontent.com/jcackowski/tools/notifications-v1.0.0/userscripts/_shared/notifications.js#sha256=b36f0c3f5c345de737fa7d1f6a6151c889c8bb81e43fac3302a194d0eff59029
// @downloadURL  https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/youtube-yt-dlp-download.user.js
// @updateURL    https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-yt-dlp-download/youtube-yt-dlp-download.user.js
// ==/UserScript==

/*
 * How it works
 * - The button opens a `ytdlp:youtube/<video ID>` link. Windows passes it to
 *   ytdlp-handler.ps1 (set up by install.ps1 in this folder), which runs
 *   yt-dlp in the background and reports through Windows notifications.
 * - Only the video ID is sent; the handler rebuilds the YouTube URL itself.
 * - YouTube changes videos without reloading the page, so the video ID and
 *   title are read when the button is pressed, not when it is added.
 */

(() => {
    'use strict';

    // From _shared/notifications.js (@require). Taken now, before another
    // script on the page can replace the global with a different version.
    const notifications = globalThis.jcNotifications;

    const BUTTON_CLASS = 'yyd-download';
    const BUTTON = `button.${BUTTON_CLASS}.${BUTTON_CLASS}:not(#yyd-a):not(#yyd-b)`;
    const DARK_THEME_GREEN = '#7ee787';
    const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

    const currentVideo = () => {
        const id = new URL(location.href).searchParams.get('v');
        if (location.pathname !== '/watch' || !id || !VIDEO_ID.test(id)) return null;
        const title = document.querySelector('ytd-watch-metadata #title h1')?.textContent.trim() || '';
        return { id, title };
    };

    // ------------------------------------------------------- screen readers

    let liveRegion = null;
    const announce = (message) => {
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.setAttribute('role', 'status');
            liveRegion.className = 'yyd-sr-only';
            document.body.append(liveRegion);
        }
        liveRegion.textContent = '';
        setTimeout(() => {
            liveRegion.textContent = message;
        }, 50);
    };

    // ----------------------------------------------------------------- button

    // YouTube enforces Trusted Types, which blocks innerHTML, so the button is
    // built with DOM calls.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const createIcon = () => {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('viewBox', '0 0 20 20');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', 'M9 2h2v8.6l3.3-3.3 1.4 1.4L10 14.4 4.3 8.7l1.4-1.4L9 10.6V2zM3 16h14v2H3z');
        svg.append(path);
        return svg;
    };
    const IDLE_LABEL = 'Download with yt-dlp';

    // ------------------------------------------------------- first-run notice

    // The page can't tell whether the ytdlp: link reached the helper, so the
    // first click opens a modal saying what to expect. The flag lives in
    // youtube.com's localStorage; clearing site data shows it again. If
    // storage is blocked, it shows once per page load.
    const NOTICE_KEY = 'yyd-first-run-notice-shown';
    const NOTICE_TEXT = "A Windows notification should appear within a few seconds. If none does, the yt-dlp helper isn't installed on this PC yet.";
    const SETUP_URL = 'https://github.com/jcackowski/tools/tree/main/userscripts/youtube-yt-dlp-download#install';

    let noticeTaken = false;
    const isFirstClick = () => {
        if (noticeTaken) return false;
        noticeTaken = true;
        try {
            if (localStorage.getItem(NOTICE_KEY)) return false;
            localStorage.setItem(NOTICE_KEY, '1');
        } catch {
            // Storage blocked: the in-memory flag above still limits it to once.
        }
        return true;
    };

    const showNotice = (button) => {
        notifications.showModal({
            title: 'Sent to yt-dlp',
            message: NOTICE_TEXT,
            link: { text: 'Install the helper', href: SETUP_URL },
            closeLabel: 'Got it',
            theme: button.dataset.theme,
        });
    };

    let resetTimer = null;
    const setLabel = (button, text) => {
        button.querySelector('.yyd-label').textContent = text;
    };

    const createButton = () => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        const label = document.createElement('span');
        label.className = 'yyd-label';
        const srOnly = document.createElement('span');
        srOnly.className = 'yyd-sr-only';
        button.append(createIcon(), label, srOnly);
        setLabel(button, IDLE_LABEL);
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const video = currentVideo();
            if (!video) return;
            location.href = `ytdlp:youtube/${video.id}`;
            setLabel(button, 'sent to yt-dlp');
            // If the @require'd library didn't load, skip the modal and keep the flag unset.
            if (notifications && isFirstClick()) {
                showNotice(button);
            } else {
                announce(`Sent ${video.title || 'this video'} to yt-dlp. Windows notifications will show its progress.`);
            }
            clearTimeout(resetTimer);
            resetTimer = setTimeout(() => setLabel(button, IDLE_LABEL), 4000);
        });
        return button;
    };

    // ------------------------------------------------- thumbnail menu Download

    // YouTube's own Download item in a thumbnail's ⋮ menu sends the video to
    // yt-dlp instead. Older menus render it as its own element; newer ones as a
    // generic list item recognised by its download icon, so this works in any
    // page language.
    const DOWNLOAD_ITEM = 'ytd-menu-service-item-download-renderer';
    const DOWNLOAD_ICON = 'path[d^="M12 2a1 1 0 00-1 1v11.586l"]';
    const VIDEO_LINK = /[?&]v=([A-Za-z0-9_-]{11})|\/shorts\/([A-Za-z0-9_-]{11})/;

    // The menu opens in a popup away from the thumbnail, so the video is noted
    // when its ⋮ button is pressed: the nearest ancestor that links to exactly
    // one video is taken to be the thumbnail.
    let menuVideo = null;
    const videoAround = (button) => {
        for (let node = button.parentElement; node && node !== document.body; node = node.parentElement) {
            const ids = new Set();
            for (const link of node.querySelectorAll('a[href]')) {
                const match = link.getAttribute('href').match(VIDEO_LINK);
                if (match) ids.add(match[1] || match[2]);
            }
            if (ids.size === 1) {
                const title = node.querySelector('#video-title, h3, a[title]');
                return { id: [...ids][0], title: (title?.getAttribute('title') || title?.textContent || '').trim() };
            }
            if (ids.size > 1) return null;
        }
        return null;
    };

    const downloadItemFrom = (target) => {
        const item = target.closest(DOWNLOAD_ITEM);
        if (item) return item;
        const listItem = target.closest('yt-list-item-view-model');
        return listItem?.querySelector(DOWNLOAD_ICON) ? listItem : null;
    };

    window.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const item = downloadItemFrom(event.target);
        if (!item) {
            const button = event.target.closest('button');
            if (button && !button.closest('ytd-popup-container, tp-yt-iron-dropdown')) menuVideo = videoAround(button);
            return;
        }
        const dataId = item.data?.serviceEndpoint?.offlineVideoEndpoint?.videoId;
        const video = VIDEO_ID.test(dataId || '') ? { id: dataId, title: dataId === menuVideo?.id ? menuVideo.title : '' } : menuVideo;
        if (!video) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        location.href = `ytdlp:youtube/${video.id}`;
        announce(`Sent ${video.title || 'this video'} to yt-dlp. Windows notifications will show its progress.`);
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true }));
    }, true);

    const enhance = () => {
        const video = currentVideo();
        const title = document.querySelector('ytd-watch-metadata #title');
        let button = document.querySelector(`.${BUTTON_CLASS}`);
        if (!video || !title) return;

        if (!button || button.parentElement !== title.parentElement) {
            button?.remove();
            button = createButton();
            title.after(button);
        }
        const name = `: ${video.title}`;
        const srOnly = button.querySelector('.yyd-sr-only');
        if (srOnly.textContent !== name) srOnly.textContent = name;

        const theme = isOnDarkBackground(button) ? 'dark' : 'light';
        if (button.dataset.theme !== theme) button.dataset.theme = theme;
    };

    // ----------------------------------------------------------------- styles

    const style = document.createElement('style');
    style.textContent = `
        .yyd-sr-only {
            position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        /* The :not(#id) parts add ID-level specificity, so page styles can't
           outrank these !important declarations without heavier selectors. */
        ${BUTTON} {
            box-sizing: border-box !important; position: relative !important;
            display: inline-flex !important; align-items: center !important; gap: 4px !important;
            width: auto !important; min-width: 0 !important;
            height: 22px !important; min-height: 22px !important; max-height: 22px !important;
            margin: 8px 0 0 !important; padding: 0 8px !important; vertical-align: middle !important;
            border: 1px solid currentColor !important; border-radius: 999px !important;
            background: transparent none !important; box-shadow: none !important; text-shadow: none !important;
            appearance: none !important; color: inherit !important; cursor: pointer !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 11px !important; font-style: normal !important; font-weight: 600 !important;
            line-height: 1 !important; letter-spacing: normal !important; text-transform: none !important;
            white-space: nowrap !important;
        }
        ${BUTTON} svg { width: 10px !important; height: 10px !important; flex-shrink: 0 !important; margin: 0 !important; }
        ${BUTTON}[data-theme="dark"] { color: ${DARK_THEME_GREEN} !important; }
        ${BUTTON}:hover { background-color: rgba(128, 128, 128, 0.15) !important; }
        ${BUTTON}[data-theme="dark"]:hover { background-color: rgba(126, 231, 135, 0.15) !important; }
        ${BUTTON}:focus-visible { outline: 2px solid currentColor !important; outline-offset: 2px !important; }
        /* Extends the click target to 26px tall (WCAG 2.2 AA target size is 24px) without changing the look. */
        ${BUTTON}::before { content: "" !important; position: absolute !important; inset: -2px 0 !important; }
    `;
    document.head.append(style);

    // -------------------------------------------------------------- theming

    // Reads the first mostly-opaque background behind the button.
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

    // -------------------------------------------------------------- bootstrap

    let pending = null;
    const scheduleEnhance = () => {
        clearTimeout(pending);
        pending = setTimeout(enhance, 150);
    };

    new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true });
    // YouTube's dark theme toggles the `dark` attribute on <html>.
    new MutationObserver(scheduleEnhance).observe(document.documentElement, { attributes: true, attributeFilter: ['dark', 'class', 'style'] });
    enhance();
})();
