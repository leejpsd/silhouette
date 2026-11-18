// The placeholder ids the cloud model answered for the last document reading, kept in memory only (never
// stored, never values): the record shows them under the exact request as "Answer received".
import { useSyncExternalStore } from 'react';

export interface LastReading {
  readonly at: number;
  /** Field name → the placeholder id(s) the model pointed at, as it answered. */
  readonly ids: Readonly<Record<string, unknown>>;
}

let last: LastReading | null = null;
const listeners = new Set<() => void>();

export function rememberReading(ids: Readonly<Record<string, unknown>>): void {
  last = { at: Date.now(), ids };
  for (const l of listeners) l();
}

export function forgetReading(): void {
  last = null;
  for (const l of listeners) l();
}

export function useLastReading(): LastReading | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => last,
    () => null,
  );
}
