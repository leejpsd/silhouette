// Remote Config values the app reads (keys listed in shared/routing.json `remoteConfigKeys`).
// The app never fetches settings on start: the first fetch follows the first request the person
// chose to send to the cloud (src/ai/firebase.ts), so Quick Check, the document preview and
// everything that runs on this device work with nothing leaving it. Until then the bundled defaults below apply. The last fetched values
// are kept under `silhouette.remote-config` (no personal data: thresholds, locales and flags only),
// and "Delete everything" removes them with every other `silhouette.*` key.

import { PREF_PREFIX } from './store';

export interface AppConfig {
  /** explain.short runs PREFER_ON_DEVICE at or below this many words. */
  readonly routeShortTextMaxWords: number;
  /** Locales Chrome's on-device model handles for explanations. */
  readonly onDeviceLocales: readonly string[];
  readonly groundingSearch: boolean;
  readonly groundingMaps: boolean;
  readonly tts: boolean;
  /** shared/prompts/pointer-extract.v{n}.md */
  readonly promptPointerExtractV: number;
  /** shared/prompts/explain.v{n}.md */
  readonly promptExplainV: number;
}

/** Bundled defaults. Paid features (grounding, read aloud) are off until Remote Config turns them on. */
export const CONFIG_DEFAULTS: AppConfig = {
  routeShortTextMaxWords: 80,
  onDeviceLocales: ['en', 'es'],
  groundingSearch: false,
  groundingMaps: false,
  tts: false,
  promptPointerExtractV: 3,
  promptExplainV: 1,
};

/** Remote Config parameter names and the defaults in the form the SDK takes. */
export const RC_DEFAULTS: Readonly<Record<string, string | number | boolean>> = {
  route_short_text_max_words: CONFIG_DEFAULTS.routeShortTextMaxWords,
  route_ondevice_locales_web: JSON.stringify(CONFIG_DEFAULTS.onDeviceLocales),
  feature_grounding_search: CONFIG_DEFAULTS.groundingSearch,
  feature_grounding_maps: CONFIG_DEFAULTS.groundingMaps,
  feature_tts: CONFIG_DEFAULTS.tts,
  prompt_pointer_extract_v: CONFIG_DEFAULTS.promptPointerExtractV,
  prompt_explain_v: CONFIG_DEFAULTS.promptExplainV,
};

export const CONFIG_STORAGE_KEY = `${PREF_PREFIX}remote-config`;

const LOCALE = /^[a-z]{2,3}$/;

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !/^\s*[0-9]+\s*$/.test(value)) return fallback;
  const n = Number(value);
  return n >= min && n <= max ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0' || v === '') return false;
  return fallback;
}

function locales(value: string | undefined, fallback: readonly string[]): readonly string[] {
  if (value === undefined) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((l): l is string => typeof l === 'string' && LOCALE.test(l))) return parsed;
  } catch {
    // Not JSON; keep the default.
  }
  return fallback;
}

/** Parses Remote Config string values. Anything missing or malformed keeps its default. */
export function parseConfig(values: Readonly<Record<string, string>>): AppConfig {
  const d = CONFIG_DEFAULTS;
  return {
    routeShortTextMaxWords: int(values['route_short_text_max_words'], d.routeShortTextMaxWords, 1, 2000),
    onDeviceLocales: locales(values['route_ondevice_locales_web'], d.onDeviceLocales),
    groundingSearch: bool(values['feature_grounding_search'], d.groundingSearch),
    groundingMaps: bool(values['feature_grounding_maps'], d.groundingMaps),
    tts: bool(values['feature_tts'], d.tts),
    promptPointerExtractV: int(values['prompt_pointer_extract_v'], d.promptPointerExtractV, 1, 1000),
    promptExplainV: int(values['prompt_explain_v'], d.promptExplainV, 1, 1000),
  };
}

type Listener = () => void;
const listeners = new Set<Listener>();
let current: AppConfig = loadSnapshot();

function loadSnapshot(): AppConfig {
  try {
    const saved = globalThis.localStorage?.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const strings = Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'));
        return parseConfig(strings);
      }
    }
  } catch {
    // Storage unavailable or corrupt; use the defaults.
  }
  return CONFIG_DEFAULTS;
}

/** The values in effect now. */
export function appConfig(): AppConfig {
  return current;
}

export function subscribeConfig(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies fetched string values, keeps them for the next start and notifies the UI. */
export function applyConfigValues(values: Readonly<Record<string, string>>): void {
  current = parseConfig(values);
  try {
    globalThis.localStorage?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage unavailable: the values apply for this session only.
  }
  for (const l of listeners) l();
}

/** Back to the bundled defaults (after "Delete everything"). */
export function resetConfig(): void {
  current = CONFIG_DEFAULTS;
  for (const l of listeners) l();
}

/** Test seam: set values directly. */
export function setConfigForTests(next: Partial<AppConfig> | null): void {
  current = next === null ? CONFIG_DEFAULTS : { ...CONFIG_DEFAULTS, ...next };
  for (const l of listeners) l();
}
