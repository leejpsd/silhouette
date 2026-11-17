// Records every cross-origin http(s) request the app makes into the outbound ledger: before it is
// sent ("attempted"), then "sent" with the HTTP status once a response arrives, or "failed".
// For Firebase AI Logic it keeps the complete request body, so "Show exactly what was sent" can
// display it. Credentials are never kept: the SDK sends the API key and the App Check token as
// headers, which are not recorded; query strings are dropped; App Check request bodies (debug
// token or attestation) are never stored.

import { markBlocked, markFailed, markSent, recordAttempt, type OutboundChannel } from './outbound';

export const AI_LOGIC_HOST = 'firebasevertexai.googleapis.com';
export const APP_CHECK_HOST = 'content-firebaseappcheck.googleapis.com';

/** reCAPTCHA Enterprise, which App Check uses to show that requests come from the real app. */
export function isRecaptcha(url: URL): boolean {
  return (
    ((url.hostname === 'www.google.com' || url.hostname === 'recaptcha.google.com') && url.pathname.startsWith('/recaptcha/')) ||
    (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/recaptcha/'))
  );
}

interface GeminiBody {
  readonly contents?: readonly { readonly parts?: readonly { readonly text?: unknown; readonly inlineData?: unknown }[] }[];
  readonly systemInstruction?: { readonly parts?: readonly { readonly text?: unknown }[] };
}

/** Text parts of a generateContent request body, in order (system instruction first). */
export function aiPayloadText(body: string): { text: string; hasInlineData: boolean } {
  try {
    const json = JSON.parse(body) as GeminiBody;
    const texts: string[] = [];
    let hasInlineData = false;
    for (const part of json.systemInstruction?.parts ?? []) if (typeof part.text === 'string') texts.push(part.text);
    for (const content of json.contents ?? []) {
      for (const part of content.parts ?? []) {
        if (typeof part.text === 'string') texts.push(part.text);
        if (part.inlineData !== undefined) hasInlineData = true;
      }
    }
    return { text: texts.join('\n\n'), hasInlineData };
  } catch {
    return { text: '', hasInlineData: false };
  }
}

/**
 * What each model task sends, keyed by its system instruction (the tasks register it when they build
 * a model). A request is described by the task whose system instruction it carries, so concurrent
 * requests of different tasks are never mixed up.
 */
const AI_REQUEST_FIELDS = new Map<string, readonly string[]>();

export function describeAiRequests(systemInstruction: string, fields: readonly string[]): void {
  AI_REQUEST_FIELDS.set(systemInstruction, fields);
}

/** Requests to a model that carries no system instruction (speech), described by the model name. */
const AI_MODEL_FIELDS = new Map<string, readonly string[]>();

export function describeAiModel(model: string, fields: readonly string[]): void {
  AI_MODEL_FIELDS.set(model, fields);
}

function systemInstructionOf(body: string): string | undefined {
  try {
    const json = JSON.parse(body) as GeminiBody;
    const texts = (json.systemInstruction?.parts ?? []).map((p) => p.text).filter((t): t is string => typeof t === 'string');
    return texts.length > 0 ? texts.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

/** The model named in a request path such as /v1beta/projects/p/models/gemini-3.5-flash-lite:generateContent. */
export const modelOf = (path: string): string | undefined => /\/models\/([^/:]+)/.exec(path)?.[1];

export function classify(url: URL, body: string | null): { channel: OutboundChannel; fields: string[]; body?: string | undefined; model?: string | undefined } {
  if (url.hostname === AI_LOGIC_HOST) {
    const { hasInlineData } = aiPayloadText(body ?? '');
    const system = body === null ? undefined : systemInstructionOf(body);
    const model = modelOf(url.pathname);
    const fields = [
      ...((system !== undefined ? AI_REQUEST_FIELDS.get(system) : undefined) ??
        (model !== undefined ? AI_MODEL_FIELDS.get(model) : undefined) ?? ['model-request']),
    ];
    if (hasInlineData) fields.push('inline-file');
    // The body exactly as sent: model request bodies carry no credentials (the API key and the App
    // Check token travel in headers, which are never recorded).
    return { channel: 'ai-cloud', fields, body: body ?? undefined, model };
  }
  if (url.hostname === APP_CHECK_HOST) return { channel: 'app-check', fields: ['app-check-token-request'] };
  if (isRecaptcha(url)) return { channel: 'recaptcha', fields: ['recaptcha-check'] };
  if (url.hostname.endsWith('firestore.googleapis.com')) return { channel: 'firestore', fields: ['firestore'] };
  if (url.hostname.endsWith('firebaseremoteconfig.googleapis.com')) return { channel: 'remote-config', fields: ['remote-config'] };
  if (url.hostname.endsWith('firebaseinstallations.googleapis.com')) return { channel: 'remote-config', fields: ['installation'] };
  // Never a bare host name: the record says it is another request and shows where it went.
  return { channel: 'other', fields: ['other-request'] };
}

/**
 * Request bodies the app showed before sending (tasks/requestBody()). When the SDK sends a request
 * with the same content, these exact bytes are sent instead of the SDK's own serialization, so what
 * was shown is byte for byte what leaves. A request that carries a shown system instruction but
 * different content is refused: it would not be the request the person agreed to.
 */
const expectedBodies: { body: string; parsed: unknown; system: string | undefined }[] = [];

export function expectRequestBody(body: string): () => void {
  const entry = { body, parsed: JSON.parse(body) as unknown, system: systemInstructionOf(body) };
  expectedBodies.push(entry);
  return () => {
    const i = expectedBodies.indexOf(entry);
    if (i !== -1) expectedBodies.splice(i, 1);
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Cloud requests a cloud-capable task built itself (document pointer extraction), allowed by their
 * system instruction while the task waits for the answer. ONLY_ON_DEVICE tasks never register one.
 */
const permittedSystems: string[] = [];

export function permitCloudRequest(systemInstruction: string): () => void {
  permittedSystems.push(systemInstruction);
  return () => {
    const i = permittedSystems.indexOf(systemInstruction);
    if (i !== -1) permittedSystems.splice(i, 1);
  };
}

/**
 * The bytes to send for a request to Firebase AI Logic, or null when it must not leave:
 * - the body a task showed before sending (byte for byte), when it is the same request;
 * - the SDK's own body, when a cloud-capable task permitted requests with this system instruction;
 * - otherwise nothing. A request no cloud-capable task registered immediately before (for example one
 *   the SDK sends on its own for an ONLY_ON_DEVICE task when the browser has no on-device model) is
 *   blocked, and so is a request that differs from the one shown.
 */
export function bodyToSend(body: string | null): string | null {
  if (body === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const match = expectedBodies.find((e) => sameJson(e.parsed, parsed));
  if (match) return match.body;
  const system = systemInstructionOf(body);
  if (system !== undefined && expectedBodies.some((e) => e.system === system)) return null;
  return system !== undefined && permittedSystems.includes(system) ? body : null;
}

/** Why a request to Firebase AI Logic was stopped before it left (shown in the record). */
export const BLOCKED_REASON = 'Blocked before sending: no cloud request was expected';
/** Why a request to Firebase AI Logic was stopped: App Check had no token for it (it never left). */
export const NO_APP_CHECK_TOKEN = 'Not sent: App Check could not confirm this app, so the request was stopped before it left';

/**
 * The App Check token a request to Firebase AI Logic carries. When App Check cannot get a token, the
 * SDK still sends the request, with a placeholder token (base64 of an error, not a JWT) that the
 * service will refuse. Such a request carries the silhouette for nothing, so it is stopped here.
 */
export function lacksAppCheckToken(headers: HeadersInit | undefined): boolean {
  let token: string | null = null;
  try {
    token = new Headers(headers).get('X-Firebase-AppCheck');
  } catch {
    return false;
  }
  // No App Check on this build (tests, or a build without a site key): nothing to check.
  if (token === null) return false;
  return !/^[\w-]+\.[\w-]+\.[\w-]*$/.test(token);
}

/** Why a request was refused by the browser's content security policy (it never left the browser). */
export const REFUSED_BY_BROWSER = 'Refused by the browser: this site does not allow it';

/** Called once, when the first request to Firebase AI Logic in the cloud is about to leave. */
const firstCloudRequest = new Set<() => void>();
let cloudRequestSeen = false;

export function onFirstCloudRequest(listener: () => void): void {
  if (cloudRequestSeen) listener();
  else firstCloudRequest.add(listener);
}

/** After "Delete everything": the next session starts as if nothing had been sent. */
export function resetCloudRequests(): void {
  cloudRequestSeen = false;
  firstCloudRequest.clear();
}

let installed = false;

/** Recent requests by host and path, so a security-policy refusal reported later can be matched to its entry. */
const recent: { id: string; key: string; at: number }[] = [];
const keyOf = (url: URL) => `${url.hostname}${url.pathname}`;

function remember(id: string, url: URL): void {
  recent.push({ id, key: keyOf(url), at: Date.now() });
  if (recent.length > 50) recent.shift();
}

/**
 * The browser refused a request under this site's content security policy: it never left the browser.
 * The matching entry (the latest with that host and path, within a few seconds) is marked blocked,
 * whatever the request's own error said.
 */
export function noteRefused(blockedUri: string, now: number = Date.now()): void {
  let url: URL;
  try {
    url = new URL(blockedUri);
  } catch {
    return;
  }
  const key = keyOf(url);
  for (let i = recent.length - 1; i >= 0; i--) {
    const r = recent[i] as { id: string; key: string; at: number };
    if (r.key === key && now - r.at < 10_000) {
      markBlocked(r.id, REFUSED_BY_BROWSER);
      recent.splice(i, 1);
      return;
    }
  }
  // A script or frame the browser refused before any request was made: listed as refused.
  if ((url.protocol === 'https:' || url.protocol === 'http:') && typeof location !== 'undefined' && url.origin !== location.origin) {
    const info = classify(url, null);
    const id = recordAttempt({ channel: info.channel, fields: info.fields, destination: url.hostname, path: url.pathname, at: now, bytes: 0 });
    markBlocked(id, REFUSED_BY_BROWSER);
  }
}

/** Records a cross-origin request; returns its entry id, or null when it is not one. */
function recordRequest(url: URL, body: string | null): string {
  const info = classify(url, body);
  if (info.channel === 'ai-cloud' && !cloudRequestSeen) {
    cloudRequestSeen = true;
    for (const l of firstCloudRequest) queueMicrotask(l);
    firstCloudRequest.clear();
  }
  const id = recordAttempt({
    channel: info.channel,
    fields: info.fields,
    body: info.body,
    model: info.model,
    destination: url.hostname,
    path: url.pathname,
    at: Date.now(),
    bytes: body?.length ?? 0,
  });
  remember(id, url);
  return id;
}

interface MonitorTarget {
  fetch: typeof fetch;
  location: Location;
  XMLHttpRequest?: typeof XMLHttpRequest;
  document?: Pick<Document, 'addEventListener'>;
  PerformanceObserver?: typeof PerformanceObserver;
}

export function installNetMonitor(target: MonitorTarget = window): void {
  if (installed) return;
  installed = true;
  const crossOrigin = (href: string): URL | null => {
    try {
      const url = new URL(href, target.location.href);
      // data: and blob: URLs are read locally (the SDK uses them to decode images); never network.
      return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== target.location.origin ? url : null;
    } catch {
      return null;
    }
  };
  const original = target.fetch.bind(target);
  target.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let id: string | null = null;
    try {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = crossOrigin(href);
      if (url) {
        let body = typeof init?.body === 'string' ? init.body : null;
        if (url.hostname === AI_LOGIC_HOST) {
          if (lacksAppCheckToken(init?.headers)) {
            const info = classify(url, null);
            const blocked = recordAttempt({ channel: info.channel, fields: info.fields, destination: url.hostname, path: url.pathname, at: Date.now(), bytes: 0 });
            markBlocked(blocked, NO_APP_CHECK_TOKEN);
            return Promise.reject(new Error(NO_APP_CHECK_TOKEN));
          }
          const send = bodyToSend(body);
          if (send === null) {
            // Recorded as blocked: it never left this device.
            const info = classify(url, null);
            const blocked = recordAttempt({ channel: info.channel, fields: info.fields, destination: url.hostname, path: url.pathname, at: Date.now(), bytes: 0 });
            markBlocked(blocked, BLOCKED_REASON);
            return Promise.reject(new Error(BLOCKED_REASON));
          }
          if (send !== body) {
            body = send;
            init = { ...init, body: send };
          }
        }
        id = recordRequest(url, body);
      }
    } catch {
      // Never block a request because of the monitor.
    }
    const request = original(input, init);
    if (id === null) return request;
    const entryId = id;
    return request.then(
      (response) => {
        if (response.ok) markSent(entryId, response.status);
        else markFailed(entryId, `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`, response.status);
        return response;
      },
      (error: unknown) => {
        markFailed(entryId, error instanceof Error ? error.message : String(error));
        throw error;
      },
    );
  };

  // XMLHttpRequest, which some scripts (reCAPTCHA) use instead of fetch.
  const Xhr = target.XMLHttpRequest;
  if (Xhr) {
    const open = Xhr.prototype.open;
    const send = Xhr.prototype.send;
    const urls = new WeakMap<XMLHttpRequest, URL>();
    Xhr.prototype.open = function (this: XMLHttpRequest, method: string, href: string | URL, ...rest: unknown[]) {
      const url = crossOrigin(String(href));
      if (url) urls.set(this, url);
      else urls.delete(this);
      return (open as (...a: unknown[]) => void).call(this, method, href, ...rest);
    } as typeof Xhr.prototype.open;
    Xhr.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const url = urls.get(this);
      if (url) {
        try {
          const id = recordRequest(url, typeof body === 'string' && url.hostname === AI_LOGIC_HOST ? body : null);
          this.addEventListener('loadend', () => {
            if (this.status === 0) markFailed(id, 'Not completed');
            else if (this.status >= 200 && this.status < 300) markSent(id, this.status);
            else markFailed(id, `HTTP ${this.status}${this.statusText ? ` ${this.statusText}` : ''}`, this.status);
          });
        } catch {
          // Never block a request because of the monitor.
        }
      }
      return send.call(this, body);
    };
  }

  // Scripts and frames another service loads into the page (reCAPTCHA's script and its check frame):
  // recorded once they have loaded. Requests made inside such a frame belong to that service and are
  // not visible to this page.
  const Observer = target.PerformanceObserver;
  if (Observer) {
    try {
      new Observer((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
          if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'beacon') continue;
          const url = crossOrigin(entry.name);
          if (!url) continue;
          const id = recordRequest(url, null);
          const status = (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus ?? 0;
          if (status === 0 || (status >= 200 && status < 300)) markSent(id, status);
          else markFailed(id, `HTTP ${status}`, status);
        }
      }).observe({ type: 'resource', buffered: true });
    } catch {
      // Older browsers: script and frame loads are not listed.
    }
  }

  // A request this site's content security policy refused never left the browser.
  target.document?.addEventListener('securitypolicyviolation', (event) => {
    const e = event as SecurityPolicyViolationEvent;
    if (/^(connect|script|frame|child|img|style|font|media|worker|manifest)-src/.test(e.effectiveDirective || e.violatedDirective)) noteRefused(e.blockedURI);
  });
}
