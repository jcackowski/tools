// ==UserScript==
// @name         YouTube Declutter
// @namespace    github.com/jcackowski/tools
// @version      0.1.3
// @description  Hides unused sidebar sections, banners and shelves on YouTube, expands the subscriptions list, and opens Shorts in the normal player.
// @author       Jay Cackowski
// @homepageURL  https://github.com/jcackowski/tools
// @supportURL   https://github.com/jcackowski/tools/issues
// @license      MIT
// @icon         https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/_shared/icon.svg
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-declutter/youtube-declutter.user.js
// @updateURL    https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/youtube-declutter/youtube-declutter.user.js
// ==/UserScript==

/*
 * How it works
 * - Everything hidden is hidden with one stylesheet added before the page
 *   renders, so nothing flashes or jumps.
 * - Sidebar sections have no titles in the page, so each one is picked by a
 *   link it contains rather than by its position.
 * - YouTube only renders the rest of the subscriptions list after "Show more"
 *   is clicked, so the script clicks it once the sidebar appears. The sidebar
 *   stays in place while you browse, so this happens once per page load.
 * - Shorts are sent to /watch?v=<id> both when a Shorts page is opened
 *   directly and when YouTube switches to one without reloading.
 */

(() => {
    'use strict';

    const CONFIG = {
        // Sidebar sections.
        hideHomeAndShortsSection: true,
        hideMoreFromYouTubeSection: true, // Premium, YouTube TV, Music, Kids, Labs
        hideExploreSection: true, // Music, Movies & TV, Live, ...
        hideReportHistorySection: true,
        // Links kept in the "You" sidebar section; every other entry, including
        // "Show more", is hidden. Set to null to leave the section alone.
        youSectionKeep: ['/feed/history'],
        expandSubscriptions: true,
        hideSidebarFooter: true,

        hideFilterChips: true, // Topic chips above the home feed
        hideCreateButton: true,
        hideChannelBanner: true,
        hidePlayablesShelf: true, // Mini-game shelf in the home feed
        hideEngagementPanelScrim: true, // Dark overlay behind side panels on the watch page

        redirectShorts: true,
    };

    const VIDEO_ID = /^\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;

    const redirectShorts = () => {
        const match = location.pathname.match(VIDEO_ID);
        if (match) location.replace(`/watch?v=${match[1]}`);
    };

    if (CONFIG.redirectShorts) {
        redirectShorts();
        document.addEventListener('yt-navigate-start', redirectShorts);
    }

    const section = (href) => `ytd-guide-section-renderer:has(a[href="${href}"])`;
    const hasLink = (hrefs) => `:has(${hrefs.map(href => `a[href="${href}"]`).join(', ')})`;

    const HIDDEN = [
        CONFIG.hideHomeAndShortsSection && section('/'),
        CONFIG.hideMoreFromYouTubeSection && `ytd-guide-section-renderer${hasLink(['/premium', '/labs'])}`,
        CONFIG.hideExploreSection && section('/feed/storefront'),
        CONFIG.hideReportHistorySection && section('/reporthistory'),
        CONFIG.youSectionKeep && `${section('/feed/you')} #section-items > *` +
            (CONFIG.youSectionKeep.length ? `:not(${hasLink(CONFIG.youSectionKeep)})` : ''),
        CONFIG.hideSidebarFooter && 'ytd-guide-renderer #footer',
        CONFIG.hideFilterChips && 'ytd-feed-filter-chip-bar-renderer',
        CONFIG.hideCreateButton && 'button[aria-label="Create"]',
        CONFIG.hideChannelBanner && '#page-header-banner',
        CONFIG.hidePlayablesShelf && 'ytd-rich-section-renderer:has(ytd-mini-game-card-view-model)',
        CONFIG.hideEngagementPanelScrim && '#engagement-panel-scrim',
    ].filter(Boolean);

    const EXTRA_CSS = [
        // The frosted backdrop behind the top bar grows to cover the chip bar
        // too. With the chips hidden it would cover the top of the first row.
        CONFIG.hideFilterChips && '#frosted-glass.with-chipbar, #frosted-glass.loading-with-chipbar { height: 56px !important; }',
    ].filter(Boolean);

    if (HIDDEN.length || EXTRA_CSS.length) {
        const style = document.createElement('style');
        style.textContent = [HIDDEN.length && `${HIDDEN.join(',\n')} { display: none !important; }`, ...EXTRA_CSS].filter(Boolean).join('\n');
        const addStyle = () => (document.head || document.documentElement).appendChild(style);
        if (document.documentElement) {
            addStyle();
        } else {
            new MutationObserver((_, observer) => {
                if (document.documentElement) {
                    observer.disconnect();
                    addStyle();
                }
            }).observe(document, { childList: true });
        }
    }

    if (CONFIG.expandSubscriptions) {
        const EXPANDER = `${section('/feed/subscriptions')} ytd-guide-collapsible-entry-renderer:not([expanded]) > #expander-item`;
        const expand = () => {
            const expander = document.querySelector(EXPANDER);
            if (!expander) return false;
            expander.click();
            return true;
        };
        if (!expand()) {
            new MutationObserver((_, observer) => {
                if (expand()) observer.disconnect();
            }).observe(document, { childList: true, subtree: true });
        }
    }
})();
