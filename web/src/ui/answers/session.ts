// Answers of this session, kept in memory only: explanations and chip answers keyed by the canonical
// silhouette, program and language; the batched current-status result; leads and places; what the
// person agreed to send, per content and destination; and what has actually been sent. Nothing here
// is written to storage, and "Delete everything" clears it.

import { useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
const answers = new Map<string, unknown>();
const consents = new Set<string>();
const sent = new Set<string>();
let version = 0;

function changed(): void {
  version++;
  for (const l of listeners) l();
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller whenever the session changes. */
export function useSession(): number {
  return useSyncExternalStore(subscribeSession, () => version, () => version);
}

export function cachedAnswer<T>(key: string): T | undefined {
  return answers.get(key) as T | undefined;
}

export function storeAnswer(key: string, value: unknown): void {
  answers.set(key, value);
  changed();
}

/**
 * Where a request goes first. Agreeing to "may be sent if this device can't" (device-first) does not
 * cover a request that goes to the cloud first.
 */
export type Destination = 'device-first' | 'cloud';

/**
 * Whether the step before sending must be shown for this content (a canonical silhouette, or a public
 * request kind) and destination. Once the content has actually reached the cloud in this session,
 * later requests with it go without the step (and say so with `send.once`).
 */
export function needsConsent(content: string, destination: Destination): boolean {
  return !sent.has(content) && !consents.has(`${content}|${destination}`);
}

export function giveConsent(content: string, destination: Destination): void {
  consents.add(`${content}|${destination}`);
  changed();
}

/** The content left the device (a request with it reached the cloud). */
export function markSent(content: string): void {
  if (sent.has(content)) return;
  sent.add(content);
  changed();
}

export function wasSent(content: string): boolean {
  return sent.has(content);
}

export function clearSession(): void {
  answers.clear();
  consents.clear();
  sent.clear();
  changed();
}

/** Cache key: task kind, language, canonical silhouette, program and question. */
export const answerKey = (...parts: readonly string[]): string => parts.join('|');
