// Ledger of everything that has left the device, shown in the "Leaving your device" bar.
// Entries are created by the network monitor (./net-monitor.ts) from the requests the app actually
// makes: "attempted" before a request goes out, then "sent" when a response arrives or "failed".
// The ledger is persisted in the encrypted store (./outbound-store.ts) so it survives reloads.
// Answers written by the on-device model are recorded too, with status "answered": they never left,
// carry no destination and no body, and are never counted as sent.

export type OutboundChannel = 'ai-cloud' | 'app-check' | 'recaptcha' | 'firestore' | 'remote-config' | 'analytics' | 'other' | 'on-device';
export type OutboundStatus = 'attempted' | 'sent' | 'failed' | 'answered' | 'blocked';

export interface OutboundEntry {
  readonly id: string;
  readonly channel: OutboundChannel;
  readonly at: number;
  /** Host and path the request went to. Query strings are never stored. */
  readonly destination: string;
  readonly path: string;
  /** Model named in the request path, for model calls. */
  readonly model?: string | undefined;
  /** What kind of content left, for the summary line (never values). */
  readonly fields: readonly string[];
  /** For model calls: the complete request body, formatted. Never stored for App Check requests. */
  readonly body?: string | undefined;
  readonly bytes: number;
  readonly status: OutboundStatus;
  readonly httpStatus?: number | undefined;
  /** Why a request failed (HTTP status text or network error message). */
  readonly error?: string | undefined;
  /** For a recorded on-device reading (`kept:recorded`): the machine and the date of the recording. */
  readonly recording?: { readonly machine: string; readonly date: string } | undefined;
}

export interface OutboundState {
  readonly entries: readonly OutboundEntry[];
  /** When the user last deleted the ledger with "Delete everything" (ms since epoch), if ever. */
  readonly clearedAt: number | null;
}

type Listener = () => void;

// Replaced (never mutated) on change, so it is a stable snapshot for useSyncExternalStore.
let state: OutboundState = { entries: [], clearedAt: null };
const listeners = new Set<Listener>();
let counter = 0;

function set(next: OutboundState): void {
  state = next;
  for (const l of listeners) l();
}

export function outboundState(): OutboundState {
  return state;
}

/** Kept for callers that only need the entries. */
export function outboundEntries(): readonly OutboundEntry[] {
  return state.entries;
}

export function subscribeOutbound(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Records a request that is about to be sent; returns its id. */
export function recordAttempt(entry: Omit<OutboundEntry, 'id' | 'status'>): string {
  const id = `${entry.at}-${++counter}`;
  set({ ...state, entries: [...state.entries, { ...entry, id, status: 'attempted' }] });
  return id;
}

/** What an answer written on this device was for; the record titles it by this, not like a request. */
export type KeptKind = 'document' | 'photo' | 'about' | 'ask' | 'why' | 'own-question' | 'recorded';

/** Records an answer the on-device model wrote: nothing left the device. */
export function recordAnsweredOnDevice(kind: KeptKind, at: number = Date.now()): string {
  const id = `${at}-${++counter}`;
  const entry: OutboundEntry = { id, channel: 'on-device', at, destination: '', path: '', fields: [`kept:${kind}`], bytes: 0, status: 'answered' };
  set({ ...state, entries: [...state.entries, entry] });
  return id;
}

/**
 * routing.json recordedSample: the bundled sample was read from a recorded on-device answer. The values
 * were put back on this device and nothing was sent; listed with the answers kept here, never as sent.
 */
export function recordRecordedReading(recording: { machine: string; date: string }, at: number = Date.now()): string {
  const id = `${at}-${++counter}`;
  const entry: OutboundEntry = { id, channel: 'on-device', at, destination: '', path: '', fields: ['kept:recorded'], bytes: 0, status: 'answered', recording };
  set({ ...state, entries: [...state.entries, entry] });
  return id;
}

/** Entries for requests that left the device (not answers written on it, not requests blocked before sending). */
export const leftDevice = (entries: readonly OutboundEntry[]): readonly OutboundEntry[] => entries.filter((e) => e.status !== 'answered' && e.status !== 'blocked');

function update(id: string, patch: Partial<OutboundEntry>): void {
  set({ ...state, entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
}

/** A request already marked blocked (refused before it left) keeps that status, whatever arrives later. */
const isBlocked = (id: string) => state.entries.some((e) => e.id === id && e.status === 'blocked');

/** `httpStatus` 0: loaded, but the browser does not show the status to the page (another site's script or frame). */
export function markSent(id: string, httpStatus: number): void {
  if (isBlocked(id)) return;
  update(id, { status: 'sent', httpStatus });
}

/** A request stopped before it left (the network monitor or the browser refused it): nothing was sent. */
export function markBlocked(id: string, reason: string): void {
  update(id, { status: 'blocked', error: reason, httpStatus: undefined });
}

export function markFailed(id: string, error: string, httpStatus?: number): void {
  if (isBlocked(id)) return;
  update(id, { status: 'failed', error, httpStatus });
}

/** Restores a persisted ledger (entries first, then anything recorded since start-up). */
export function restoreOutbound(saved: OutboundState): void {
  const known = new Set(saved.entries.map((e) => e.id));
  set({ entries: [...saved.entries, ...state.entries.filter((e) => !known.has(e.id))], clearedAt: saved.clearedAt ?? state.clearedAt });
}

/** Deletes the ledger. `clearedAt` lets the bar say the record was deleted rather than "nothing ever left". */
export function clearOutbound(clearedAt: number | null = null): void {
  set({ entries: [], clearedAt });
}
