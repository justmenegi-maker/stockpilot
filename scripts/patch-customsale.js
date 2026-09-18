// One-shot patcher: custom-price sales + "store use" chat command.
// Every `old` must occur exactly once or the script aborts without writing.
// Run from project root: node scripts/patch-customsale.js
const fs = require("fs");

const file = "index.html";
let src = fs.readFileSync(file, "utf8");
const orig = src;

const patches = [];
const P = (oldStr, newStr, label) => patches.push({ label, oldStr, newStr });

// 1) takeStock accepts a per-sale price override.
P(
  `      function takeStock(item, qty, kind) {`,
  `      function takeStock(item, qty, kind, priceOverride) {`,
  "takeStock signature",
);

// 2) Pass the override into the sales log.
P(
  `        recordMovement(item, qty, kind);`,
  `        recordMovement(item, qty, kind, priceOverride);`,
  "recordMovement call",
);

// 3) Mention the custom price in the sale reply (atomic: suffix + return together).
P(
  `        const suffix = st === "out" ? " 🚨 Now OUT of stock!" : st === "low" ? " ⚠️ Low stock!" : "";
        return \`✅ Removed \${qty} from "\${item.name}" — \${item.qty} left.\${suffix}\`;`,
  `        const suffix = st === "out" ? " 🚨 Now OUT of stock!" : st === "low" ? " ⚠️ Low stock!" : "";
        const at = priceOverride != null ? \` at \${money(priceOverride)} (custom price — list \${money(item.price ?? 0)})\` : "";
        return \`✅ Removed \${qty} from "\${item.name}" — \${item.qty} left.\${at}\${suffix}\`;`,
  "custom-price wording",
);

// 4) New chat routes: custom sale (price override) and store use.
P(
  `        {
          help: '• "sold 3 pens" — record a sale (stock −3)',`,
  [
    `        {`,
    `          help: '• "custom sale vivo y18 @ 1600" — sell at a custom price ("custom sale 2 pens @ 7" for qty)',`,
    `          match: (x, t) => t.match(/^(?:custom sale|custom sale of)\\s+(?:(\\d+)\\s+)?(.+?)\\s+(?:@|at)\\s*(?:rs\\.?|inr|₹)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:each|per unit)?$/),`,
    `          run: (m) => {`,
    `            const it = findItem(m[2]);`,
    `            if (!it) return \`🤔 No item called "\${m[2]}". Try "show inventory".\`;`,
    `            return takeStock(it, parseInt(m[1] || "1", 10), "sale", Number(m[3]));`,
    `          },`,
    `        },`,
    `        {`,
    `          help: '• "store use 2 pens" — take stock for shop use (no sale)',`,
    `          match: (x, t) => t.match(/^(?:store use|store-use|storeuse)\\s+(\\d+)\\s+(?:units?\\s+)?(?:of\\s+)?(.+?)(?:\\s+(?:for|in|on)\\s+(?:the\\s+)?(?:store|shop|display|office|internal))?$/),`,
    `          run: (m) => {`,
    `            const it = findItem(m[2]);`,
    `            if (!it) return \`🤔 No item called "\${m[2]}". Try "show inventory".\`;`,
    `            return takeStock(it, parseInt(m[1], 10), "use");`,
    `          },`,
    `        },`,
    `        {`,
    `          match: (x, t) => t.match(/^(?:store use|store-use|storeuse)\\s+(.+)$/),`,
    `          run: (m) => {`,
    `            const it = findItem(m[1]);`,
    `            if (!it) return \`🤔 No item called "\${m[1]}". Try "show inventory".\`;`,
    `            return \`How many? e.g. "store use 2 \${it.name.toLowerCase()}" — currently \${it.qty} in stock.\`;`,
    `          },`,
    `        },`,
    `        {`,
    `          help: '• "sold 3 pens" — record a sale (stock −3)',`,
  ].join("\n"),
  "chat routes",
);

// 5) Mention the new alias on the existing store-use help entry.
P(
  `help: '• "used 2 pens for store" — took from stock for the shop itself (no sale)',`,
  `help: '• "used 2 pens for store" or "store use 2 pens" — took from stock for the shop itself (no sale)',`,
  "store-use help alias",
);

let applied = 0;
for (const { label, oldStr, newStr } of patches) {
  const count = src.split(oldStr).length - 1;
  if (count !== 1) {
    console.error(`ABORT: ${label}: expected exactly 1 occurrence, found ${count}. File NOT modified.`);
    process.exit(1);
  }
  src = src.replace(oldStr, newStr);
  applied++;
  console.log(`ok: ${label}`);
}

if (applied === patches.length && src !== orig) {
  fs.writeFileSync(file, src);
  console.log(`Done: ${applied}/${patches.length} patches written to ${file}`);
} else {
  console.log("Nothing to write (all patches already applied or no change).");
}
