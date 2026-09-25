// Minimal service worker — just enough for installability (Add to Home
// Screen) + a basic offline fallback for the app shell. Deliberately does
// NOT cache anything under /api/ — this whole app's design this session has
// been about never showing stale/misleading market data (see gold-refresh.ts,
// the RSI/EMA pages, etc.), and a naive PWA cache showing yesterday's gold
// price would undo all of that. API requests always go straight to the
// network, full stop.
//
// Bump this on every deploy that changes cached files so old clients pick up
// the new shell instead of getting stuck on stale JS/CSS after a deploy.
const CACHE_VERSION = "v2"; // v2: added pull-to-refresh.js + pwa.js to the shell
const CACHE_NAME = `aureum-shell-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/styles.css",
  "/sidebar.js",
  "/chat-fab.js",
  "/market-hours.js",
  "/pwa.js",
  "/pull-to-refresh.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls, cross-origin requests (fonts/CDN), or
  // non-GET requests — network only, no service-worker involvement at all.
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  // Network-first for everything else (HTML/JS/CSS/icons) so a fresh deploy
  // is always what's shown while online — cache is purely an offline
  // fallback, never a way to silently serve outdated app code.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
