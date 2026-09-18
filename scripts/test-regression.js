// StockPilot regression harness: runs the inline script of index.html in a
// sandboxed DOM/localStorage and exercises store switching, reports, and the chat.
// Run with: node scripts/test-regression.js (from project root)
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) {
  console.error("expected exactly 1 inline <script> block, found", scripts.length);
  process.exit(1);
}

// ---- Minimal browser shims ----
const noop = () => {};
function makeEl(tag) {
  return {
    tagName: (tag || "div").toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    textContent: "",
    innerHTML: "",
    value: "",
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { (this._ls = this._ls || {})[type] = (this._ls[type] || []).concat(fn); },
    removeEventListener: noop,
    click() { for (const fn of ((this._ls && this._ls.click) || [])) fn({ target: this, preventDefault: noop, stopPropagation: noop }); },
    closest: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    focus: noop,
    showModal: noop,
    close: noop,
    remove: noop,
    scrollTo: noop,
    scrollHeight: 0,
  };
}

function selectEl() {
  const el = makeEl("select");
  Object.defineProperty(el, "options", { get: () => el.children });
  return el;
}

const els = {
  brandName: makeEl("span"),
  signinBtn: makeEl("button"),
  storesBtn: makeEl("button"),
  storeSelect: selectEl(),
  addStoreBtn: makeEl("button"),
  logoutBtn: makeEl("button"),
  currencySelect: selectEl(),
  alertBadge: makeEl("button"),
  themeBtn: makeEl("button"),
  addItemBtn: makeEl("button"),
  overview: makeEl("div"),
  overviewClose: makeEl("button"),
  storeView: makeEl("div"),
  statTotal: makeEl("span"),
  statUnits: makeEl("span"),
  statValue: makeEl("span"),
  statLow: makeEl("span"),
  statSoldToday: makeEl("span"),
  searchInput: makeEl("input"),
  filterSelect: selectEl(),
  sortSelect: selectEl(),
  rpSeg: makeEl("div"),
  rpCustom: makeEl("div"),
  rpFrom: makeEl("input"),
  rpTo: makeEl("input"),
  rpApply: makeEl("button"),
  rpOutput: makeEl("div"),
  tbody: makeEl("tbody"),
  emptyState: makeEl("div"),
  chatFab: makeEl("button"),
  chatPanel: makeEl("div"),
  chatHeadName: makeEl("div"),
  chatClose: makeEl("button"),
  chatMsgs: makeEl("div"),
  chatChips: makeEl("div"),
  chatInput: makeEl("input"),
  chatSend: makeEl("button"),
  itemDialog: makeEl("dialog"),
  dialogTitle: makeEl("h3"),
  dialogSub: makeEl("p"),
  fName: makeEl("input"),
  fDesc: makeEl("input"),
  fQty: makeEl("input"),
  fThreshold: makeEl("input"),
  fPrice: makeEl("input"),
  fCost: makeEl("input"),
  fCategory: makeEl("input"),
  dialogCancel: makeEl("button"),
  dialogSave: makeEl("button"),
  authBackdrop: makeEl("div"),
  authTitle: makeEl("h2"),
  authSub: makeEl("p"),
  cfgFields: makeEl("div"),
  cfgUrl: makeEl("input"),
  cfgKey: makeEl("textarea"),
  authFields: makeEl("div"),
  authEmail: makeEl("input"),
  authPass: makeEl("input"),
  storeNameField: makeEl("div"),
  storeName: makeEl("input"),
  authErr: makeEl("p"),
  authSubmit: makeEl("button"),
  authToggle: makeEl("button"),
  offlineBtn: makeEl("button"),
  cfgSave: makeEl("button"),
  storesGrid: makeEl("div"),
  storeCreate: makeEl("button"),
  toastWrap: makeEl("div"),
};
for (const k of Object.keys(els)) els[k].id = k;

const store = new Map();
const session = new Map();
const storageFactory = (map) => ({
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
  clear: () => map.clear(),
});

const listeners = {};
const documentObj = {
  getElementById: (id) => els[id] || null,
  createElement: (tag) => makeEl(tag),
  documentElement: { dataset: {} },
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  body: makeEl("body"),
};

const sandbox = {
  console,
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: noop,
  requestAnimationFrame: (fn) => { fn(); return 0; },
  localStorage: storageFactory(store),
  sessionStorage: storageFactory(session),
  document: documentObj,
  window: {},
  Date,
  Math,
  JSON,
  Map,
  Set,
  Promise,
  Object,
  Array,
  String,
  Number,
  parseInt,
  parseFloat,
  confirm: () => true,
  prompt: () => "Harness Store",
  alert: noop,
};
sandbox.window = sandbox;
sandbox.window.matchMedia = () => ({ matches: false });
sandbox.window.supabase = undefined; // offline mode
sandbox.window.scrollTo = noop;

vm.createContext(sandbox);

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  ✅ ${name}`);
  else { failed++; console.error(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
}

// `const` bindings don't attach to the vm global, so capture them with an epilogue
// appended to the app source before it runs. The script must be evaluated exactly
// once in this context — a second run would redeclare its top-level consts.
sandbox.__capture = null;
const epilogue = `;__capture = { state, handleCommand, localStores, showView, resetReports, renderReportPanel, uiView: () => uiView, createStoreOffline, loadOfflineStore, runAutoPrune, pruneStateSales, pruneCutoffDate, RETENTION_DAYS };`;
try {
  vm.runInContext(scripts[0] + epilogue, sandbox, { filename: "index.html:inline+epilogue" });
} catch (e) {
  console.error("❌ Script threw during boot:", e.stack || e);
  process.exit(1);
}
const app = sandbox.__capture;
const { state, handleCommand, localStores, showView, resetReports, renderReportPanel } = app;

// The app's prune promise chains are simple resolve queues; a short synchronous
// busy-wait lets the vm's microtask queue run between synchronous calls.
function awaitPromise() {
  const start = Date.now();
  while (Date.now() - start < 25) { /* busy-wait ~25ms for microtasks to settle */ }
}

try {
  console.log("\n— Boot & stores —");
  check("state exists", !!state);
  check("booted into a store", !!state.storeId, JSON.stringify(state.storeId));
  check("localStores() returns at least one store", localStores().length >= 1);

  console.log("\n— Chat engine —");
  check("add item", /Created/.test(handleCommand("add 10 pens") || ""), handleCommand("add 10 pens"));
  check("sale", /Removed|left/.test(handleCommand("sold 3 pens") || ""));
  check("daily report (chat)", /sales report/.test(handleCommand("daily report") || ""));
  check("custom report via dates", /sales report/.test(handleCommand("report from 2026-09-01 to 2026-09-05") || ""), handleCommand("report from 2026-09-01 to 2026-09-05"));
  check("profit", /Profit/.test(handleCommand("profit this week") || ""));

  console.log("\n— Reports panel —");
  check("resetReports defined", typeof resetReports === "function");
  check("renderReportPanel defined", typeof renderReportPanel === "function");
  if (typeof renderReportPanel === "function") {
    const prev = els.rpOutput.innerHTML;
    renderReportPanel();
    check("panel renders into #rpOutput", els.rpOutput.innerHTML !== prev || els.rpOutput.textContent.length > 0);
    check("panel text has sales totals", /sales report/.test(els.rpOutput.textContent) && /Sold:/.test(els.rpOutput.textContent), els.rpOutput.textContent.slice(0, 120));
  }

  console.log("\n— Store switching —");
  const st2 = app.createStoreOffline("Second Shop");
  check("createStoreOffline returns store", !!(st2 && st2.id && st2.name === "Second Shop"));
  app.loadOfflineStore(st2.id);
  check("switched store id", state.storeId === st2.id, state.storeId);
  check("new store is empty", state.items.length === 0, `items=${state.items.length}`);
  check("chats are per-store", state.chat.length === 1, `chat len=${state.chat.length}`);
  check("old store data intact", (() => {
    const raw = store.get("stockpilot.local." + "local-default" + ".items");
    const arr = raw ? JSON.parse(raw) : [];
    return arr.some((it) => /pens/i.test(it.name || ""));
  })(), "local-default.items missing pens");

  console.log("\n— Overview —");
  showView("overview");
  check("overview page shows", app.uiView() === "overview");
  showView("store");

  console.log("\n— Theme —");
  // Simulate real header-button clicks through the captured listeners.
  els.themeBtn.click();
  check("theme toggles to dark on click", documentObj.documentElement.dataset.theme === "dark", documentObj.documentElement.dataset.theme);
  check("theme choice persisted", store.get("stockpilot.theme") === "dark");
  els.themeBtn.click();
  check("theme toggles back to light", documentObj.documentElement.dataset.theme === "light");

  console.log("\n— Auto data cleanup —");
  // Return to the first store so its items/sales are what we inspect.
  app.loadOfflineStore("local-default");
  check("prune functions exposed", typeof app.runAutoPrune === "function" && typeof app.pruneStateSales === "function" && typeof app.pruneCutoffDate === "function");
  check("retention is ~6 months (183d)", app.RETENTION_DAYS === 183, `RETENTION_DAYS=${app.RETENTION_DAYS}`);
  // Build a stale record the same way the app does (date key + timestamp), 200 days old.
  const oldD = new Date();
  oldD.setDate(oldD.getDate() - 200);
  const oldKey = oldD.toLocaleDateString("en-CA");
  const freshKey = (() => { const d = new Date(); return d.toLocaleDateString("en-CA"); })();
  state.sales.push(
    { id: "old1", name: "Pens", qty: 2, price: 10, kind: "sale", date: oldKey, ts: oldD.getTime() },
    { id: "fresh1", name: "Pens", qty: 1, price: 10, kind: "sale", date: freshKey, ts: Date.now() },
    { id: "legacy1", name: "Pens", qty: 1, price: 10, kind: "sale", date: null, ts: 0 } // undated legacy row must survive
  );
  const cutoff = app.pruneCutoffDate();
  check("cutoff is a YYYY-MM-DD string", /^\d{4}-\d{2}-\d{2}$/.test(cutoff), cutoff);
  const removed = app.pruneStateSales();
  check("stale record pruned", state.sales.some((s) => s.id === "old1") === false, `removed=${removed}`);
  check("recent record kept", state.sales.some((s) => s.id === "fresh1"));
  check("undated legacy record kept", state.sales.some((s) => s.id === "legacy1"));
  check("items untouched by prune", state.items.some((it) => /pens/i.test(it.name || "")));
  // Daily throttle: a second run right away must not re-prune (timestamp set by runAutoPrune).
  store.set("stockpilot.lastPrune", String(Date.now()));
  state.sales.push({ id: "old2", name: "Pens", qty: 2, price: 10, kind: "sale", date: oldKey, ts: oldD.getTime() });
  awaitPromise(app.runAutoPrune());
  check("throttled run leaves sales alone", state.sales.some((s) => s.id === "old2"));
  store.set("stockpilot.lastPrune", "0");
  awaitPromise(app.runAutoPrune());
  check("unthrottled run prunes again", state.sales.some((s) => s.id === "old2") === false);
  // Chat command exists in the router (help text + manual trigger path).
  check("chat help lists clean old data", /clean old data/.test(handleCommand("help") || ""));

  console.log("\n— Custom sale & store use commands —");
  // Custom sale: sell at an overridden price; report revenue must use it.
  handleCommand("add item vivo y18, qty 5, price 1800, cost 1500");
  const stockBefore = state.items.find((it) => /y18/i.test(it.name)).qty;
  const reply = handleCommand("custom sale vivo y18 @ 1600") || "";
  const y18 = state.items.find((it) => /y18/i.test(it.name));
  check("custom sale deducts stock", y18.qty === stockBefore - 1, `reply=${reply}`);
  const lastSale = state.sales[state.sales.length - 1];
  check("custom sale logs override price", lastSale && lastSale.price === 1600, JSON.stringify(lastSale));
  check("custom sale reply mentions custom price", /1,600/.test(reply) && /custom price/i.test(reply), reply);
  // Explicit qty variant: one sale row with qty 2 at the override price.
  const qtyBefore = state.items.find((it) => /y18/i.test(it.name)).qty;
  handleCommand("custom sale 2 vivo y18 @ 1500");
  check("custom sale with qty works", state.items.find((it) => /y18/i.test(it.name)).qty === qtyBefore - 2);
  const qtySale = state.sales[state.sales.length - 1];
  check("custom sale qty logs 2×1500", qtySale && qtySale.qty === 2 && qtySale.price === 1500, JSON.stringify(qtySale));
  // Revenue math picks up the override (report from the dates of those sales).
  const todayKey = freshKey;
  const rev = state.sales.filter((s) => s.date === todayKey && s.kind === "sale").reduce((n, s) => n + s.qty * s.price, 0);
  check("override price flows into revenue", rev > 0, `rev=${rev}`);
  // Unknown item and missing price get helpful replies, not silent failure.
  check("custom sale unknown item", /couldn't find|No item/i.test(handleCommand("custom sale xyz thing @ 10") || ""));
  // Store use: dedicated command takes stock without a sale.
  const pens = state.items.find((it) => /pens/i.test(it.name));
  const pensBefore = pens.qty;
  const useReply = handleCommand("store use 2 pens") || "";
  check("store use deducts stock", state.items.find((it) => /pens/i.test(it.name)).qty === pensBefore - 2, useReply);
  const lastMove = state.sales[state.sales.length - 1];
  check("store use logged as 'use' not 'sale'", lastMove && lastMove.kind === "use", JSON.stringify(lastMove));
  check("store use reply is use wording", /store use/i.test(useReply), useReply);
  // Quantity-prompt variant: no number → asks how many.
  const askReply = handleCommand("store use pens") || "";
  check("store use without qty asks how many", /How many/i.test(askReply), askReply);
  // Help lists both new commands.
  const help = handleCommand("help") || "";
  check("help lists custom sale", /custom sale/.test(help));
  check("help lists store use", /store use/.test(help));

} catch (e) {
  failed++;
  console.error("❌ Harness error:", e.stack || e);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
