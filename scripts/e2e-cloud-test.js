#!/usr/bin/env node
// StockPilot end-to-end cloud test — mirrors exactly what the app does:
//   signup → create store → add item → record sale → verify rows in Supabase → cleanup.
// Run: node scripts/e2e-cloud-test.js [--keep]   (--keep leaves the test data in place)
// Credentials come from the pre-wired defaults in index.html (single source of truth).
"use strict";

const fs = require("fs");
const URL = (() => {
  const m = fs.readFileSync("index.html", "utf8").match(/DEFAULT_SB_URL = "([^"]+)"/);
  if (!m) throw new Error("DEFAULT_SB_URL not found in index.html");
  return m[1];
})();
const KEY = (() => {
  const m = fs.readFileSync("index.html", "utf8").match(/DEFAULT_SB_KEY = "([^"]+)"/);
  if (!m) throw new Error("DEFAULT_SB_KEY not found in index.html");
  return m[1];
})();

const STAMP = Date.now();
const EMAIL = process.env.E2E_EMAIL || `e2etest${STAMP}@gmail.com`;
const PASS = process.env.E2E_PASS || `E2eTest!${STAMP}x`;
const KEEP = process.argv.includes("--keep");

let failed = 0;
function check(name, ok, extra) {
  if (ok) console.log(`  ✅ ${name}`);
  else { failed++; console.error(`  ❌ ${name}${extra ? " — " + extra : ""}`); }
}
const authHeaders = (token) => ({
  apikey: KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
});

async function main() {
  console.log(`StockPilot E2E cloud test → ${URL}`);
  console.log(`Test user: ${EMAIL}${KEEP ? "  (--keep: no cleanup)" : ""}\n`);

  // ---- 1. Sign up (same call the app makes via supabase-js) ----
  console.log("— 1. Sign up new user —");
  const su = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const suBody = await su.json();
  if (su.status === 429) {
    console.error("\n⛔ BLOCKED by Supabase's built-in signup-email rate limit (free tier quota).");
    console.error("   Two ways to clear it:");
    console.error("   a) Dashboard → Authentication → Sign In / Providers → turn OFF “Confirm email”, then re-run this script (no email is sent, no limit applies), or");
    console.error("   b) wait for the hourly email quota to reset and re-run.");
    process.exit(2);
  }
  if (!su.ok) {
    console.error(`Signup failed: ${su.status} ${JSON.stringify(suBody).slice(0, 200)}`);
    process.exit(1);
  }
  const token = suBody.access_token;
  const userId = suBody.user && suBody.user.id;
  if (!token) {
    console.error("\n⛔ Signup created the user but no session was returned — “Confirm email” is ON.");
    console.error("   Dashboard → Authentication → Sign In / Providers → turn OFF “Confirm email”, then re-run.");
    process.exit(2);
  }
  check("signup returned a session token", !!token);
  check("user id present", !!userId, JSON.stringify(userId));

  const H = authHeaders(token);

  // ---- 2. Create store (RLS: row must carry our own user_id) ----
  console.log("\n— 2. Create store —");
  const storeId = `e2e-store-${STAMP}`;
  const storeRow = { id: storeId, user_id: userId, name: "E2E Test Shop", currency: "INR" };
  const sr = await fetch(`${URL}/rest/v1/stores`, { method: "POST", headers: H, body: JSON.stringify(storeRow) });
  const srBody = await sr.json();
  check("stores INSERT accepted (RLS pass)", sr.ok, `${sr.status} ${JSON.stringify(srBody).slice(0, 160)}`);

  // ---- 3. Add item ----
  console.log("\n— 3. Add item —");
  const itemId = `e2e-item-${STAMP}`;
  const itemRow = { id: itemId, user_id: userId, store_id: storeId, name: "E2E Test Pen", description: "end-to-end test item", category: "test", qty: 10, price: 20, cost: 8, threshold: 5 };
  const ir = await fetch(`${URL}/rest/v1/items`, { method: "POST", headers: H, body: JSON.stringify(itemRow) });
  const irBody = await ir.json();
  check("items INSERT accepted (RLS pass)", ir.ok, `${ir.status} ${JSON.stringify(irBody).slice(0, 160)}`);

  // ---- 4. Record a sale (same shape the app writes for “sold 3 pens”) ----
  console.log("\n— 4. Record a sale —");
  const saleId = `e2e-sale-${STAMP}`;
  const saleRow = { id: saleId, user_id: userId, store_id: storeId, item_id: itemId, name: "E2E Test Pen", qty: 3, price: 20, kind: "sale", custom: false, ts: new Date().toISOString(), date: new Date().toLocaleDateString("en-CA") };
  const slr = await fetch(`${URL}/rest/v1/sales`, { method: "POST", headers: H, body: JSON.stringify(saleRow) });
  const slrBody = await slr.json();
  check("sales INSERT accepted (RLS pass)", slr.ok, `${slr.status} ${JSON.stringify(slrBody).slice(0, 160)}`);

  // ---- 5. Verify everything is really persisted (fresh reads, filtered by id) ----
  console.log("\n— 5. Verify persisted data —");
  const readRow = async (table, id) => {
    const r = await fetch(`${URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : null;
  };
  const vStore = await readRow("stores", storeId);
  check("store persisted", !!vStore && vStore.name === "E2E Test Shop" && vStore.currency === "INR", JSON.stringify(vStore).slice(0, 160));
  const vItem = await readRow("items", itemId);
  check("item persisted (qty 10 @ 20, cost 8)", !!vItem && vItem.qty === 10 && Number(vItem.price) === 20 && Number(vItem.cost) === 8, JSON.stringify(vItem).slice(0, 160));
  const vSale = await readRow("sales", saleId);
  check("sale persisted (3 × 20, kind sale, dated today)", !!vSale && vSale.qty === 3 && Number(vSale.price) === 20 && vSale.kind === "sale" && !!vSale.date, JSON.stringify(vSale).slice(0, 160));

  // ---- 6. App-like mutation: stock edit propagates (UPDATE via RLS) ----
  console.log("\n— 6. Update item qty (app “adjust stock” path) —");
  const ur = await fetch(`${URL}/rest/v1/items?id=eq.${encodeURIComponent(itemId)}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ qty: 7 }) });
  const urBody = await ur.json();
  check("items UPDATE accepted (qty 10 → 7)", ur.ok && Array.isArray(urBody) && urBody[0] && urBody[0].qty === 7, `${ur.status} ${JSON.stringify(urBody).slice(0, 160)}`);

  // ---- 7. Cleanup: delete rows (and the test user) unless --keep ----
  if (!KEEP) {
    console.log("\n— 7. Cleanup —");
    for (const [table, id] of [["sales", saleId], ["items", itemId], ["stores", storeId]]) {
      const dr = await fetch(`${URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
      check(`${table} test row deleted`, dr.status === 204 || dr.ok, `HTTP ${dr.status}`);
    }
    const du = await fetch(`${URL}/auth/v1/user`, { method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    check("test user deleted", du.status === 204 || du.ok, `HTTP ${du.status}`);
  } else {
    console.log("\n— 7. Cleanup skipped (--keep) —");
    console.log(`   user ${EMAIL} / store ${storeId}`);
  }

  console.log(failed === 0 ? "\n🎉 E2E RESULT: ALL CHECKS PASSED — user, store, item, and sale persisted to Supabase." : `\n💥 E2E RESULT: ${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E test crashed:", e.message); process.exit(1); });
