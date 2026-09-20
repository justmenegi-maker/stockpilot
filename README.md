# StockPilot — Inventory MVP

A zero-dependency, single-file inventory management app with low-stock alerts, a built-in chat assistant, multi-store support, login, and optional cloud sync (Supabase).

## Run it

Open `index.html` in any browser — that's it. No build, no install, no server needed.

(Or serve it: `python -m http.server 5179` then visit http://127.0.0.1:5179/)

## Install as an app (PWA)

StockPilot is a full Progressive Web App — installable, offline-capable, with its own window and icon:

- **Install:** Chrome/Edge → the ⊕ install icon in the address bar; Android → "Add to Home screen"; iOS Safari → Share → "Add to Home Screen". Once installed it opens in its own window, without browser UI.
- **Offline:** a service worker (`sw.js`) caches the app shell (page, manifest, icons). Navigations are network-first so updates arrive as soon as they're deployed, then the cached shell keeps the app open with no connection. Your data itself is already stored locally (and synced to Supabase when signed in).
- **Privacy:** the service worker never intercepts or caches cross-origin traffic — Supabase API calls always hit the network and no auth/data responses are stored in the SW cache.
- **Icons:** regenerate with `npm run icons` (`scripts/gen-icons.js`, zero dependencies, deterministic output).

## Features

- **Polished sign-in screen** — Sign in / Create account tabs, show-password toggle, friendly error messages (wrong password, unconfirmed email, rate limits), a loading state on the submit button, and a collapsible **Supabase connection (advanced)** panel with a **Test connection** button that checks reachability, the auth service, and all four required tables
- **Account settings (👤 Account in the header, when signed in)** — three tabs:
  - **Profile** — edit your display name and password (email shown read-only); changes are saved to your Supabase auth user and follow you to every device
  - **☁️ Supabase** — live connection status (reachable / auth / tables), switch to a different project (URL + key) with a validated **Save & reconnect**, **Test connection**, or return to the pre-wired default project
  - **Danger zone** — log out on this device, or permanently delete your account (stores, items, sales and chats cascade-delete with it)
- **Inventory table** — add / edit / delete items with description, ±1 quick adjust, search, filter, sort
- **Stats dashboard** — total items, units in stock, stock value, low/out count, units sold today, store-use units today
- **Sold Today with edit & delete** — every sale and store-use of today is listed under the stats, tagged with custom prices. Click **✏️ Edit sales** (or the Sold Today card) to fix a mis-clicked quantity or price, or **Delete (restock)** a row to return its units to stock — reports update instantly
- **Currency selector** — INR, USD, EUR, PKR, and more; persisted, applies everywhere instantly
- **Sales log** — every sale (chat "sold") and store-use (chat "store use …" / "used … for store") is recorded with date & price. The ±1 adjust buttons are stock corrections only — they never touch the sales log
- **Detailed reports** — daily / weekly (7d) / monthly (30d) plus custom date ranges. Every report shows: each item sold with its quantity and revenue, **custom sales listed separately with the exact price of every row**, and **store use by item name** (what the shop itself consumed, in what quantity)
- **Low-stock alerts** — per-item alert threshold; toasts fire when stock transitions to low/out; bell badge in the header
- **Chat assistant** (💬 button, or press `/`) — natural language commands:

| Say | Does |
|---|---|
| `add 10 pens` | Creates "Pens" with 10 units (or adds 10 to existing) |
| `sold 3 pens` | Removes 3 from stock, logs the sale, warns if it goes low/out |
| `custom sale vivo y18 @ 1600` | Sells 1 unit at a custom price (list price ignored). Add a qty: `custom sale 2 vivo y18 @ 1600` |
| `store use 2 pens` | Takes 2 from stock for shop/display use — logged as store use, NOT a sale |
| `used 2 pens for store` | Takes stock for shop/display use — logged as store use, NOT a sale (alias: `store use 2 pens`) |
| `daily report` / `weekly report` / `monthly report` | **Detailed report**: every item sold (qty + revenue), custom sales separately with prices, store use by item name |
| `report from 2026-09-01 to 2026-09-07` | Same detailed report for any custom date range |
| `what sold today?` / `top items this week` / `sales` | Per-item sales list for the period |
| `desc pens` | Shows an item's stock, price, category and description |
| `set desc pens: counter display` | Sets the item's description |
| `restock 20 pens` | Adds stock |
| `set pens to 25` | Sets exact quantity |
| `pens +5` | Quick increment |
| `what's low?` | Lists low & out-of-stock items |
| `show inventory` | Full summary |
| `how many pens do we have?` | Reports stock for one item |
| `add item hammer, qty 20, price 9.5` | Creates item with details |
| `delete pens` | Removes the item |
| `clean old data` | Deletes sales older than 6 months (asks to confirm; also runs automatically daily) |
| `help` | Full command list |

- **Auto data cleanup** — sales records older than 6 months are deleted automatically (once a day, per browser) from the active store, other stores' local caches, and the cloud, keeping storage lean. Current stock and items are never touched. Also on demand via the chat: `clean old data`
- **Persistence** — data saved in browser localStorage (per browser/profile), and to the cloud when signed in
- **Multi-store** — 🏬 **Stores** opens an all-stores overview: one card per store with items, units, stock value, low/out alerts, units sold today, and today's revenue. Create and delete stores; each store has **its own page, stock, sales log, reports, currency, and its own assistant conversation** — so each store's chat keeps its own context.
- **Cloud sync (optional)** — see **Cloud setup** below; offline stores carry over automatically on first sign-in
- **Dark / light mode** — follows system preference, toggle in header
- **Installable PWA** — standalone window, app icon, and an offline-cached app shell (see *Install as an app*)
- **Keyboard shortcuts** — `N` = add item, `/` = open assistant

## Cloud setup (multi-store, login, cloud save) — ~2 minutes, once

StockPilot is **pre-wired to its Supabase project** — the URL (`https://xfeeggctabymhgepyhmo.supabase.co`) and the publishable key are already in the app:

1. In the Supabase dashboard open **SQL Editor → New query**, paste the whole contents of `supabase-setup.sql` (this folder) and click **Run**. This creates the tables with row-level security, so every account can only ever see its own data. *(One time — the app can't create tables itself.)*
2. Open StockPilot and **Sign up** with your email and a password — no keys to paste. (You can point the app at a different project later from **👤 Account → ☁️ Supabase**.)
3. During sign-up you name your first store. After that a **store dropdown** appears in the header — pick it to switch stores; every store keeps its own items, sales, reports, and currency.

To point StockPilot at a *different* Supabase project, run `supabase-setup.sql` there, then paste that project's URL and publishable/anon key in the sign-in screen and click **Save cloud settings** — explicit values always override the pre-wired ones.

Notes:

- Your existing local inventory is **imported automatically** into your first cloud store on first sign-in (if the store is empty).
- All changes sync to the cloud as you make them — items, sales, **and the assistant conversation**, so your chat history follows you to any device you sign in on — and are also cached in this browser, so the app keeps working offline and catches up on the next change.
- **Log out** is in the header; **☁️ Sign in** brings the screen back. "Continue without cloud" keeps everything local on this browser only.
- Signing in on **another device or browser** with the same email shows the same stores and data.
- To add a store beyond the first: click **＋ Store** in the header. Each store starts empty with its own items, sales, reports, and currency — the database supports unlimited stores per account.

## Tests

Run from the project root (Node 18+; no dependencies to install):

- `npm test` (or `node scripts/test-regression.js`) — full regression harness: runs the app's inline script in a sandboxed DOM/localStorage and exercises the chat engine, detailed reports, custom sales, store use, edit-sale, auto-cleanup, store switching, theme, the login screen, the account dialog, and the Supabase connection test (102 checks).
- `npm run test:e2e` (or `node scripts/e2e-cloud-test.js [--keep]`) — live end-to-end cloud test against the wired Supabase project: signup → store → item → sale → verify persisted rows → cleanup. Add `--keep` to leave the test data in place. *Note: while the project's "Confirm email" setting is ON, signup returns no session and the script stops with instructions; the app itself handles this with a check-your-inbox flow.*

## Notes

- Without cloud configured, the app is fully usable offline on one store (previous behavior).
- Prices are in INR by default; each store's currency selector (or the chat/set default) changes it per store.
