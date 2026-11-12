// Silhouette service worker (generated at build time from web/sw/sw.template.js).
// Precaches the app shell so Quick Check and verdicts work offline. Same-origin GET only:
// requests to any other origin are not intercepted, cached or modified.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `silhouette-shell-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('silhouette-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // App shell: the router lives in the URL hash, so every navigation is index.html.
    event.respondWith(
      caches
        .match('/index.html', { cacheName: CACHE, ignoreVary: true })
        .then((hit) => hit ?? caches.match('/', { cacheName: CACHE, ignoreVary: true }))
        .then((hit) => hit ?? fetch(request)),
    );
    return;
  }
  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreVary: true }).then((hit) => hit ?? fetch(request)));
});
