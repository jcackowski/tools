/*
 * notifications.js 1.0.0
 * Shared messages for the userscripts in github.com/jcackowski/tools. MIT license.
 *
 * Load it with @require pointing at a tagged release, for example
 *   https://raw.githubusercontent.com/jcackowski/tools/notifications-v1.0.0/userscripts/_shared/notifications.js#sha256=<hex>
 * then take a reference straight away, before another script on the page can
 * replace the global with a different version:
 *   const notifications = globalThis.jcNotifications;
 *
 * notifications.showModal({ title, message, link, closeLabel, theme })
 *   Opens a native <dialog> as a modal. Escape, the close button or a click
 *   outside it closes it, and it is removed from the page once closed.
 *   - title       heading text (required)
 *   - message     body text (required)
 *   - link        optional { text, href }; opens in a new tab
 *   - closeLabel  close button text, default 'Close'
 *   - theme       'light' (default) or 'dark'
 *   Returns the <dialog> element.
 *
 * Markup is built with DOM calls because some sites (YouTube) enforce Trusted
 * Types, which blocks innerHTML.
 */

(() => {
    'use strict';

    const VERSION = '1.0.0';
    const PREFIX = 'jcn';
    const DIALOG = `dialog.${PREFIX}-modal.${PREFIX}-modal:not(#${PREFIX}-a):not(#${PREFIX}-b)`;
    const STYLE_ID = `${PREFIX}-style-${VERSION}`;

    // The :not(#id) parts add ID-level specificity, so page styles can't
    // outrank these !important declarations without heavier selectors.
    const CSS = `
        ${DIALOG} {
            --jcn-fg: #0f0f0f; --jcn-bg: #ffffff; --jcn-accent: #0f0f0f; --jcn-border: rgba(0, 0, 0, 0.2);
            box-sizing: border-box !important; width: min(420px, calc(100vw - 32px)) !important; max-width: none !important;
            margin: auto !important; padding: 20px 22px 18px !important;
            border: 1px solid var(--jcn-border) !important; border-radius: 12px !important;
            background: var(--jcn-bg) !important; color: var(--jcn-fg) !important;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35) !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            font-size: 14px !important; font-weight: 400 !important; line-height: 1.5 !important;
            text-align: left !important;
        }
        ${DIALOG}[data-theme="dark"] {
            --jcn-fg: #f1f1f1; --jcn-bg: #212121; --jcn-accent: #7ee787; --jcn-border: rgba(255, 255, 255, 0.2);
        }
        ${DIALOG}::backdrop { background: rgba(0, 0, 0, 0.5) !important; }
        ${DIALOG} h2 {
            margin: 0 0 8px !important; padding: 0 !important; color: inherit !important;
            font: inherit !important; font-size: 16px !important; font-weight: 700 !important; line-height: 1.3 !important;
        }
        ${DIALOG} p { margin: 0 !important; padding: 0 !important; color: inherit !important; font: inherit !important; }
        ${DIALOG} a { color: var(--jcn-accent) !important; font-weight: 600 !important; text-decoration: underline !important; }
        ${DIALOG} .${PREFIX}-actions { display: flex !important; justify-content: flex-end !important; margin: 16px 0 0 !important; }
        ${DIALOG} button {
            box-sizing: border-box !important; min-height: 32px !important; margin: 0 !important; padding: 0 16px !important;
            border: 1px solid var(--jcn-accent) !important; border-radius: 999px !important;
            background: transparent none !important; color: var(--jcn-accent) !important; cursor: pointer !important;
            font: inherit !important; font-size: 13px !important; font-weight: 600 !important; line-height: 1 !important;
        }
        ${DIALOG} button:hover { background-color: rgba(128, 128, 128, 0.15) !important; }
        ${DIALOG} a:focus-visible, ${DIALOG} button:focus-visible {
            outline: 2px solid var(--jcn-accent) !important; outline-offset: 2px !important;
        }
    `;

    const addStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).append(style);
    };

    // Page keyboard shortcuts (YouTube's k, j, l, f...) listen above the
    // dialog, so key events from inside an open modal are stopped on their way
    // down, at window capture. Default actions still run: Escape still closes
    // the dialog, Tab still moves focus, Space and Enter still press buttons.
    let keysGuarded = false;
    const guardKeys = () => {
        if (keysGuarded) return;
        keysGuarded = true;
        for (const type of ['keydown', 'keyup', 'keypress']) {
            window.addEventListener(type, (event) => {
                if (event.target instanceof Element && event.target.closest(`dialog.${PREFIX}-modal[open]`)) {
                    event.stopImmediatePropagation();
                }
            }, true);
        }
    };

    let count = 0;
    const showModal = ({ title, message, link, closeLabel = 'Close', theme = 'light' }) => {
        addStyle();
        guardKeys();
        const id = `${PREFIX}-${++count}`;

        const dialog = document.createElement('dialog');
        dialog.className = `${PREFIX}-modal`;
        dialog.dataset.theme = theme === 'dark' ? 'dark' : 'light';
        dialog.setAttribute('aria-labelledby', `${id}-title`);
        dialog.setAttribute('aria-describedby', `${id}-message`);

        const heading = document.createElement('h2');
        heading.id = `${id}-title`;
        heading.textContent = title;

        const body = document.createElement('p');
        body.id = `${id}-message`;
        body.textContent = message;
        if (link) {
            const anchor = document.createElement('a');
            anchor.href = link.href;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.textContent = link.text;
            body.append(' ', anchor);
        }

        const actions = document.createElement('div');
        actions.className = `${PREFIX}-actions`;
        const close = document.createElement('button');
        close.type = 'button';
        close.autofocus = true;
        close.textContent = closeLabel;
        close.addEventListener('click', () => dialog.close());
        actions.append(close);

        dialog.append(heading, body, actions);
        // Clicks on the backdrop land on the <dialog> itself, outside its box.
        dialog.addEventListener('click', (event) => {
            if (event.target !== dialog) return;
            const box = dialog.getBoundingClientRect();
            const inside = event.clientX >= box.left && event.clientX <= box.right &&
                           event.clientY >= box.top && event.clientY <= box.bottom;
            if (!inside) dialog.close();
        });
        dialog.addEventListener('click', (event) => event.stopPropagation());
        dialog.addEventListener('close', () => dialog.remove());

        document.body.append(dialog);
        dialog.showModal();
        return dialog;
    };

    globalThis.jcNotifications = Object.freeze({ version: VERSION, showModal });
})();
