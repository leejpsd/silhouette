// Ledger of everything that has left the device, shown in the "Leaving your device" bar.
// Entries are recorded by the network monitor (./net-monitor.ts) from the requests the app
// actually makes, so the "Leaving your device" bar cannot drift from reality.

export type OutboundChannel = 'ai-cloud' | 'app-check' | 'firestore' | 'remote-config' | 'analytics' | 'other';

export interface OutboundEntry {
  readonly channel: OutboundChannel;
  readonly at: number;
  /** Host the request went to. */
  readonly destination: string;
  /** What kind of content left, for the summary line (never values). */
  readonly fields: readonly string[];
  /** For AI Logic requests: the exact text that was sent (always CloudSafe content). */
  readonly payload?: string | undefined;
  readonly bytes: number;
}

type Listener = () => void;

// Replaced (never mutated) on change, so it is a stable snapshot for useSyncExternalStore.
let entries: readonly OutboundEntry[] = [];
const listeners = new Set<Listener>();

export function recordOutbound(entry: OutboundEntry): void {
  entries = [...entries, entry];
  for (const l of listeners) l();
}

export function outboundEntries(): readonly OutboundEntry[] {
  return entries;
}

export function subscribeOutbound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearOutbound(): void {
  entries = [];
  for (const l of listeners) l();
}
