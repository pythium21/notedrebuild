// Minimal app-shell cache. No offline writes/queueing — that's a future
// decision (see .claude/DECISIONS.md once populated). This only lets the
// installed PWA repaint instantly while the network round-trips.

const CACHE_NAME = 'my-os-shell-v3';
const SHELL_ASSETS = ['/', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Navigations (the HTML document) go network-first so app updates are
  // picked up immediately instead of being pinned to whatever was cached
  // at install time; cache is only a fallback when offline. Unfiltered by
  // SHELL_ASSETS so this covers every route, not just '/' — Next.js App
  // Router serves the same HTML shell everywhere and the client-side
  // router handles the actual page, so every successful navigation
  // response is cached under the '/' key and the offline fallback always
  // serves that cached shell regardless of which route was requested.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  const url = new URL(event.request.url);
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
