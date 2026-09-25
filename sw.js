// StockPilot service worker — offline app shell.
// Strategy:
//   • Navigations (page loads): network-first, fall back to the cached app shell
//     so updates arrive immediately and the app still opens with no network.
//   • Same-origin static assets (icons, manifest): cache-first (immutable-ish).
//   • Cross-origin requests (Supabase API, jsdelivr CDN) are NEVER intercepted —
//     they must hit the network, and no auth/data responses are stored in a cache.
"use strict";

const VERSION = "stockpilot-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  // Liquid glass (vendored, MIT — see vendor/liquid-glass/LICENSE)
  "./vendor/liquid-glass/container.js",
  "./vendor/liquid-glass/stockpilot-liquid-glass.js",
  "./vendor/liquid-glass/glass.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase / CDN pass through untouched

  // Navigations: network-first with offline fallback to the app shell.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Other same-origin assets: cache-first, refresh the copy in the background.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
