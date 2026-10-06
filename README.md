# Retail POS India

A Frappe app that adapts ERPNext v16's **Point of Sale** for Indian retail: whole-rupee number pad,
UPI and card (incl. RuPay) payment details, a cash-only opening float, and a layout that fits laptop screens.

| Change | ERPNext on its own | With Retail POS India |
|---|---|---|
| Number pad | Enters paise: **5 0 0 → 5.00** | Whole amounts: **5 0 0 → 500.00**, and a **.** key: **1 2 . 5 → 12.50** (replaces the +/- key); tapping a payment mode starts a new amount |
| Card details | Not recorded | **Card Type** (incl. RuPay), **Last 4 Digits**, **Approval Code**, shown **only for a card payment** |
| UPI details | Not recorded | **UPI Transaction ID** (12-digit UTR), shown **only for a UPI payment** |
| At Complete Order | — | A card payment needs its last 4 digits, a UPI payment its UTR; details of a mode not used are cleared |
| Cart width | 4 of 10 columns | **5 of 10** columns |
| Payment tiles | A tap on a tile's amount was ignored; a quick tap could be undone by ERPNext's own default-mode selection; tapping the selected tile switched it off | A tap anywhere on the tile counts, and is never undone; tapping the selected tile keeps it and starts a new amount |
| Opening the till | Lists every payment mode, with row checkboxes, Delete row and Duplicate row | Lists **only Cash** (the opening balance is the cash in the drawer); no checkboxes or row buttons: click the amount, type, Submit |
| Cashiers | Can open any desk page | A cashier (no manager or admin role) is sent back to the **Point of Sale** from any other desk page; opening and closing the till and receipts stay allowed. A convenience, not a security boundary: permissions still decide what a cashier may read |
| Short screens | — | The fields sit under the payment buttons; the payment list makes room, so the number pad, totals and Complete Order stay visible (checked at 1440×900, 1366×768, 1280×720) |

A payment mode counts as a **card** if its name contains "card" (Debit Card, Credit Card) and as
**UPI** if it contains the word "UPI": the same rule on the screen and on the server.

**Card data is kept safe on purpose.** The card machine handles the card. The POS keeps only the
type, the last 4 digits and the approval code. A full card number, expiry date or CVV is never
stored (PCI DSS), and the app refuses anything that looks like a card number.

## Install

On a bench:

```bash
bench get-app <this repository's URL>
bench --site <site> install-app retail_pos_india
```

With the Docker setup of [`erpnext-playwright-ai-test-automation`](../erpnext-playwright-ai-test-automation):
clone this repository next to it (`CareerPath/retail_pos_india` beside
`CareerPath/erpnext-playwright-ai-test-automation`); its `npm run erp:up` mounts the app and
`npm run erp:apps` installs it.

## How it works

| File | What it does |
|---|---|
| `retail_pos_india/hooks.py` | Loads the POS script; payment checks on every Sales Invoice; install steps |
| `retail_pos_india/public/js/cashier_guard.js` | Keeps cashiers on the Point of Sale (loaded on every desk page via `app_include_js`, served from `/assets/retail_pos_india/`) |
| `retail_pos_india/public/js/point_of_sale.js` | Number pad, card/UPI fields and when to show them, payment tiles, layout; applied to ERPNext's POS classes when the page loads |
| `retail_pos_india/payment_details.py` | The checks: last 4 = exactly 4 digits, no card numbers anywhere, UTR = 12 digits, required at Complete Order, cleared when that mode was not used |
| `retail_pos_india/setup/install.py` | Adds the four fields to Sales Invoice and to **POS Settings → Invoice Fields** (what the payment screen shows); removes them on uninstall |
| `retail_pos_india/tests/` | 15 unit tests: `bench --site <site> run-tests --app retail_pos_india` |

No asset build is needed: ERPNext reads the POS script straight from the app. The cashier guard is
served from `/assets/retail_pos_india/`, so the app's `public` folder must be reachable there (the
Docker setup mounts it into the web server).

## Licence

MIT. See `license.txt`.
