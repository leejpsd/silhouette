// reCAPTCHA Enterprise and App Check, faked with the shapes of the requests they make in production
// (recorded from the hosted app in Chrome): the explicit-render loader from www.google.com, the release
// script from www.gstatic.com, the invisible check frame, the `clr` and `reload` calls, then App Check's
// token exchange. Nothing reaches Google: every request is answered here.
import type { BrowserContext, Page } from '@playwright/test';

export const SITE_KEY = 'e2e-site-key';
/** Shaped like a real App Check token (a JWT); the app stops requests whose token is not. */
export const APP_CHECK_TOKEN = 'eyJlMmUiOjF9.eyJhcHAiOiJlMmUifQ.e2e-signature';

/** The release script: grecaptcha.enterprise with ready/render/execute, as App Check uses it. */
const RELEASE_SCRIPT = `
(() => {
  const widgets = [];
  const call = (path) => fetch('https://www.google.com/recaptcha/enterprise/' + path + '?k=${SITE_KEY}', { method: 'POST', body: 'v=e2e', credentials: 'include' });
  window.grecaptcha = window.grecaptcha || {};
  // The same object the loader made: App Check keeps a reference to it.
  const enterprise = (window.grecaptcha.enterprise = window.grecaptcha.enterprise || {});
  const queued = enterprise.__queue || [];
  Object.assign(enterprise, {
    ready: (cb) => setTimeout(cb, 0),
    render: (container, params) => {
      const host = typeof container === 'string' ? document.getElementById(container) : container;
      const frame = document.createElement('iframe');
      frame.src = 'https://www.google.com/recaptcha/enterprise/anchor?ar=1&k=${SITE_KEY}&size=invisible';
      frame.title = 'reCAPTCHA';
      (host || document.body).appendChild(frame);
      widgets.push(params);
      return widgets.length - 1;
    },
    execute: async (id) => {
      await call('clr');
      await call('reload');
      const params = widgets[id];
      if (params && params.callback) params.callback('e2e-recaptcha-token');
      return 'e2e-recaptcha-token';
    },
  });
  for (const cb of queued) setTimeout(cb, 0);
})();
`;

/**
 * The loader (enterprise.js?render=explicit), as the real one: it defines grecaptcha.enterprise at once
 * with a ready() queue, then adds the release script, which fills in render() and execute().
 */
const LOADER = `
(() => {
  const queue = [];
  window.grecaptcha = window.grecaptcha || {};
  window.grecaptcha.enterprise = window.grecaptcha.enterprise || { ready: (cb) => queue.push(cb), __queue: queue };
  const s = document.createElement('script');
  s.src = 'https://www.gstatic.com/recaptcha/releases/e2e/recaptcha__en.js';
  s.async = true;
  document.head.appendChild(s);
})();
`;

export interface RecaptchaFake {
  /** URLs of every reCAPTCHA and App Check request, in order. */
  readonly requests: string[];
  /** App Check token exchanges that were answered, with their status. */
  readonly exchanges: number[];
}

/**
 * Answers reCAPTCHA and App Check. `exchangeStatuses` gives the HTTP status of each token exchange in
 * turn (the last one repeats): for example [400, 200] for a first exchange that fails.
 */
export async function fakeRecaptcha(context: BrowserContext, page: Page, exchangeStatuses: number[] = [200]): Promise<RecaptchaFake> {
  const fake = { requests: [] as string[], exchanges: [] as number[] };
  context.on('request', (r) => {
    const url = r.url();
    if (url.includes('/recaptcha/') || url.includes('firebaseappcheck')) fake.requests.push(url);
  });
  await context.route('https://www.google.com/recaptcha/enterprise.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: LOADER }));
  await context.route('https://www.gstatic.com/recaptcha/releases/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: RELEASE_SCRIPT }));
  await context.route('https://www.google.com/recaptcha/enterprise/anchor*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>reCAPTCHA</title>' }));
  await context.route(/https:\/\/www\.google\.com\/recaptcha\/enterprise\/(clr|reload)/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: ')]}\'\n["rresp","e2e"]' }));
  await page.route('https://content-firebaseappcheck.googleapis.com/**', (route) => {
    const status = exchangeStatuses[Math.min(fake.exchanges.length, exchangeStatuses.length - 1)] as number;
    fake.exchanges.push(status);
    return status === 200
      ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ token: APP_CHECK_TOKEN, ttl: '3600s' }) })
      : route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: status, message: 'Invalid reCAPTCHA token.', status: 'INVALID_ARGUMENT' } }) });
  });
  return fake;
}

/** The policy from hosting/firebase.hosting.json on every page this test server returns. */
export async function serveWithPolicy(page: Page, policy: string, origin: string): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__reportCsp', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => void (window as unknown as { __reportCsp: (v: string) => void }).__reportCsp(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.route((url) => url.origin === origin, async (route) => {
    const response = await route.fetch();
    const isDocument = route.request().resourceType() === 'document';
    await route.fulfill({ response, headers: isDocument ? { ...response.headers(), 'content-security-policy': policy.replace('upgrade-insecure-requests', '') } : response.headers() });
  });
  return violations;
}

/** Firebase AI Logic as production answers a request without a valid App Check token: 401. */
export async function requireAppCheck(page: Page): Promise<void> {
  await page.route('https://firebasevertexai.googleapis.com/**', (route) =>
    route.request().headers()['x-firebase-appcheck'] === APP_CHECK_TOKEN
      ? route.fallback()
      : route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 401, message: 'Firebase App Check token is invalid.', status: 'UNAUTHENTICATED' } }) }),
  );
}
