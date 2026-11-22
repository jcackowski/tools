// ==UserScript==
// @name         YouTube yt-dlp Download
// @namespace    github.com/jcackowski/tools
// @version      0.1.2
// @description  Adds a download button under YouTube videos that hands the video to yt-dlp on your computer.
// @author       Jay Cackowski
// @homepageURL  https://github.com/jcackowski/tools
// @supportURL   https://github.com/jcackowski/tools/issues
// @license      MIT
// @match        https://www.youtube.com/*
// @grant        none
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
            announce(`Sent ${video.title || 'this video'} to yt-dlp. Windows notifications will show its progress.`);
            clearTimeout(resetTimer);
            resetTimer = setTimeout(() => setLabel(button, IDLE_LABEL), 4000);
        });
        return button;
    };

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
