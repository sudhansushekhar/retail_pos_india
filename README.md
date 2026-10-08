# Retail POS India

[![Retail POS India · unit tests](https://github.com/sudhansushekhar/retail_pos_india/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/sudhansushekhar/retail_pos_india/actions/workflows/unit-tests.yml)

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
| Opening a shift | Lists every payment mode, with row checkboxes, Delete row and Duplicate row | Lists **only Cash** (the opening balance is the cash in the drawer); no checkboxes or row buttons: click the amount, type, Submit |
| Cashiers | Can open any desk page | A cashier (no manager or admin role) is sent back to the **Point of Sale** from any other desk page; opening and closing a shift and receipts stay allowed. A convenience, not a security boundary: permissions still decide what a cashier may read |
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

Or run ERPNext with this app locally in Docker: see the next section.

## Run ERPNext with this app locally (Docker)

This repository also holds a local ERPNext v16 in Docker with the app mounted, for development,
demos and the tests in [erpnext-playwright-ai-test-automation](https://github.com/sudhansushekhar/erpnext-playwright-ai-test-automation).
Needs **Docker Desktop** (running; at least 4 GB of memory) and **Node.js 20+** (for the commands
below; nothing to `npm install`).

```bash
git clone https://github.com/sudhansushekhar/retail_pos_india.git
cd retail_pos_india
npm run erp:up      # first start: downloads about 2 GB and creates the site, 5-15 minutes
curl http://localhost:8080/api/method/ping   # ready when it answers {"message":"pong"}
npm run erp:app     # install the app on the site (safe to run again: migrates)
```

Sign in at http://localhost:8080 as **Administrator / admin** (local only). The site is empty
until something fills it: the test repository's seed builds a company, GST, items, users and billing counters.

| Command | What it does |
|---|---|
| `npm run erp:up` | Start ERPNext (keeps its data), with this app mounted |
| `npm run erp:app` | Install the app on the site, or migrate it after a change |
| `npm run erp:down` | Stop ERPNext (keeps its data) |
| `npm run erp:reset` | Stop ERPNext and **delete its data** (asks you to type `RESET` first); the next `erp:up` builds a fresh site |
| `npm run erp:backup` | Full backup of the site into a dated folder (below) |
| `npm run erp:restore` | Put a backup back (asks you to type `RESTORE` first) |
| `npm run erp:logs` | Follow the site-creation and server logs |
| `npm run erp:test` | Run the app's unit tests on the site |

**Several billing counters at once:** the database runs with `innodb_snapshot_isolation=OFF` (`docker/pwd.yml`).
MariaDB 11.6+ turns it on by default, and then two billing counters saving an invoice at the same moment can fail
with `QueryDeadlockError (1020)` on the invoice-number counter. Measured: 12 saves at once, 2–3 saved
with it on, 12 of 12 with it off. Set the same on a real server.

The site's data lives in **Docker volumes**, not in this folder: deleting the folder keeps it;
`npm run erp:reset` deletes it.

| Symptom | Fix |
|---|---|
| **port 8080 is already allocated** | Something else uses 8080. Stop it, or change `"8080:8080"` in `docker/pwd.yml` |
| `ping` does not answer after 15 minutes | `npm run erp:logs`; if the site creation failed, `npm run erp:reset` then `npm run erp:up` |
| **502 Bad Gateway** after `erp:up` | `docker restart erpnext-qa-frontend-1` (`erp:up` does this for you) |
| A change does not show | Python or hooks: `docker restart erpnext-qa-backend-1`. The POS script: `docker exec erpnext-qa-backend-1 bench --site frontend clear-cache`, then **Ctrl+Shift+R** in the browser |

### Backup and restore

```bash
npm run erp:backup                         # the whole site: database, files, settings
npm run erp:restore                        # the newest backup
npm run erp:restore -- 2026-10-07_005346   # a given one
```

A backup is a dated folder in `../erpnext-backups` (or `BACKUP_DIR` in `.env`; copy `.env.example`):
the database, attached files, the site config **with its encryption key** and a `manifest.json`.
⚠ Keep it private, never in a public repository. The newest 30 are kept (`BACKUP_KEEP`). Restore
**replaces everything on the site**, then migrates and clears the cache.

**In Google Drive:** install Google Drive for desktop, then set `BACKUP_DIR=G:\My Drive\ERPNext-Backups`
in `.env`. On another laptop: set up as above, then `npm run erp:restore`.

**Every evening (Windows, optional):**

```bash
schtasks /create /tn "ERPNext backup" /sc daily /st 21:00 /tr "cmd /c cd /d D:\CareerPath\retail_pos_india && npm run erp:backup >> ..\erpnext-backups\backup.log 2>&1"
```

## How it works

| File | What it does |
|---|---|
| `retail_pos_india/hooks.py` | Loads the POS script; payment checks on every Sales Invoice; install steps |
| `retail_pos_india/public/js/cashier_guard.js` | Keeps cashiers on the Point of Sale (loaded on every desk page via `app_include_js`, served from `/assets/retail_pos_india/`) |
| `retail_pos_india/public/js/point_of_sale.js` | Number pad, card/UPI fields and when to show them, payment tiles, layout; applied to ERPNext's POS classes when the page loads |
| `retail_pos_india/payment_details.py` | The checks: last 4 = exactly 4 digits, no card numbers anywhere, UTR = 12 digits, required at Complete Order, cleared when that mode was not used |
| `retail_pos_india/setup/install.py` | Adds the four fields to Sales Invoice and to **POS Settings → Invoice Fields** (what the payment screen shows); removes them on uninstall |
| `retail_pos_india/tests/` | 15 unit tests: `npm run erp:test` (Docker), or `bench --site <site> run-tests --app retail_pos_india`; CI runs them on every pull request (`.github/workflows/unit-tests.yml`) |
| `docker/`, `scripts/`, `package.json` | The local ERPNext in Docker and its commands (above) |

No asset build is needed: ERPNext reads the POS script straight from the app. The cashier guard is
served from `/assets/retail_pos_india/`, so the app's `public` folder must be reachable there (the
Docker setup mounts it into the web server).

## Licence

MIT. See `license.txt`.
