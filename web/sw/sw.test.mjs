// The service worker, run in a stand-in for its global scope: a returning visitor gets the first page
// of the latest deploy from the network (with its headers); offline, the precached one; files of the
// previous version stay available to a page still open with them.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');

/** CacheStorage in memory. */
function cacheStorage() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      addAll: async (urls) => {
        for (const u of urls) store.set(u, new Response(`cached ${name} ${u}`, { headers: { 'x-from': name } }));
      },
      put: async (key, response) => void store.set(typeof key === 'string' ? key : new URL(key.url).pathname, response),
      match: async (key) => store.get(typeof key === 'string' ? key : new URL(key.url).pathname)?.clone(),
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (key, options = {}) => {
      const names = options.cacheName ? [options.cacheName] : [...stores.keys()];
      for (const name of names) {
        const hit = await (await open(name)).match(key);
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

/** Loads one version of the worker into the shared cache storage; returns its event dispatcher. */
function worker(version, caches, network) {
  const listeners = {};
  const self = { addEventListener: (type, fn) => void (listeners[type] = fn), skipWaiting: async () => undefined, clients: { claim: async () => undefined }, location: new URL('https://app.example/') };
  const source = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(['/', '/index.html', `/assets/app-${version}.js`]));
  new Function('self', 'caches', 'fetch', 'Response', source)(self, caches, network, Response);
  const run = async (type, event) => {
    let waited;
    let responded;
    listeners[type]({ ...event, waitUntil: (p) => void (waited = p), respondWith: (p) => void (responded = p) });
    await waited;
    return responded;
  };
  return {
    install: () => run('install', {}),
    activate: () => run('activate', {}),
    fetch: (path, mode = 'no-cors') => run('fetch', { request: { method: 'GET', url: `https://app.example${path}`, mode } }),
  };
}

describe('service worker', () => {
  it('a returning visitor gets the latest first page from the network, with its headers', async () => {
    const caches = cacheStorage();
    const network = async () => new Response('<html>new deploy</html>', { headers: { 'content-security-policy': "connect-src 'self' https://www.google.com/recaptcha/" } });
    const v1 = worker('v1', caches, network);
    await v1.install();
    await v1.activate();
    const page = await v1.fetch('/', 'navigate');
    expect(await page.text()).toBe('<html>new deploy</html>');
    expect(page.headers.get('content-security-policy')).toContain('https://www.google.com/recaptcha/');
  });

  it('offline, or when the server fails, the precached first page', async () => {
    const caches = cacheStorage();
    const v1 = worker('v1', caches, async () => {
      throw new TypeError('Failed to fetch');
    });
    await v1.install();
    await v1.activate();
    expect(await (await v1.fetch('/', 'navigate')).text()).toBe('cached silhouette-shell-v1 /index.html');
    const failing = worker('v1', caches, async () => new Response('down', { status: 503 }));
    expect(await (await failing.fetch('/#/doc', 'navigate')).text()).toBe('cached silhouette-shell-v1 /index.html');
  });

  it('after a deploy the new worker keeps the previous version for pages still open with it, and drops older ones', async () => {
    const caches = cacheStorage();
    const missing = async () => new Response('not found', { status: 404 });
    for (const v of ['v1', 'v2', 'v3']) {
      const w = worker(v, caches, missing);
      await w.install();
      await w.activate();
      await new Promise((r) => setTimeout(r, 5));
    }
    expect([...caches.stores.keys()].sort()).toEqual(['silhouette-shell-v2', 'silhouette-shell-v3']);
    const v3 = worker('v3', caches, missing);
    // A file of the previous version, asked for by a page that is still open with it.
    expect(await (await v3.fetch('/assets/app-v2.js')).text()).toBe('cached silhouette-shell-v2 /assets/app-v2.js');
    expect(await (await v3.fetch('/assets/app-v3.js')).text()).toBe('cached silhouette-shell-v3 /assets/app-v3.js');
  });

  it('never touches another origin or a request that is not GET', async () => {
    const caches = cacheStorage();
    const v1 = worker('v1', caches, async () => new Response('x'));
    await v1.install();
    expect(await worker('v1', caches, async () => new Response('x')).fetch('/x', 'cors')).toBeDefined();
    const listeners = {};
    const self = { addEventListener: (t, f) => void (listeners[t] = f), location: new URL('https://app.example/') };
    new Function('self', 'caches', 'fetch', 'Response', template.replace('__VERSION__', 'v').replace('__PRECACHE__', '[]'))(self, caches, async () => new Response(''), Response);
    let responded = false;
    listeners.fetch({ request: { method: 'GET', url: 'https://firebasevertexai.googleapis.com/x', mode: 'cors' }, respondWith: () => (responded = true) });
    listeners.fetch({ request: { method: 'POST', url: 'https://app.example/x', mode: 'cors' }, respondWith: () => (responded = true) });
    expect(responded).toBe(false);
  });
});
