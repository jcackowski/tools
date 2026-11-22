// ==UserScript==
// @name         Kroger Improvements
// @namespace    github.com/jcackowski/userscripts
// @version      0.2.0
// @description  Speeds up kroger.com by stopping analytics, survey and monitoring scripts, and hides sponsored ads and products.
// @author       Jay Cackowski
// @homepageURL  https://github.com/jcackowski/userscripts
// @supportURL   https://github.com/jcackowski/userscripts/issues
// @license      MIT
// @match        https://www.kroger.com/*
// @grant        none
// @run-at       document-start
// @inject-into  page
// @downloadURL  https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/kroger-improvements/kroger-improvements.user.js
// @updateURL    https://raw.githubusercontent.com/jcackowski/userscripts/main/userscripts/kroger-improvements/kroger-improvements.user.js
// ==/UserScript==

/*
 * How it works
 * - Blocks <script> tags whose URL matches BLOCKED_SCRIPTS, both ones in the
 *   page's HTML (caught by a MutationObserver before they run) and ones added
 *   later by other scripts (caught when their src is set). The browser may
 *   still download a blocked script from the HTML early, but never runs it.
 * - Only scripts are blocked. fetch, XMLHttpRequest and sendBeacon are left
 *   untouched so the page's bot protection sees unmodified browser APIs.
 * - Never block Akamai Bot Manager (www.kroger.com/<random path> scripts that
 *   define `bmak`) or iovation (iesnare.com). Kroger relies on them for
 *   sign-in and checkout.
 */

(() => {
    'use strict';

    // Set to false if uBlock Origin is installed and you'd rather leave these to it.
    const BLOCK_UBLOCK_OVERLAP = true;

    const KROGER = /^www\.kroger\.com$/;

    const BLOCKED_SCRIPTS = [
        { name: 'Adobe Launch', host: /(^|\.)adobedtm\.com$/ },
        { name: 'Qualtrics surveys', host: /(^|\.)qualtrics\.com$/ },
        { name: 'Qualtrics loader', host: KROGER, path: /^\/cdn\/qualtrics\.js$/ },
        { name: 'Akamai mPulse', host: /(^|\.)go-mpulse\.net$/ },
        // Already blocked by uBlock Origin's default lists.
        { name: 'Dynatrace', host: KROGER, path: /^\/ruxitagentjs_/, overlap: true },
        { name: 'Google Tag Manager', host: /(^|\.)googletagmanager\.com$/, overlap: true },
        { name: 'DoubleClick', host: /(^|\.)doubleclick\.net$/, overlap: true },
    ].filter(rule => BLOCK_UBLOCK_OVERLAP || !rule.overlap);

    const isBlocked = (src) => {
        let url;
        try {
            url = new URL(src, location.href);
        } catch {
            return false;
        }
        return BLOCKED_SCRIPTS.some(rule =>
            rule.host.test(url.hostname) && (!rule.path || rule.path.test(url.pathname)));
    };

    // A script with a non-JavaScript type is neither fetched nor run.
    const neuter = (script) => {
        script.type = 'javascript/blocked';
        script.remove();
    };

    // Scripts in the page's HTML.
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.tagName === 'SCRIPT' && node.src && isBlocked(node.src)) {
                    neuter(node);
                }
            }
        }
    }).observe(document, { childList: true, subtree: true });

    // Scripts created by other scripts: drop the src before the browser sees it.
    const srcProp = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        ...srcProp,
        set(value) {
            if (isBlocked(value)) {
                this.type = 'javascript/blocked';
                return;
            }
            srcProp.set.call(this, value);
        },
    });

    // mPulse's inline loader runs its script inside a blank iframe, out of
    // reach of the hooks above. The loader skips itself when this flag is set.
    if (!window.BOOMR) {
        window.BOOMR = { snippetExecuted: true };
    }

    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        if (this instanceof HTMLScriptElement && String(name).toLowerCase() === 'src' && isBlocked(value)) {
            this.type = 'javascript/blocked';
            return;
        }
        return setAttribute.call(this, name, value);
    };

    // Hidden with CSS, added before the page renders so nothing jumps.
    const HIDDEN = [
        // Banner and video ads ("Sponsored" footer).
        '.TOAContainer',
        '[data-testid^="monetization/"]',
        '[data-testid="fca-overlay"]',
        'iframe[title^="Video: Sponsored"]',
        // Sponsored products. Grid results hide their direct grid child so the
        // next product fills the slot.
        '.AutoGrid > :has([data-testid="pla-compliance-tag"])',
        'li.citrus-Carousel-item:has([data-testid="pla-compliance-tag"])',
        // Sponsored product sections on the home page. The icon-and-text
        // header is where these sections show their "Sponsored" label.
        '[data-testid="PremiumPlacementCarouselContainer"]',
        '.ProductListContainer:has([data-testid="HeaderSection"] [data-testid="icon-and-text"])',
        // "Shop More" links under search results.
        '.ShopMoreWrapper',
    ];

    const style = document.createElement('style');
    style.textContent = `${HIDDEN.join(',\n')} { display: none !important; }`;
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
})();
