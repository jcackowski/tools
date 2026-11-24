# Amazon Xmas Export

Copies items from an Amazon order as rows you can paste straight into a Christmas shopping Google Sheet with the columns **Person, Gift, Gift Link, Price (+ Tax), Wrapped**.

## Install

Open [amazon-xmas-export.user.js](https://raw.githubusercontent.com/jcackowski/tools/main/userscripts/amazon-xmas-export/amazon-xmas-export.user.js) with [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/) installed.

## Use

1. Open an order's invoice (**View invoice**) or its **View order details** page on amazon.com.
2. Each item gets a checkbox and a short name. Uncheck anything that isn't for this person, and edit the names the way you want them in the sheet.
3. In the panel at the bottom right, type who the gifts are for in **Gift for**. Copy stays off until there's a name. Names you've used before are suggested as you type.
4. Click **Copy N rows**, or press Enter in the name box.
5. In the sheet, click the **Person** cell of the first empty row and paste.

For an order with gifts for several people, check one person's items, copy and paste, then change the checks and the name and copy again.

Each row comes in as:

| Person | Gift | Gift Link | Price (+ Tax) |
|---|---|---|---|
| Ron Reynolds | Lifewit 45L Clear Clothes Storage Bags | `https://www.amazon.com/dp/B0CGTG9S1F` | $19.12 |

Rows stop at the price, so pasting leaves the **Wrapped** column as it was.

Recent names are stored in this browser's local storage for amazon.com. Clearing Amazon's site data clears them.

## How the price is worked out

Price (+ Tax) is the item's unit price plus the order's tax rate. The rate is the order's tax divided by its total before tax, both read from the order summary, so it comes out at the local rate (6% in Michigan) and is right for orders with no tax too. If the page has no tax line, the panel says so and the prices are copied before tax.

## Limits

- Items bought in a quantity above 1 haven't been tested yet. The unit price is copied as is.
- The checkboxes and panel are hidden when the invoice is printed.
