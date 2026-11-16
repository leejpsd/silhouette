// Records every cross-origin http(s) request the app makes into the outbound ledger: before it is
// sent ("attempted"), then "sent" with the HTTP status once a response arrives, or "failed".
// For Firebase AI Logic it keeps the complete request body, so "Show exactly what was sent" can
// display it. Credentials are never kept: the SDK sends the API key and the App Check token as
// headers, which are not recorded; query strings are dropped; App Check request bodies (debug
// token or attestation) are never stored.

import { markBlocked, markFailed, markSent, recordAttempt, type OutboundChannel } from './outbound';

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
  if (url.hostname.endsWith('firestore.googleapis.com')) return { channel: 'firestore', fields: ['firestore'] };
  if (url.hostname.endsWith('firebaseremoteconfig.googleapis.com')) return { channel: 'remote-config', fields: ['remote-config'] };
  if (url.hostname.endsWith('firebaseinstallations.googleapis.com')) return { channel: 'remote-config', fields: ['installation'] };
  return { channel: 'other', fields: [url.hostname] };
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
        let body = typeof init?.body === 'string' ? init.body : null;
        if (url.hostname === AI_LOGIC_HOST) {
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
