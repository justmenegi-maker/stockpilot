# StockPilot — Inventory MVP

A zero-dependency, single-file inventory management app with low-stock alerts, a built-in chat assistant, multi-store support, login, and optional cloud sync (Supabase).

## Run it

Open `index.html` in any browser — that's it. No build, no install, no server needed.

(Or serve it: `python -m http.server 5179` then visit http://127.0.0.1:5179/)

## Features

- **Inventory table** — add / edit / delete items with description, ±1 quick adjust, search, filter, sort
- **Stats dashboard** — total items, units in stock, stock value, low/out count, units sold today
- **Currency selector** — INR, USD, EUR, PKR, and more; persisted, applies everywhere instantly
- **Sales log** — every sale (chat "sold", −1 button) and store-use (chat "used … for store") is recorded with date & price
- **Reports** — daily / weekly (7d) / monthly (30d) plus custom date ranges: units sold, revenue, store-use units, top items
- **Low-stock alerts** — per-item alert threshold; toasts fire when stock transitions to low/out; bell badge in the header
- **Chat assistant** (💬 button, or press `/`) — natural language commands:

| Say | Does |
|---|---|
| `add 10 pens` | Creates "Pens" with 10 units (or adds 10 to existing) |
| `sold 3 pens` | Removes 3 from stock, logs the sale, warns if it goes low/out |
| `used 2 pens for store` | Takes stock for shop/display use — logged as store use, NOT a sale |
| `daily report` / `weekly report` / `monthly report` | Units sold, revenue, store use, top items for the period |
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
| `help` | Full command list |

- **Persistence** — data saved in browser localStorage (per browser/profile), and to the cloud when signed in
- **Multi-store** — 🏬 **Stores** opens an all-stores overview: one card per store with items, units, stock value, low/out alerts, units sold today, and today's revenue. Create and delete stores; each store has **its own page, stock, sales log, reports, currency, and its own assistant conversation** — so each store's chat keeps its own context.
- **Cloud sync (optional)** — see **Cloud setup** below; offline stores carry over automatically on first sign-in
- **Dark / light mode** — follows system preference, toggle in header
- **Keyboard shortcuts** — `N` = add item, `/` = open assistant

## Cloud setup (multi-store, login, cloud save) — ~10 minutes, once

1. Create a free project at **[supabase.com](https://supabase.com)** (no credit card needed).
2. In the Supabase dashboard open **SQL Editor → New query**, paste the whole contents of `supabase-setup.sql` (this folder) and click **Run**. This creates the tables with row-level security, so every account can only ever see its own data.
3. In Supabase go to **Settings → API** and copy the **Project URL** and the **anon public key**.
4. Open StockPilot — a sign-in screen appears. Paste the URL and key, click **Save cloud settings** (one time — they're remembered in this browser), then **Sign up** with your email and a password.
5. During sign-up you name your first store. After that a **store dropdown** appears in the header — pick it to switch stores; every store keeps its own items, sales, reports, and currency.

Notes:

- Your existing local inventory is **imported automatically** into your first cloud store on first sign-in (if the store is empty).
- All changes sync to the cloud as you make them — items, sales, **and the assistant conversation**, so your chat history follows you to any device you sign in on — and are also cached in this browser, so the app keeps working offline and catches up on the next change.
- **Log out** is in the header; **☁️ Sign in** brings the screen back. "Continue without cloud" keeps everything local on this browser only.
- Signing in on **another device or browser** with the same email shows the same stores and data.
- To add a store beyond the first: click **＋ Store** in the header. Each store starts empty with its own items, sales, reports, and currency — the database supports unlimited stores per account.

## Notes

- Without cloud configured, the app is fully usable offline on one store (previous behavior).
- Prices are in INR by default; each store's currency selector (or the chat/set default) changes it per store.
