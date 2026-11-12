// Records every cross-origin http(s) request the app makes into the outbound ledger: before it is
// sent ("attempted"), then "sent" with the HTTP status once a response arrives, or "failed".
// For Firebase AI Logic it keeps the complete request body, so "Show exactly what was sent" can
// display it. Credentials are never kept: the SDK sends the API key and the App Check token as
// headers, which are not recorded; query strings are dropped; App Check request bodies (debug
// token or attestation) are never stored.

import { markFailed, markSent, recordAttempt, type OutboundChannel } from './outbound';

export const AI_LOGIC_HOST = 'firebasevertexai.googleapis.com';
export const APP_CHECK_HOST = 'content-firebaseappcheck.googleapis.com';

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

const SECRET_KEY = /token|apikey|api_key|^key$|secret|password|authorization/i;

/** The request body formatted for display, with any credential-like field removed. */
export function displayBody(body: string): string {
  const scrub = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(scrub);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEY.test(k)).map(([k, x]) => [k, scrub(x)]));
    }
    return v;
  };
  try {
    return JSON.stringify(scrub(JSON.parse(body)), null, 2);
  } catch {
    return body;
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
    return { channel: 'ai-cloud', fields, body: body === null ? undefined : displayBody(body), model };
  }
  if (url.hostname === APP_CHECK_HOST) return { channel: 'app-check', fields: ['app-check-token-request'] };
  if (url.hostname.endsWith('firestore.googleapis.com')) return { channel: 'firestore', fields: ['firestore'] };
  if (url.hostname.endsWith('firebaseremoteconfig.googleapis.com')) return { channel: 'remote-config', fields: ['remote-config'] };
  if (url.hostname.endsWith('firebaseinstallations.googleapis.com')) return { channel: 'remote-config', fields: ['installation'] };
  return { channel: 'other', fields: [url.hostname] };
}

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

export function installNetMonitor(target: { fetch: typeof fetch; location: Location } = window): void {
  if (installed) return;
  installed = true;
  const original = target.fetch.bind(target);
  target.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let id: string | null = null;
    try {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href, target.location.href);
      // data: and blob: URLs are read locally (the SDK uses them to decode images); never network.
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== target.location.origin) {
        const body = typeof init?.body === 'string' ? init.body : null;
        const info = classify(url, body);
        if (info.channel === 'ai-cloud' && !cloudRequestSeen) {
          cloudRequestSeen = true;
          for (const l of firstCloudRequest) queueMicrotask(l);
          firstCloudRequest.clear();
        }
        id = recordAttempt({
          channel: info.channel,
          fields: info.fields,
          body: info.body,
          model: info.model,
          destination: url.hostname,
          path: url.pathname,
          at: Date.now(),
          bytes: body?.length ?? 0,
        });
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
}
