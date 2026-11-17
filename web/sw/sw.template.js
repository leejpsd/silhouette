// Silhouette service worker (generated at build time from web/sw/sw.template.js).
// Precaches the app shell so Quick Check, verdicts and the bundled sample work offline. Same-origin
// GET only: requests to any other origin are not intercepted, cached or modified.
//
// The first page is fetched from the network whenever the network answers, so a visitor gets the
// page of the latest deploy with its own headers (the content security policy among them); the
// precached copy is used only when the network does not answer. Other files (hashed, immutable) come
// from the cache. A new worker takes over at once (skipWaiting, clients.claim) and keeps the previous
// version's files, so a page that is still open with them can finish loading what it needs.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const PREFIX = 'silhouette-shell-';
const CACHE = `${PREFIX}${VERSION}`;
/** When this version was installed, kept in its own cache to order versions. */
const INSTALLED = '/__silhouette-installed';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).then(() => cache.put(INSTALLED, new Response(String(Date.now())))))
      .then(() => self.skipWaiting()),
  );
});

/** Shell caches other than this version's, newest first. */
async function olderCaches() {
  const names = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
  const dated = await Promise.all(
    names.map(async (name) => {
      const hit = await (await caches.open(name)).match(INSTALLED);
      return { name, at: hit ? Number(await hit.text()) || 0 : 0 };
    }),
  );
  return dated.sort((a, b) => b.at - a.at).map((d) => d.name);
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    olderCaches()
      // The previous version stays for pages still open with it; anything older goes.
      .then((older) => Promise.all(older.slice(1).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** The precached first page of this version, else of the previous one. */
async function cachedShell() {
  for (const key of ['/index.html', '/']) {
    const hit = await caches.match(key, { cacheName: CACHE, ignoreVary: true });
    if (hit) return hit;
  }
  return caches.match('/index.html', { ignoreVary: true });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Network first: the latest page and its headers. The router lives in the URL hash, so every
    // navigation is the first page; offline, the precached one.
    event.respondWith(
      fetch(request)
        .then(async (response) => (response.status >= 500 ? ((await cachedShell()) ?? response) : response))
        .catch(async () => (await cachedShell()) ?? Response.error()),
    );
    return;
  }
  // Hashed files: this version's cache, then any kept version (a page still open with it), then the network.
  event.respondWith(
    caches
      .match(request, { cacheName: CACHE, ignoreVary: true })
      .then((hit) => hit ?? caches.match(request, { ignoreVary: true }))
      .then((hit) => hit ?? fetch(request)),
  );
});
