// One-shot patcher for index.html — wires the remaining auto-prune hooks.
// Every `old` must occur exactly once or the script aborts without writing.
// Run from project root: node scripts/patch-prune.js
const fs = require("fs");

const file = "index.html";
let src = fs.readFileSync(file, "utf8");
const orig = src;

const patches = [];
const P = (oldStr, newStr, label) => patches.push({ label, oldStr, newStr });

// 1) afterSignIn: prune after the first store is activated.
P(
`        hideAuth();
        applySessionUI();
        applyActiveStore();
`,
`        hideAuth();
        applySessionUI();
        applyActiveStore();
        runAutoPrune(); // prune sales older than 6 months (state + local caches + cloud)
`,
"afterSignIn hook",
);

// 2) offlineBtn: prune when entering offline mode.
P(
`      $("offlineBtn").addEventListener("click", () => {
        hideAuth();
        applySessionUI();
        bootOffline();
`,
`      $("offlineBtn").addEventListener("click", () => {
        hideAuth();
        applySessionUI();
        bootOffline();
        runAutoPrune(); // prune sales older than 6 months (state + local caches)
`,
"offlineBtn hook",
);

// 3) handleCommand: manual cleanup command dispatched before ROUTES so
//    "delete old data" is never swallowed by the "delete pens" route.
P(
`        for (const route of ROUTES) {
`,
`        // Manual cleanup command - dispatched before ROUTES so "delete old data"
        // is never swallowed by the "delete pens" route.
        if (/^(?:clean|clear|purge|wipe|delete)\\s+(?:out\\s+)?(?:old|expired)\\s+(?:data|sales|history|records|logs)$/.test(t)) {
          return cleanOldDataReply();
        }
        for (const route of ROUTES) {
`,
"handleCommand dispatch",
);

// 4) helpReply: list the cleanup command first.
P(
`      function helpReply() {
        return ["Here's what I can do:", ...ROUTES.filter((r) => r.help).map((r) => r.help)].join("\\n");
      }
`,
`      function helpReply() {
        return ["Here's what I can do:", '• "clean old data" - delete sales older than 6 months (auto-cleanup also runs daily)', ...ROUTES.filter((r) => r.help).map((r) => r.help)].join("\\n");
      }
`,
"helpReply entry",
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
