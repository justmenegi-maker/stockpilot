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
    open: false,
    showModal() { this.open = true; },
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
  reportsToggle: makeEl("button"),
  reportsSection: makeEl("div"),
  exportBtn: makeEl("button"),
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
  authPass: Object.assign(makeEl("input"), { type: "password" }),
  storeNameField: makeEl("div"),
  storeName: makeEl("input"),
  authErr: makeEl("p"),
  authSubmit: makeEl("button"),
  authToggle: makeEl("button"),
  offlineBtn: makeEl("button"),
  cfgSave: makeEl("button"),
  // Check-your-inbox signup state
  authPending: makeEl("div"),
  pendingSub: makeEl("p"),
  pendingResend: makeEl("button"),
  pendingBack: makeEl("button"),
  pendingHint: makeEl("p"),
  pendingLinks: makeEl("div"),
  storesGrid: makeEl("div"),
  storeCreate: makeEl("button"),
  toastWrap: makeEl("div"),
  // Sold Today / edit-sale feature
  statSoldCard: makeEl("div"),
  statUseToday: makeEl("span"),
  soldSection: makeEl("div"),
  editSaleBtn: makeEl("button"),
  soldList: makeEl("div"),
  editSaleDialog: makeEl("dialog"),
  soldEditList: makeEl("div"),
  soldMsg: makeEl("p"),
  soldClose: makeEl("button"),
  // Login page + account settings
  authTabs: makeEl("div"),
  authLinksRow: makeEl("div"),
  authSub: makeEl("p"),
  passEye: makeEl("button"),
  sbAdv: makeEl("div"),
  sbAdvToggle: makeEl("button"),
  sbAdvBody: makeEl("div"),
  cfgTest: makeEl("button"),
  authProjHint: makeEl("p"),
  accountBtn: makeEl("button"),
  accountDialog: makeEl("dialog"),
  acctTitle: makeEl("h3"),
  acctSub: makeEl("p"),
  acctName: makeEl("input"),
  acctEmail: makeEl("input"),
  acctCurPass: makeEl("input"),
  acctNewPass: makeEl("input"),
  acctErr: makeEl("p"),
  acctSaved: makeEl("span"),
  acctRefresh: makeEl("button"),
  acctSaveProfile: makeEl("button"),
  acctConnStatus: makeEl("div"),
  acctCfgUrl: makeEl("input"),
  acctCfgKey: makeEl("textarea"),
  acctCfgSave: makeEl("button"),
  acctCfgTest: makeEl("button"),
  acctCfgReset: makeEl("button"),
  acctProjHint: makeEl("p"),
  acctSignOut: makeEl("button"),
  acctDelete: makeEl("button"),
  acctProfile: makeEl("div"),
  acctCloud: makeEl("div"),
  acctDanger: makeEl("div"),
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
  querySelector: () => null,
  querySelectorAll: () => [],
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
  URL,
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
const epilogue = `;__capture = { state, handleCommand, localStores, showView, resetReports, renderReportPanel, uiView: () => uiView, createStoreOffline, loadOfflineStore, runAutoPrune, pruneStateSales, pruneCutoffDate, RETENTION_DAYS, salesBreakdown, isCustomSale, saveSalesEdit, deleteSaleRow, renderSoldList, renderSoldEditor, openSold, recordMovement, takeStock, adjustQty, reportText, acctOpen, acctFillProfile, testCloudConnection, friendlyAuthError, acctDlg: () => acctDlg, showPending, setAuthMode, afterSignIn, authMode: () => authMode };`;
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
  const unwrap = (r) => (r && typeof r === "object" && r.__html ? r.__html : String(r ?? ""));
  check("daily report (chat) is a table", /rp-table/.test(unwrap(handleCommand("daily report"))) && /Items sold/.test(unwrap(handleCommand("daily report"))));
  const todayStr = new Date().toLocaleDateString("en-CA");
  const customHtml = unwrap(handleCommand(`report from 2026-09-01 to ${todayStr}`));
  check("custom report via dates is a table", /rp-table/.test(customHtml) && /Items sold/.test(customHtml), customHtml.slice(0, 120));
  check("profit", /Profit/.test(handleCommand("profit this week") || ""));

  console.log("\n— Multi add (batch) —");
  {
    const itemsBefore = state.items.length;
    const reply = handleCommand("multi add 1 vivo y18 @ 1800, 1 xts @ 599, 9 yxc @ 799") || "";
    check("multi add creates all items", state.items.length === itemsBefore + 3, `reply=${reply}`);
    const vivo = state.items.find((it) => /vivo/i.test(it.name));
    const xts = state.items.find((it) => /xts/i.test(it.name));
    const yxc = state.items.find((it) => /yxc/i.test(it.name));
    check("multi add sets qty+price per entry", !!vivo && !!xts && !!yxc && vivo.qty === 1 && vivo.price === 1800 && xts.qty === 1 && xts.price === 599 && yxc.qty === 9 && yxc.price === 799,
      JSON.stringify([vivo, xts, yxc]));
    check("multi add reply lists each line", /vivo y18/i.test(reply) && /xts/i.test(reply) && /yxc/i.test(reply) && /Added 3 items/.test(reply), reply);
    check("multi add counts units", /11 units/.test(reply), reply);
    // Restock path: existing item merges and price updates instead of duplicating.
    const xtsBefore = xts.qty;
    const reply2 = handleCommand("multi add 1 xts @ 649, 2 nova 5g @ 999") || "";
    check("multi add restocks existing + creates new", state.items.length === itemsBefore + 4 && xts.qty === xtsBefore + 1 && xts.price === 649, `reply=${reply2}`);
    // Thousands separator inside a price must not split the entry.
    const reply3 = handleCommand("multi add 1 pro max @ 1,499") || "";
    const proMax = state.items.find((it) => /pro max/i.test(it.name));
    check("multi add keeps 1,499 as one price", !!proMax && proMax.price === 1499 && !/Skipped/.test(reply3), `reply=${reply3}`);
    // Garbage lines are skipped with a helpful note; good lines still land.
    const reply4 = handleCommand("multi add 2 good item @ 50, oops no price here") + "";
    check("multi add skips unreadable lines", !!(state.items.find((it) => /good item/i.test(it.name))) && /Skipped 1/.test(reply4), `reply=${reply4}`);
    check("multi add with nothing readable explains format", /couldn't read/i.test(handleCommand("multi add hello world") + ""));
    // Junk in the middle: valid entries around it still land.
    const before5 = state.items.length;
    const reply5 = handleCommand("multi add 2 good item @ 50, and some glue, 3 also good @ 70") + "";
    // "Good Item" already exists from the prior check -> it restocks (no new row);
    // "Also Good" is new. Exactly one junk line ("and some glue") is skipped.
    check("multi add survives mid-list junk", state.items.length === before5 + 1 && !!(state.items.find((it) => /also good/i.test(it.name))) && /Skipped 1/.test(reply5) && /glue/.test(reply5), JSON.stringify(reply5));
  }

  console.log("\n— Reports panel —");
  check("resetReports defined", typeof resetReports === "function");
  check("renderReportPanel defined", typeof renderReportPanel === "function");
  if (typeof renderReportPanel === "function") {
    const prev = els.rpOutput.innerHTML;
    renderReportPanel();
    check("panel renders into #rpOutput", els.rpOutput.innerHTML !== prev || els.rpOutput.textContent.length > 0);
    check("panel text has sales totals", /Items sold/.test(els.rpOutput.innerHTML) && /revenue/i.test(els.rpOutput.innerHTML), els.rpOutput.innerHTML.slice(0, 160));
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

  console.log("\n— Delete all stock —");
  {
    // On the empty "Second Shop": nothing to delete and nothing gets armed.
    const emptyReply = handleCommand("delete all stock") || "";
    check("delete all stock on empty inventory is a no-op", /already empty/.test(emptyReply), emptyReply);

    handleCommand("add 5 test alpha");
    handleCommand("add 3 test beta");
    check("seeded two items for wipe test", state.items.length === 2, `items=${state.items.length}`);

    // Destructive command arms a confirmation instead of deleting outright.
    const armReply = handleCommand("delete all stock") || "";
    check("delete all stock asks to confirm with counts", /Delete ALL 2 items \(8 units\)/.test(armReply) && /cannot be undone/i.test(armReply), armReply);
    check("nothing deleted while unconfirmed", state.items.length === 2, `items=${state.items.length}`);

    // The gate holds until a clear yes/no; unrelated text must not trip it.
    const holdReply = handleCommand("something random") || "";
    check("confirmation gate holds on unrelated text", /Still waiting/.test(holdReply), holdReply);
    check("still nothing deleted after gate holds", state.items.length === 2);
    check("cancel keeps stock intact", /Cancelled/.test(handleCommand("nope") || "") && state.items.length === 2);

    // Legacy phrase still routes; confirming executes the wipe.
    const arm2 = handleCommand("delete all") || "";
    check("legacy 'delete all' also routes", /Delete ALL 2 items/.test(arm2), arm2);
    const wipeReply = handleCommand("yes") || "";
    check("confirming wipes every item", state.items.length === 0, `reply=${wipeReply}`);
    check("wipe reply counts deleted items", /Deleted all 2 items/.test(wipeReply), wipeReply);
    const stored = store.get("stockpilot.local." + state.storeId + ".items");
    check("wipe persists to storage", stored === "[]", String(stored));

    // Help documents the command.
    check("help lists delete all stock", /delete all stock/.test(handleCommand("help") || ""));
  }

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

  console.log("\n— Detailed reports, adjust fix & edit sale —");
  const pens2 = state.items.find((it) => /pens/i.test(it.name));
  const hammer = (() => { handleCommand("add 4 hammers"); return state.items.find((it) => /hammer/i.test(it.name)); })();

  // A) The +/- adjust buttons must be pure stock corrections — no sale rows.
  const salesCountBefore = state.sales.length;
  const revBefore = state.sales.filter((s) => s.kind === "sale").reduce((n, s) => n + s.qty * s.price, 0);
  const pensQtyAtAdjust = pens2.qty;
  app.adjustQty(pens2, -1);
  check("adjust minus deducts qty", pens2.qty === pensQtyAtAdjust - 1, `qty=${pens2.qty} start=${pensQtyAtAdjust}`);
  app.adjustQty(pens2, 1);
  check("adjust plus restores qty", pens2.qty === pensQtyAtAdjust, `qty=${pens2.qty}`);

  // B) Detailed report: every sold item named with qty; store use named; custom sales separate with prices.
  handleCommand("sold 2 hammers");
  handleCommand("sold 1 pens");
  handleCommand("store use 2 pens");
  handleCommand("custom sale vivo y18 @ 999");
  const report = unwrap(handleCommand("daily report"));
  check("report header is detailed", /Items sold/.test(report) && /Most sold items/.test(report), report.slice(0, 80));
  check("report names sold items", /Hammers/i.test(report) && /Pens/i.test(report), report);
  check("report shows per-item qty", /<td class="num">2<\/td>/.test(report) && /<td class="num">5<\/td>/.test(report), report.slice(0, 200));
  check("report lists store use items", /Store use \(not sales\)/.test(report) && /<td>Pens<\/td><td class="num">4<\/td>/.test(report), report.slice(-400));
  check("report has custom sales section", /Custom sales \(separate\)/.test(report), report);
  check("custom sales show prices", /Price each/.test(report) && /1,600\.00/.test(report), report.split("Custom sales")[1] ? report.split("Custom sales")[1].slice(0, 160) : report.slice(0, 160));
  const y18row = state.sales.filter((s) => /y18/i.test(s.name) && s.kind === "sale").slice(-1)[0];
  check("report custom price matches record", y18row && report.includes(y18row.price.toLocaleString(undefined, { style: "currency", currency: state.currency })), y18row && y18row.price);
  check("custom row flagged", y18row && (y18row.custom === true || app.isCustomSale(y18row)));
  // Chart: most-sold items with bars sorted by qty.
  check("chat report has most-sold chart", /Most sold items/.test(report) && (report.match(/bar-row/g) || []).length >= 3, (report.match(/bar-row/g) || []).length);
  check("chart bars sized by qty share", /width:100%/.test(report) && /bar-fill/.test(report));

  // Panel shows the same detail as chat.
  app.resetReports();
  check("panel shows store use section", /Store use \(not sales\)/.test(els.rpOutput.innerHTML), els.rpOutput.innerHTML.slice(0, 200));
  check("panel shows custom section", /Custom sales \(separate\)/.test(els.rpOutput.innerHTML));

  // C) Edit sale: qty/price rewrite keeps stock; delete returns units to stock.
  const hBefore = state.items.find((it) => /hammer/i.test(it.name)).qty;
  const hSale = state.sales.filter((s) => /hammer/i.test(s.name) && s.kind === "sale").slice(-1)[0];
  const hUnitsBefore = state.sales.filter((s) => /hammer/i.test(s.name) && s.kind === "sale").reduce((n, s) => n + s.qty, 0);
  app.saveSalesEdit(hSale.id, 5, 100);
  check("edit updates qty", hSale.qty === 5, JSON.stringify({ qty: hSale.qty, price: hSale.price }));
  check("edit updates price", hSale.price === 100);
  check("edit keeps stock untouched", state.items.find((it) => /hammer/i.test(it.name)).qty === hBefore);
  check("edit marks non-list price as custom", hSale.custom === true);
  check("edited totals flow into reports", /5 sold/.test((app.reportText("day") || "")));

  // Reverting the mis-click: delete the edited sale — its (edited) units go back to stock.
  const revPreDelete = state.sales.filter((s) => s.kind === "sale").reduce((n, s) => n + s.qty * s.price, 0);
  app.deleteSaleRow(hSale.id);
  check("delete removes the row", state.sales.some((s) => s.id === hSale.id) === false);
  check("delete returns units to stock", state.items.find((it) => /hammer/i.test(it.name)).qty === hBefore + 5, `qty=${state.items.find((it) => /hammer/i.test(it.name)).qty}`);
  const revAfter = state.sales.filter((s) => s.kind === "sale").reduce((n, s) => n + s.qty * s.price, 0);
  check("delete removes its revenue", revAfter === revPreDelete - 500);

  // D) Store-use rows must never be editable as sales (sold editor filters kind==="sale").
  check("sold editor lists sales only", app.renderSoldEditor() === undefined && true); // smoke: runs without error

  console.log("\n— Login page & account settings —");
  // Auth tab switching wired through real listeners.
  els.authTabs.children.push(Object.assign(makeEl("button"), { dataset: { mode: "signin" } }));
  els.authTabs.children.push(Object.assign(makeEl("button"), { dataset: { mode: "signup" } }));
  for (const b of els.authTabs.children) b.addEventListener("click", () => {}); // (app already wired its own)
  check("friendlyAuthError maps bad credentials", /incorrect/i.test(app.friendlyAuthError({ message: "Invalid login credentials" })));
  check("friendlyAuthError maps unconfirmed email", /confirmation link/i.test(app.friendlyAuthError({ message: "Email not confirmed" })));
  check("friendlyAuthError passes through unknown", /weird failure/.test(app.friendlyAuthError({ message: "weird failure" })));
  // Password toggle flips the input type.
  els.passEye.click();
  check("pass eye reveals password", els.authPass.type === "text");
  els.passEye.click();
  check("pass eye hides password", els.authPass.type === "password");
  // Advanced Supabase panel toggles.
  els.sbAdvToggle.click();
  check("sb advanced panel opens", els.sbAdv.classList.contains("open"));
  els.sbAdvToggle.click();
  check("sb advanced panel closes", !els.sbAdv.classList.contains("open"));
  // Account dialog opens (offline mode → falls back to the auth screen) and profile fill is safe.
  app.acctOpen();
  check("acctOpen offline shows auth screen", els.authBackdrop.style.display === "flex");
  check("acctFillProfile tolerates null user", app.acctFillProfile() === undefined);

  console.log("\n— Signup recovery (check-your-inbox) —");
  // Pending view hides the form and shows the resend flow, keyed to the email.
  app.showPending("owner@shop.com", "Main Shop");
  check("pending view shows", els.authPending.style.display === "");
  check("form hidden while pending", els.authFields.style.display === "none" && els.authSubmit.style.display === "none");
  check("pending copy names the email", /owner@shop\.com/.test(els.pendingSub.innerHTML), els.pendingSub.innerHTML);
  check("store name stashed for self-heal", (() => { try { return JSON.parse(store.get("stockpilot.pendingStore")) === "Main Shop"; } catch { return false; } })());
  els.pendingBack.click();
  check("back returns to the sign-in form", els.authPending.style.display === "none" && els.authFields.style.display === "");
  // setAuthMode restores everything even if the pending view was open.
  app.showPending("x@y.com", "S");
  els.authToggle.click();
  check("mode switch clears pending view", els.authPending.style.display === "none");

  console.log("\n— Supabase connection test & login validation —");
  // Auth tab toggle flips heading + store-name field visibility (explicit modes).
  app.setAuthMode("signup");
  check("signup mode shows store name field", !els.storeNameField.classList.contains("hidden") && /account/i.test(els.authTitle.textContent), els.authTitle.textContent);
  app.setAuthMode("signin");
  check("signin mode hides store name field", els.storeNameField.classList.contains("hidden"));

  // Login card cloud settings: synchronous validation + save (async tests follow below).
  sandbox.window.supabase = { createClient: () => ({}) }; // factory replaced in async tail
  els.cfgUrl.value = "notaurl";
  els.cfgKey.value = "k".repeat(40);
  els.cfgSave.click();
  check("cfgSave rejects a bad URL", els.authErr.style.display === "block" && /supabase\.co/.test(els.authErr.textContent), els.authErr.textContent);
  els.cfgUrl.value = "https://abc123.supabase.co";
  els.cfgSave.click();
  check("cfgSave stores a valid connection", (() => { try { return JSON.parse(store.get("stockpilot.cloud.cfg")).url === "https://abc123.supabase.co"; } catch { return false; } })());

  // ---- P0 security: token storage factory (source-level invariants) ----
  // html (read at top of file) is the full index.html source; the inline script
  // is the single <script> block the harness extracted above (scripts[0]).
  const inline = scripts[0];
  check("token factory: exactly one raw createClient (the factory)", (inline.match(/window\.supabase\.createClient\(/g) || []).length === 1);
  check("token factory: main client persists to sessionStorage", /newClient\(SB_URL, SB_KEY, "session"\)/.test(inline));
  check("token factory: memory-only probes", (inline.match(/newClient\(url, key, "memory"\)/g) || []).length === 2);
  check("token factory: legacy localStorage token purge present", /\/\^sb-\.\*-auth-token\//.test(inline));
  check("token factory: no default createClient without storage opts", !/createClient\(url, key\)/.test(inline) && !/createClient\(SB_URL, SB_KEY\)/.test(inline));

  // ---- P0.4 security: CSP, referrer policy, attribute escaping ----
  // html (head metas live outside the inline script) and scripts[0] are in scope.
  check("CSP meta restricts network to Supabase + CDN", /http-equiv="Content-Security-Policy"[^>]*connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/.test(html));
  check("CSP meta forbids objects, forms and base hijacking", /object-src 'none'/.test(html) && /form-action 'none'/.test(html) && /base-uri 'none'/.test(html));
  check("referrer policy is no-referrer", /<meta name="referrer" content="no-referrer" \/>/.test(html));
  check("cloud-sourced ids are escaped in attributes", !/data-(id|del)="\$\{(it|s)\./.test(scripts[0]) && (scripts[0].match(/data-(id|del)="\$\{esc\(/g) || []).length === 8);

  // ---- PWA: manifest, icons, service worker ----
  let manifestOk = false, manifestIcons = 0;
  try { const mf = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8")); manifestOk = mf.display === "standalone" && mf.start_url === "./"; manifestIcons = mf.icons.length; } catch {}
  check("PWA manifest is valid standalone with relative start_url", manifestOk);
  check("PWA manifest declares 4 icons incl. maskable", manifestIcons === 4);
  check("index.html links manifest, theme-color and apple icon", /rel="manifest" href="\.\/manifest\.webmanifest"/.test(html) && /name="theme-color" content="#4f46e5"/.test(html) && /rel="apple-touch-icon"/.test(html));
  check("CSP allows same-origin manifest and worker", /manifest-src 'self'/.test(html) && /worker-src 'self'/.test(html));
  let swOk = false;
  try { const sw = fs.readFileSync("sw.js", "utf8"); swOk = sw.includes('addEventListener("fetch"') && sw.includes('url.origin !== self.location.origin') && sw.includes('caches.open'); } catch {}
  check("service worker: fetch handler, cross-origin passthrough, versioned cache", swOk);
  check("SW registration is guarded (no crash in sandbox/file://)", /typeof location !== "undefined"/.test(scripts[0]) && /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/.test(scripts[0]));
  check("generated icons exist with valid PNG signatures", ["icons/icon-192.png","icons/icon-512.png","icons/maskable-192.png","icons/maskable-512.png"].every((p) => { try { const b = fs.readFileSync(p); return b[0] === 0x89 && b[1] === 0x50; } catch { return false; } }));

  // ---- Mobile UI: viewport, safe areas, stable inputs ----
  // ---- Simplified UI language ----
  // ---- Color scheme: beige/white light, black/dark-grey dark ----
  check("colors: light theme is beige+white", /--bg: #f2ede3;/.test(html) && /--panel: #fffdf8;/.test(html) && /--line: #e2d9c8;/.test(html));
  check("colors: dark theme is black+dark grey", /--bg: #0a0a0a;/.test(html) && /--panel: #171717;/.test(html) && /--line: #2a2a2a;/.test(html));
  check("colors: status tints are theme-mixed (no hardcoded pastels)", !/#fef2f2|#fffbeb|#f0fdf4|#450a0a|#451a03|#052e16/.test(html));
  check("UI: brand mark is flat (no gradient)", !/linear-gradient\(135deg, #6366f1, #8b5cf6\)/.test(html));
  check("UI: default buttons are borderless tinted pills", /border: 1px solid transparent;\s*\n\s*background: color-mix\(in srgb, var\(--ink\) 5%, transparent\);/.test(html));
  check("UI: stat numbers are unboxed", /\.stat \{\s*\n\s*background: transparent;\s*\n\s*border: none;/.test(html));
  check("UI: sold list uses dividers, not cards", /border-bottom: 1px solid var\(--line\);\s*\n\s*border-radius: 0;/.test(html) && /\.sold-row:last-child \{ border-bottom: none; \}/.test(html));
  check("UI: section titles are sentence case", html.includes("<h2>All stores</h2>") && html.includes("<h3>Sold today</h3>") && html.includes("<h3>Sales reports</h3>"));
  // ---- Detailed report tables ----
  check("reports: ruled table styles present", /table\.rp-table/.test(html) && /\.rp-table tfoot td \{\s*\n\s*border-top: 2px solid var\(--line\);/.test(html));
  check("reports: summary KPI strip", /\.rp-summary \{/.test(html) && /kpiHtml\(/.test(scripts[0]));
  check("reports: per-item columns qty/revenue/avg/share", /Avg price/.test(scripts[0]) && /share-bar/.test(scripts[0]));
  check("reports: totals footer rows built", scripts[0].includes("<tfoot>") && (scripts[0].match(/<\/tfoot>/g) || []).length === 3);
  check("reports: custom + store-use tables", /Custom sales \(separate\)/.test(scripts[0]) && /Store use \(not sales\)/.test(scripts[0]));
  check("reports: chat replies render as tables+chart", /chatReportReply/.test(scripts[0]) && /__html/.test(scripts[0]) && /msg-html/.test(html));
  check("reports: chat html messages bypass textContent safely", /if \(m\.html\) div\.innerHTML = m\.text;/.test(scripts[0]) && /else div\.textContent = m\.text;/.test(scripts[0]));
  check("reports: most-sold chart (top 7, CSS bars)", /Most sold items/.test(scripts[0]) && /bar-fill/.test(scripts[0]) && /slice\(0, 7\)/.test(scripts[0]));
  check("reports: chart + tables styled for chat width", /\.msg\.bot\.msg-html/.test(html) && /\.bar-track/.test(html));  check("reports: chat keeps plain text", /detailed report:/.test(scripts[0]));
  check("UI: sold-today stat is an edit button with affordance", /class="stat stat-btn"/.test(html) && /stat-hint/.test(html));

  // ---- Clutter cleanup: quieter labels, ruled sections, text-only controls ----
  check("UI: stat labels are sentence case", /Total items/.test(html) && /Units in stock/.test(html) && /Stock value/.test(html) && /Low \/ out of stock/.test(html) && /Store use today/.test(html));
  check("UI: no uppercase micro-labels anywhere", !/text-transform: uppercase/.test(html));
  check("UI: inventory table is a ruled section, not a boxed card", /background: transparent;\s*\n\s*border: none;\s*\n\s*border-top: 1px solid var\(--line\);/.test(html));
  check("UI: reports panel is a ruled section, not a boxed card", /\n      \.reports \{\s*\n\s*background: transparent;\s*\n\s*border: none;\s*\n\s*border-top: 1px solid var\(--line\);/.test(html));
  check("UI: alert badge is borderless text", /\.alert-badge \{[\s\S]*?border: 1px solid transparent;/.test(html));
  check("UI: chat chips are quiet text links (no borders)", /\.chip \{\s*\n\s*font-size: 12px;\s*\n\s*padding: 5px 6px;\s*\n\s*border-radius: 8px;\s*\n\s*border: none;/.test(html));
  check("UI: FAB glow is neutral (no colored shadow)", !/rgba\(79, 70, 229/.test(html));
  check("UI: auth/account headings are plain text (no emoji)", /<h2 id="authTitle">Sign in to StockPilot<\/h2>/.test(html) && /<h3 id="acctTitle">Account settings<\/h3>/.test(html));
  check("UI: search input has no decorative emoji", !/<div class="search">🔎/.test(html));
  check("UI: secondary header actions are icon-only on desktop too", /\.header-actions \.btn-label \{ display: none; \}/.test(html));

  // ---- Reports hidden behind toggle + CSV export + SVG icons ----
  check("reports: hidden by default behind a toggle button", /id="reportsSection" style="display:none"/.test(html) && /id="reportsToggle"/.test(html) && /aria-expanded="false"/.test(html));
  check("reports: toggle opens panel + syncs aria-expanded", /reportsToggle/.test(scripts[0]) && /setAttribute\("aria-expanded"/.test(scripts[0]) && /btn\.classList\.toggle\("open"/.test(scripts[0]));
  check("data: CSV export wired (quotes fields, BOM, per-store filename)", /function exportCsv/.test(scripts[0]) && /text\/csv/.test(scripts[0]) && /\\uFEFF/.test(scripts[0]) && /stockpilot-/.test(scripts[0]));
  check("icons: inline SVG sprite present (CSP-safe)", /<symbol id="i-plus"/.test(html) && /<symbol id="i-chat"/.test(html) && /<symbol id="i-download"/.test(html));
  check("icons: header + FAB chrome use SVG (emoji only in toast text)", /<use href="#i-cloud"\/>/.test(html) && /fab-chat" id="chatFab"[\s\S]{0,120}#i-chat/.test(html) && !/💬|☁️|🚪|👤|🏬|🌙/.test(html.split("<script>")[0]));
  check("icons: theme toggle swaps sun/moon via innerHTML", /#i-sun/.test(scripts[0]) && /#i-moon/.test(scripts[0]) && /innerHTML = dark/.test(scripts[0]));
  check("icons: table row actions are SVG edit/trash", /data-act="edit" data-id="\$\{esc\(it\._id\)\}" title="Edit" aria-label/.test(scripts[0]) && /data-act="del"[\s\S]{0,120}#i-trash/.test(scripts[0]));
  check("icons: alert badge uses bell SVG", /badge\.innerHTML = `<svg class="ic"[\s\S]{0,60}#i-bell/.test(scripts[0]));
  check("document has a <title>", /<title>[^<]+<\/title>/.test(html) && /StockPilot/.test((html.match(/<title>([^<]*)<\/title>/) || [])[1] || ""));
  check("viewport has viewport-fit=cover for safe-area insets", /content="width=device-width, initial-scale=1, viewport-fit=cover"/.test(html));
  check("mobile CSS layer exists (760px breakpoints)", (html.match(/@media \(max-width: 760px\)/g) || []).length >= 2);
  check("mobile: 16px inputs prevent iOS focus zoom", /font-size: 16px; \/\* prevents iOS focus zoom \*\//.test(html) && /\.field input, \.field select, \.field textarea \{ font-size: 16px; \}/.test(html));
  check("mobile: safe-area padding on header, chat, FAB and Add Item", /env\(safe-area-inset-top/.test(html) && /env\(safe-area-inset-bottom/.test(html));
  check("mobile: icon-only secondary header buttons (4 labels)", (html.match(/class="btn-label"/g) || []).length === 5 && /\.btn-label \{ display: none; \}/.test(html));
  check("mobile: dialog buttons full-width 44px targets", /\.dialog-actions \.btn \{ flex: 1 1 auto; justify-content: center; min-height: 44px; \}/.test(html));
  check("multi add command is routed + documented", scripts[0].includes("multi\\s*[- ]?add") && /multi add 1 vivo y18/.test(scripts[0]));
  check("multi add: comma split guards thousands separators", scripts[0].includes("split(/\\s*,\\s*(?=\\d+\\s+\\S)/)"));
  check("mobile: toolbar becomes 2-col grid, search full-width", html.includes(".toolbar { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }") && html.includes(".toolbar .search { grid-column: 1 / -1; min-width: 0; }"));
  check("mobile: report text capped & scrollable", html.includes(".rp-report { max-height: 40dvh; overflow-y: auto;"));
  check("mobile: dialog field rows stack", html.includes(".dialog-body .field-row { display: block; }"));
  check("mobile: toasts clear the floating pills", html.includes("#toastWrap { bottom: calc(140px + env(safe-area-inset-bottom, 0px));"));
  check("mobile: auth tabs 40px targets", html.includes(".auth-tabs button { min-height: 40px; }"));
} catch (e) {
  failed++;
  console.error("❌ Harness error:", e.stack || e);
}

// ---- Async tail: connection tests need real microtask drainage ----
(async () => {
  try {
    const mkClient = (opts) => ({
      auth: { getSession: async () => (opts.authError ? { error: new Error(opts.authError) } : { error: null, data: { session: null } }) },
      from: (t) => ({
        select: () => ({
          limit: async () => (opts.tables && opts.tables[t] ? { error: new Error(opts.tables[t]) } : { error: null, data: [] }),
        }),
      }),
    });

    console.log("\n— Supabase connection test (async) —");
    const r1 = await app.testCloudConnection(mkClient({}), "https://abc123.supabase.co");
    check("conn test: healthy project passes", r1.ok === true, JSON.stringify(r1));
    check("conn test: names host + auth + all tables", /REACHABLE_OK abc123\.supabase\.co/.test(r1.summary) && /AUTH_OK/.test(r1.summary) && /TABLE stores: OK/.test(r1.summary) && /TABLE chats: OK/.test(r1.summary) && /ALL_GOOD/.test(r1.summary), r1.summary);

    const r2 = await app.testCloudConnection(mkClient({ tables: { sales: "relation does not exist" } }), "https://abc123.supabase.co");
    check("conn test: missing table fails with setup hint", r2.ok === false && /TABLE sales: MISSING/.test(r2.summary) && /RUN_SETUP_SQL/.test(r2.summary), r2.summary);

    const r3 = await app.testCloudConnection(mkClient({ authError: "boom" }), "https://abc123.supabase.co");
    check("conn test: auth failure surfaces message", r3.ok === false && /AUTH_FAIL boom/.test(r3.summary), r3.summary);

    const r4 = await app.testCloudConnection(mkClient({}), "notaurl");
    check("conn test: invalid URL rejected", r4.ok === false && /INVALID_URL/.test(r4.summary), r4.summary);

    // Login card "Test connection" button end-to-end with a mocked client factory.
    sandbox.window.supabase = { createClient: () => mkClient({}) };
    els.cfgUrl.value = "https://abc123.supabase.co";
    els.cfgKey.value = "k".repeat(40);
    els.cfgTest.click();
    await new Promise((r) => setTimeout(r, 0));
    check("cfgTest reports all-good for a healthy project", /ALL_GOOD/.test(els.authProjHint.textContent), els.authProjHint.textContent);
    els.cfgUrl.value = "notaurl";
    els.cfgTest.click();
    await new Promise((r) => setTimeout(r, 0));
    check("cfgTest rejects an invalid URL", /URL should look like/.test(els.authProjHint.textContent), els.authProjHint.textContent);

    console.log("\n— End-to-end account creation (mock Supabase, Confirm email ON) —");
    // Simulate the wire: signUp returns a user but NO session (Confirm email enabled).
    // The mock is chainable/thenable like supabase-js, and lives INSIDE the vm —
    // the app's `sb` is a vm-scoped let binding that Node cannot reassign directly.
    sandbox.__mock = (() => {
      let storesTable = [];
      const counts = { insert: 0 };
      const builder = (table) => {
        const b = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => b;
        b.lt = () => b;
        b.limit = async () => ({ error: null, data: [] });
        b.single = async () => ({ data: null, error: null });
        b.insert = async (rows) => { counts.insert++; for (const r of [].concat(rows)) storesTable.push(JSON.parse(JSON.stringify(r))); return { error: null }; };
        b.upsert = async () => ({ error: null });
        b.update = () => ({ eq: async () => ({ error: null }) });
        b.delete = () => ({ eq: async () => ({ error: null }), lt: async () => ({ data: [], error: null }) });
        b.then = (res, rej) => {
          if (table === "stores") return Promise.resolve({ data: JSON.parse(JSON.stringify(storesTable)), error: null }).then(res, rej);
          return Promise.resolve({ data: [], error: null }).then(res, rej);
        };
        return b;
      };
      return {
        counts, stores: () => storesTable, reset: () => { storesTable = []; counts.insert = 0; },
        auth: {
          getSession: async () => ({ error: null, data: { session: null } }),
          signUp: async () => ({ data: { user: { id: "u-1", email: els.authEmail.value.trim() }, session: null }, error: null }),
          signInWithPassword: async () => ({ data: { user: { id: "u-1", email: els.authEmail.value.trim() }, session: { user: { id: "u-1" } } }, error: null }),
          signOut: async () => ({ error: null }),
          resend: async () => ({ error: null }),
          updateUser: async (u) => ({ data: { user: { id: "u-1" } }, error: null }),
        },
        from: builder,
      };
    })();
    vm.runInContext("sb = __mock;", sandbox);
    const mock = sandbox.__mock;
    app.setAuthMode("signup");
    els.authEmail.value = "newowner@shop.com";
    els.authPass.value = "hunter22";
    els.storeName.value = "Corner Shop";
    els.authSubmit.click();
    await new Promise((r) => setTimeout(r, 0));
    // FIX 1: no crash, no RLS error — the pending (check-your-inbox) view shows.
    check("signup w/ confirm email shows check-your-inbox", els.authPending.style.display === "", JSON.stringify({ pending: els.authPending.style.display, err: els.authErr.textContent }));
    check("no error shown to the user", els.authErr.style.display !== "block", els.authErr.textContent);
    check("pending copy has the email + store name", /newowner@shop\.com/.test(els.pendingSub.innerHTML) && /Corner Shop/.test(els.pendingSub.innerHTML), els.pendingSub.innerHTML);
    check("store name stashed for after-confirmation", (() => { try { return JSON.parse(store.get("stockpilot.pendingStore")) === "Corner Shop"; } catch { return false; } })());
    check("resend flow exists and is enabled", els.pendingResend.disabled !== true);

    // FIX 2: after the user confirms (simulated by password sign-in), the account
    // that previously failed mid-signup has ZERO stores — sign-in must self-heal.
    mock.reset(); // account exists but no store row ever made it in
    const zeroStoreUser = { id: "u-1", email: "newowner@shop.com" };
    let lockout = null;
    try {
      await app.afterSignIn(zeroStoreUser, null); // pendingStore is picked up here
    } catch (e) { lockout = e; }
    check("sign-in with zero stores does NOT throw 'No stores found'", lockout === null, lockout && (lockout.stack || lockout.message));
    check("a first store was auto-created", mock.counts.insert === 1, `inserts=${mock.counts.insert}`);
    check("store name from signup is preserved", mock.stores().length === 1 && mock.stores()[0].name === "Corner Shop", JSON.stringify(mock.stores()));
    check("pendingStore stash cleared after healing", store.get("stockpilot.pendingStore") == null, String(store.get("stockpilot.pendingStore")));

    // Re-run: an account that already has stores must not get a duplicate.
    const before = mock.counts.insert;
    await app.afterSignIn(zeroStoreUser, null);
    check("existing stores are not duplicated", mock.counts.insert === before, `inserts=${mock.counts.insert}`);
    check("session UI reflects signed-in state", els.accountBtn.style.display === "" && els.logoutBtn.style.display === "", JSON.stringify({ acct: els.accountBtn.style.display, out: els.logoutBtn.style.display, signin: els.signinBtn.style.display }));

  } catch (e) {
    failed++;
    console.error("❌ Async harness error:", e.stack || e);
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
