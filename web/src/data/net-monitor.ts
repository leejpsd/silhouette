// Records every cross-origin fetch the app makes into the outbound ledger before it is sent.
// Firebase AI Logic and App Check use fetch, so the "Leaving your device" bar shows each cloud
// call, and for AI Logic the exact text parts that were sent (the document silhouette).
// Same-origin requests (app files) are not recorded.

import { recordOutbound, type OutboundChannel } from './outbound';

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

export function classify(url: URL, body: string | null): { channel: OutboundChannel; fields: string[]; payload?: string } {
  if (url.hostname === AI_LOGIC_HOST) {
    const { text, hasInlineData } = aiPayloadText(body ?? '');
    const fields = ['document-silhouette'];
    if (hasInlineData) fields.push('inline-file');
    return { channel: 'ai-cloud', fields, payload: text };
  }
  if (url.hostname === APP_CHECK_HOST) return { channel: 'app-check', fields: ['app-check-token-request'] };
  if (url.hostname.endsWith('firestore.googleapis.com')) return { channel: 'firestore', fields: ['firestore'] };
  if (url.hostname.endsWith('firebaseremoteconfig.googleapis.com')) return { channel: 'remote-config', fields: ['remote-config'] };
  return { channel: 'other', fields: [url.hostname] };
}

let installed = false;

export function installNetMonitor(target: { fetch: typeof fetch; location: Location } = window): void {
  if (installed) return;
  installed = true;
  const original = target.fetch.bind(target);
  target.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(href, target.location.href);
      // data: and blob: URLs are read locally (the SDK uses them to decode images); never network.
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== target.location.origin) {
        const body = typeof init?.body === 'string' ? init.body : null;
        recordOutbound({ ...classify(url, body), destination: url.hostname, at: Date.now(), bytes: body?.length ?? 0 });
      }
    } catch {
      // Never block a request because of the monitor.
    }
    return original(input, init);
  };
}
