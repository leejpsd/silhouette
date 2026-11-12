// Keeps the outbound ledger in the encrypted store, so the "Leaving your device" record survives
// reloads. Saved after every change; restored once at start-up.
import { loadRecord, saveRecord } from './store';
import { outboundState, restoreOutbound, subscribeOutbound, type OutboundState } from './outbound';

export const OUTBOUND_RECORD = 'outbound.log';
/** Non-sensitive marker kept after "Delete everything": when the ledger was deleted. */
export const LEDGER_CLEARED_KEY = 'silhouette.ledger-cleared-at';

function isState(value: unknown): value is OutboundState {
  return value !== null && typeof value === 'object' && Array.isArray((value as OutboundState).entries);
}

let unsubscribe: (() => void) | null = null;

export async function startOutboundPersistence(): Promise<void> {
  const saved = await loadRecord(OUTBOUND_RECORD).catch(() => undefined);
  let clearedAt: number | null = null;
  try {
    const marker = localStorage.getItem(LEDGER_CLEARED_KEY);
    if (marker !== null && Number.isFinite(Number(marker))) clearedAt = Number(marker);
  } catch {
    // Storage unavailable; the marker is a convenience.
  }
  restoreOutbound(isState(saved) ? { entries: saved.entries, clearedAt: saved.clearedAt ?? clearedAt } : { entries: [], clearedAt });
  unsubscribe?.();
  let last = outboundState();
  unsubscribe = subscribeOutbound(() => {
    const next = outboundState();
    if (next === last) return;
    last = next;
    // Nothing to save for an empty ledger: "Delete everything" must not recreate the database.
    if (next.entries.length > 0) void saveRecord(OUTBOUND_RECORD, next);
  });
}
