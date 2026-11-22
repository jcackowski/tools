// ==UserScript==
// @name         YouTube yt-dlp Download
// @namespace    github.com/jcackowski/tools
// @version      0.7.0
// @description  Makes YouTube's Download buttons hand the video to yt-dlp on your computer.
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
 * - YouTube's own Download is taken over, in menus and in the row of buttons
 *   under a playing video. That row always gets a Download button.
 * - Each one opens a `ytdlp:youtube/<video ID>` link. Windows passes it to
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

    // ---------------------------------------------------------------- sending

    // The page can't tell whether the ytdlp: link reached the helper, so every
    // download opens a modal saying what to expect.
    const SETUP_URL = 'https://github.com/jcackowski/tools/tree/main/userscripts/youtube-yt-dlp-download#install';

    const sendToYtDlp = (video) => {
        location.href = `ytdlp:youtube/${video.id}`;
        const name = video.title ? `“${video.title}”` : 'This video';
        const message = `${name} should show up in a Windows notification within a few seconds. If it doesn't, the yt-dlp helper isn't installed on this PC yet.`;
        // If the @require'd library didn't load, screen readers still hear it.
        if (!notifications) {
            announce(message);
            return;
        }
        notifications.showModal({
            title: 'Sent to yt-dlp',
            message,
            link: { text: 'Install the helper', href: SETUP_URL },
            closeLabel: 'Got it',
            // YouTube's dark theme sets the `dark` attribute on <html>.
            theme: document.documentElement.hasAttribute('dark') ? 'dark' : 'light',
        });
    };

    // ------------------------------------------------- YouTube's own Download

    // YouTube's own Download sends the video to yt-dlp instead: the item in a
    // thumbnail's ⋮ menu, the item in the More actions (⋯) menu under a
    // playing video, and the Download button in the row next to Share (see
    // below). Older menus render the item as its own element; newer ones as a
    // generic list item recognised by its download icon, so this works in any
    // page language.
    const NATIVE_ROW_DOWNLOAD = 'ytd-watch-metadata ytd-download-button-renderer';
    const ROW_COPY_CLASS = 'yyd-row-download';
    const ROW_DOWNLOAD = `${NATIVE_ROW_DOWNLOAD}, ytd-watch-metadata .${ROW_COPY_CLASS}`;
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
        if (event.target.closest(ROW_DOWNLOAD)) {
            const video = currentVideo();
            if (!video) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            sendToYtDlp(video);
            return;
        }
        const item = downloadItemFrom(event.target);
        if (!item) {
            const button = event.target.closest('button');
            if (button && !button.closest('ytd-popup-container, tp-yt-iron-dropdown')) menuVideo = videoAround(button);
            return;
        }
        const dataId = item.data?.serviceEndpoint?.offlineVideoEndpoint?.videoId;
        const playing = currentVideo();
        const titleOf = (id) => (id === playing?.id ? playing.title : id === menuVideo?.id ? menuVideo.title : '');
        const video = VIDEO_ID.test(dataId || '') ? { id: dataId, title: titleOf(dataId) } : menuVideo;
        if (!video) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, composed: true }));
        sendToYtDlp(video);
    }, true);

    // The Download item in the ⋯ menu under a playing video has a second line
    // of YouTube's own (a Premium offer). Whatever it says, it's replaced with
    // what the item does now. Thumbnail ⋮ menus have no second line.
    const SUBTITLE = `${DOWNLOAD_ITEM} basic-content-view-model`;
    const SUBTITLE_TEXT = 'Send to yt-dlp';
    const relabelDownloadItems = () => {
        for (const subtitle of document.querySelectorAll(SUBTITLE)) {
            const text = [...subtitle.querySelectorAll('*')].find((node) => !node.children.length) || subtitle;
            if (text.textContent !== SUBTITLE_TEXT) text.textContent = SUBTITLE_TEXT;
        }
    };

    // ---------------------------------------------- Download next to Share

    // The row of buttons under a playing video always gets a Download button.
    // If YouTube rendered its own, which it sometimes keeps hidden (signed
    // out, for example), that one is unhidden. Otherwise a Download button is
    // built with the classes of one of the row's own buttons (Share, Save...),
    // so it takes YouTube's styling, size and theme, and gets its own icon.
    // Those buttons are styled the moment the row appears, while their icons
    // are drawn later, so nothing here waits on an icon. The button has none
    // of YouTube's code behind it; clicks on it are handled above like any
    // other Download.
    //
    // The button goes right after #flexible-item-buttons (after Save, before
    // ⋯), where YouTube's own row Download sits. Inside that container YouTube
    // redraws its children and drops it, and the extra width can make it move
    // Share and Save into the ⋯ menu.
    const ROW_ANCHOR = 'ytd-watch-metadata #actions ytd-menu-renderer #flexible-item-buttons';
    // Share, Save and the like. Like/Dislike and ⋯ are built differently.
    const ROW_BUTTON = 'ytd-watch-metadata #actions yt-button-view-model button';
    const DOWNLOAD_ICON_PATH = 'M12 2a1 1 0 00-1 1v11.586l-4.293-4.293a1 1 0 10-1.414 1.414L12 18.414l6.707-6.707a1 1 0 10-1.414-1.414L13 14.586V3a1 1 0 00-1-1Zm7 18H5a1 1 0 000 2h14a1 1 0 000-2Z';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Built with DOM calls: YouTube enforces Trusted Types, which blocks innerHTML.
    const createRowButton = (template) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = template.className;
        button.setAttribute('aria-label', 'Download');
        button.title = 'Download';

        const icon = document.createElement('div');
        icon.setAttribute('aria-hidden', 'true');
        icon.className = template.querySelector('div[class*="ButtonShapeNextIcon"]')?.className || '';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.cssText = 'display: block; fill: currentcolor; pointer-events: none;';
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', DOWNLOAD_ICON_PATH);
        svg.append(path);
        icon.append(svg);
        button.append(icon);

        const wrapper = document.createElement('div');
        wrapper.className = ROW_COPY_CLASS;
        wrapper.append(button);
        return wrapper;
    };

    // Prefers an icon-only button, like the one being built.
    const findTemplate = () => {
        const buttons = [...document.querySelectorAll(ROW_BUTTON)];
        return buttons.find((button) => button.className.includes('IconButton')) || buttons[0] || null;
    };

    const enhance = () => {
        if (!currentVideo()) return;
        const copy = document.querySelector(`.${ROW_COPY_CLASS}`);

        const native = document.querySelector(NATIVE_ROW_DOWNLOAD);
        if (native) {
            copy?.remove();
            if (native.hasAttribute('is-hidden')) native.removeAttribute('is-hidden');
            return;
        }

        const anchor = document.querySelector(ROW_ANCHOR);
        if (!anchor || copy?.previousElementSibling === anchor) return;
        const template = findTemplate();
        if (!template) return;
        copy?.remove();
        anchor.after(createRowButton(template));
    };

    // ----------------------------------------------------------------- styles

    const style = document.createElement('style');
    style.textContent = `
        .yyd-sr-only {
            position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
            overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
        }
        /* Same spacing YouTube gives the buttons in the row. */
        .${ROW_COPY_CLASS} { display: block !important; flex-shrink: 0 !important; margin: 0 0 0 8px !important; }
    `;
    document.head.append(style);

    // -------------------------------------------------------------- bootstrap

    // Both run on every page change, with no delay, so the Download button
    // appears with the row and YouTube's menu wording never shows. Each run is
    // a few element lookups once everything is in place. `is-hidden` is
    // watched so YouTube's own row Download stays unhidden.
    new MutationObserver(() => {
        relabelDownloadItems();
        enhance();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['is-hidden'] });
    enhance();
})();
