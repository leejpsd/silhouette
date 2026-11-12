// Fetches Remote Config with the Firebase app. Loaded only together with Firebase (src/ai/firebase.ts),
// so the SDK is never part of the start-up bundle.

import type { FirebaseApp } from 'firebase/app';
import { fetchAndActivate, getAll, getRemoteConfig } from 'firebase/remote-config';
import { RC_DEFAULTS, applyConfigValues } from './remote-config';

/** Fetches (at most once an hour), activates and applies the values. Never throws. */
export async function refreshRemoteConfig(app: FirebaseApp): Promise<void> {
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    rc.settings.fetchTimeoutMillis = 10_000;
    rc.defaultConfig = { ...RC_DEFAULTS };
    await fetchAndActivate(rc);
    // Only values that came from the server: when nothing was fetched or activated, the last fetched
    // values (or the bundled defaults) stay in effect instead of being reset.
    const remote = Object.entries(getAll(rc)).filter(([, v]) => v.getSource() === 'remote');
    if (remote.length > 0) applyConfigValues(Object.fromEntries(remote.map(([k, v]) => [k, v.asString()])));
  } catch {
    // Offline or blocked: the bundled defaults (or the last fetched values) stay in effect.
  }
}
