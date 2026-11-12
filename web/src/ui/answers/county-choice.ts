// The county the person chose for "Help near you". Kept in the encrypted store on this device.

import { useEffect, useSyncExternalStore } from 'react';
import { loadRecord, saveRecord } from '../../data/store';

const RECORD = 'profile.county';
type Listener = () => void;
const listeners = new Set<Listener>();
let county: string | null = null;
let loaded = false;

function set(next: string | null): void {
  county = next;
  for (const l of listeners) l();
}

export function chooseCounty(next: string | null): void {
  set(next);
  void saveRecord(RECORD, next);
}

/** After "Delete everything". */
export function forgetCounty(): void {
  loaded = false;
  set(null);
}

export function useCounty(): string | null {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    loadRecord(RECORD)
      .then((value) => {
        if (typeof value === 'string' && county === null) set(value);
      })
      .catch(() => undefined);
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => county,
    () => county,
  );
}
