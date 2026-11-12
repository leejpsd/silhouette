// Answers of this session, kept in memory only: explanations and chip answers keyed by the canonical
// silhouette, program and language; the batched current-status result; leads and places; and which
// silhouettes the person agreed to send. Nothing here is written to storage, and "Delete everything"
// clears it.

import { useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
const answers = new Map<string, unknown>();
const consents = new Set<string>();
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

/** Whether the person already chose Send for this content (a canonical silhouette, or a public request kind). */
export function hasConsent(key: string): boolean {
  return consents.has(key);
}

export function giveConsent(key: string): void {
  consents.add(key);
  changed();
}

export function clearSession(): void {
  answers.clear();
  consents.clear();
  changed();
}

/** Cache key: task kind, language, canonical silhouette, program and question. */
export const answerKey = (...parts: readonly string[]): string => parts.join('|');
