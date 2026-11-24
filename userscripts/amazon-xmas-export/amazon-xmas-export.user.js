// ==UserScript==
// @name         Amazon Xmas Export
// @namespace    github.com/jcackowski/tools
// @version      0.2.0
// @description  Copies chosen items from an Amazon order as rows to paste into a Christmas shopping Google Sheet.
// @author       Jay Cackowski
// @homepageURL  https://github.com/jcackowski/tools
// @supportURL   https://github.com/jcackowski/tools/issues
// @license      MIT
// @icon         https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/_shared/icon.svg
// @match        https://www.amazon.com/gp/css/summary/print.html*
// @match        https://www.amazon.com/your-orders/order-details*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/amazon-xmas-export/amazon-xmas-export.user.js
// @updateURL    https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/amazon-xmas-export/amazon-xmas-export.user.js
// ==/UserScript==

/*
 * How it works
 * - Runs on an order's invoice page and its order-details page. Both mark
 *   their parts with data-component attributes (itemTitle, unitPrice,
 *   chargeSummary), which is what the script reads.
 * - Each item gets a checkbox and an editable short name. The floating panel
 *   takes the recipient's name (required) and copies the checked items as
 *   tab-separated rows in the sheet's column order: Person, Gift, Gift Link,
 *   Price (+ Tax). Rows stop there, so pasting leaves Wrapped untouched.
 * - Names that have been copied with are kept in this browser's
 *   localStorage and suggested in the name box.
 * - Price (+ Tax) is the unit price times (1 + the order's tax rate), where
 *   the rate is the order's tax divided by its total before tax.
 */

(() => {
    'use strict';

    const PREFIX = 'jcax';
    const ITEM_TITLE = '[data-component="itemTitle"]';
    const UNIT_PRICE = '[data-component="unitPrice"] .a-offscreen';
    const CHARGES = '[data-component="chargeSummary"]';

    // ------------------------------------------------------------- reading

    const money = (text) => {
        const value = parseFloat(String(text ?? '').replace(/[^0-9.-]/g, ''));
        return Number.isFinite(value) ? value : null;
    };

    // The summary renders each label and its amount on separate lines, e.g.
    // "Estimated tax to be collected:" then "$3.87".
    const chargeAmount = (matches) => {
        const summary = document.querySelector(CHARGES);
        if (!summary) return null;
        const lines = summary.innerText.split('\n').map((line) => line.trim()).filter(Boolean);
        const index = lines.findIndex(matches);
        if (index < 0) return null;
        return money(lines[index].split(':')[1]) ?? money(lines[index + 1]);
    };

    // null when the summary can't be read, so the panel can say prices are pre-tax.
    const taxRate = () => {
        const beforeTax = chargeAmount((line) => /before tax/i.test(line));
        const tax = chargeAmount((line) => /tax/i.test(line) && !/before tax/i.test(line));
        if (beforeTax === null || tax === null || beforeTax <= 0) return null;
        return tax / beforeTax;
    };

    // Amazon titles run long ("Lifewit 45L Clear Clothes Storage Bags,Plastic
    // Foldable ... | 4 Pack ..."), so the suggested name stops at the first
    // comma, pipe, semicolon or spaced dash. Colons are kept ("Book: Title").
    const shortName = (title) => {
        const cut = title.split(/\s*[,|;，｜]\s*|\s+[-–—]\s+/)[0].trim() || title.trim();
        return cut.length > 60 ? cut.slice(0, 60).replace(/\s+\S*$/, '') : cut;
    };

    const productLink = (href) => {
        const asin = String(href || '').match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        return asin ? `https://www.amazon.com/dp/${asin[1]}` : '';
    };

    // ------------------------------------------------------------- styling

    const CSS = `
        .${PREFIX}-item {
            display: flex; align-items: center; gap: 8px; margin: 6px 0 4px;
            font: 13px/1.4 "Amazon Ember", Arial, sans-serif; color: #0f1111;
        }
        .${PREFIX}-item input[type="checkbox"] { width: 18px; height: 18px; margin: 0; accent-color: #188038; }
        .${PREFIX}-name {
            width: min(48ch, 100%); padding: 4px 8px; border: 1px solid #888c8c; border-radius: 4px;
            font: inherit; color: inherit; background: #fff;
        }
        .${PREFIX}-item.${PREFIX}-off .${PREFIX}-name { color: #6f7373; text-decoration: line-through; }
        .${PREFIX}-panel {
            position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
            display: flex; flex-direction: column; gap: 6px; max-width: min(320px, calc(100vw - 32px));
            padding: 12px 14px; border: 1px solid #d5d9d9; border-radius: 10px;
            background: #fff; box-shadow: 0 4px 16px rgba(15, 17, 17, 0.18);
            font: 13px/1.4 "Amazon Ember", Arial, sans-serif; color: #0f1111;
        }
        .${PREFIX}-copy {
            padding: 8px 14px; border: 0; border-radius: 8px; cursor: pointer;
            background: #188038; color: #fff; font: 600 14px/1.2 "Amazon Ember", Arial, sans-serif;
        }
        .${PREFIX}-copy:hover { background: #137333; }
        .${PREFIX}-copy:disabled { background: #c4c7c5; color: #444746; cursor: default; }
        .${PREFIX}-note { margin: 0; color: #565959; }
        .${PREFIX}-person-label { font-weight: 600; }
        .${PREFIX}-person {
            padding: 6px 8px; border: 1px solid #888c8c; border-radius: 4px;
            font: inherit; color: inherit; background: #fff;
        }
        .${PREFIX}-item input:focus-visible, .${PREFIX}-copy:focus-visible, .${PREFIX}-person:focus-visible {
            outline: 2px solid #188038; outline-offset: 2px;
        }
        @media print { .${PREFIX}-item, .${PREFIX}-panel { display: none !important; } }
    `;

    const addStyle = () => {
        if (document.getElementById(`${PREFIX}-style`)) return;
        const style = document.createElement('style');
        style.id = `${PREFIX}-style`;
        style.textContent = CSS;
        document.head.append(style);
    };

    // ------------------------------------------------------------ the panel

    let panel = null;
    let personInput = null;
    let suggestions = null;
    let copyButton = null;
    let note = null;
    let status = null;

    // Recently used recipient names, newest first. Storage can be blocked
    // (private windows, cleared site data), so it's best-effort.
    const RECIPIENTS_KEY = `${PREFIX}-recipients`;
    const MAX_RECIPIENTS = 50;

    const loadRecipients = () => {
        try {
            const names = JSON.parse(localStorage.getItem(RECIPIENTS_KEY) || '[]');
            return Array.isArray(names) ? names.filter((name) => typeof name === 'string') : [];
        } catch {
            return [];
        }
    };

    const rememberRecipient = (person) => {
        const names = [person, ...loadRecipients().filter((name) => name !== person)].slice(0, MAX_RECIPIENTS);
        try {
            localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(names));
        } catch {
            return;
        }
        fillSuggestions(names);
    };

    const fillSuggestions = (names) => {
        suggestions.replaceChildren(...names.map((name) => {
            const option = document.createElement('option');
            option.value = name;
            return option;
        }));
    };

    const recipient = () => clean(personInput?.value ?? '');

    const checkedItems = () => [...document.querySelectorAll(`.${PREFIX}-item`)]
        .filter((item) => item.querySelector('input[type="checkbox"]').checked);

    const rowsLabel = (count) => `Copy ${count} ${count === 1 ? 'row' : 'rows'}`;

    const describeTax = () => {
        const rate = taxRate();
        return rate === null
            ? 'Tax not found on this page, so prices are before tax.'
            : `Prices include this order's ${(rate * 100).toFixed(1)}% tax. Paste into column A.`;
    };

    const refreshPanel = () => {
        if (!panel) return;
        const count = checkedItems().length;
        const hasPerson = recipient() !== '';
        copyButton.textContent = !count ? 'No items checked' : hasPerson ? rowsLabel(count) : 'Enter a name to copy';
        copyButton.disabled = count === 0 || !hasPerson;
        note.textContent = describeTax();
    };

    const clean = (text) => String(text).replace(/[\t\r\n]+/g, ' ').trim();

    const buildRows = (person) => {
        const rate = taxRate() ?? 0;
        return checkedItems().map((item) => {
            const unit = Number(item.dataset.unitPrice);
            const price = Number.isFinite(unit) ? `$${(Math.round(unit * (1 + rate) * 100) / 100).toFixed(2)}` : '';
            const name = item.querySelector(`.${PREFIX}-name`).value;
            return [person, clean(name), item.dataset.link, price].join('\t');
        });
    };

    const copyRows = async () => {
        const person = recipient();
        if (!person) return;
        const rows = buildRows(person);
        if (!rows.length) return;
        try {
            await navigator.clipboard.writeText(rows.join('\n'));
        } catch (error) {
            status.textContent = `Couldn't copy (${error.message}). Click the page and try again.`;
            return;
        }
        rememberRecipient(person);
        const label = rows.length === 1 ? '1 row' : `${rows.length} rows`;
        copyButton.textContent = `Copied ${label}`;
        status.textContent = `Copied ${label} for ${person} to the clipboard.`;
        setTimeout(refreshPanel, 2000);
    };

    const createPanel = () => {
        panel = document.createElement('div');
        panel.className = `${PREFIX}-panel`;
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Copy to Christmas sheet');

        const personLabel = document.createElement('label');
        personLabel.className = `${PREFIX}-person-label`;
        personLabel.htmlFor = `${PREFIX}-person`;
        personLabel.textContent = 'Gift for';

        suggestions = document.createElement('datalist');
        suggestions.id = `${PREFIX}-recipients`;
        fillSuggestions(loadRecipients());

        personInput = document.createElement('input');
        personInput.type = 'text';
        personInput.id = `${PREFIX}-person`;
        personInput.className = `${PREFIX}-person`;
        personInput.required = true;
        personInput.autocomplete = 'off';
        personInput.placeholder = 'Recipient name';
        personInput.setAttribute('list', suggestions.id);
        personInput.addEventListener('input', refreshPanel);
        personInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !copyButton.disabled) copyRows();
        });

        copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = `${PREFIX}-copy`;
        copyButton.addEventListener('click', copyRows);

        note = document.createElement('p');
        note.className = `${PREFIX}-note`;

        status = document.createElement('p');
        status.className = `${PREFIX}-note`;
        status.setAttribute('role', 'status');

        panel.append(personLabel, personInput, suggestions, copyButton, note, status);
        document.body.append(panel);
    };

    // -------------------------------------------------------- item controls

    const addControls = (title) => {
        let container = title.parentElement;
        while (container && container !== document.body && !container.querySelector(UNIT_PRICE)) {
            container = container.parentElement;
        }
        if (!container || container === document.body) return false;

        const text = title.innerText.trim();
        const item = document.createElement('div');
        item.className = `${PREFIX}-item`;
        item.dataset.unitPrice = String(money(container.querySelector(UNIT_PRICE).textContent));
        item.dataset.link = productLink(title.querySelector('a[href]')?.getAttribute('href'));

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.setAttribute('aria-label', `Include ${text}`);

        const name = document.createElement('input');
        name.type = 'text';
        name.className = `${PREFIX}-name`;
        name.value = shortName(text);
        name.setAttribute('aria-label', 'Gift name for the sheet');

        checkbox.addEventListener('change', () => {
            item.classList.toggle(`${PREFIX}-off`, !checkbox.checked);
            refreshPanel();
        });

        item.append(checkbox, name);
        title.after(item);
        return true;
    };

    // The order-details page can render items after the script starts, so new
    // titles are picked up as they appear. Each title is handled once.
    const scan = () => {
        let added = false;
        for (const title of document.querySelectorAll(`${ITEM_TITLE}:not([data-${PREFIX}])`)) {
            title.setAttribute(`data-${PREFIX}`, '');
            added = addControls(title) || added;
        }
        if (!added) return;
        addStyle();
        if (!panel) createPanel();
        refreshPanel();
    };

    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            scan();
        });
    }).observe(document.documentElement, { childList: true, subtree: true });

    scan();
})();
