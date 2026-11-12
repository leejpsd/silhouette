// Routing of explanations by length and language (shared/routing.json, explain.short `when`), and
// parsing of grounded answers. Pure functions: no DOM, no Firebase.

/** Word limits the app asks for. A short explanation fits on a card; a long one compares criteria. */
export const EXPLAIN_WORDS = { short: 60, long: 180 } as const;
export const ASK_WORDS = 80;

export type ExplainLength = keyof typeof EXPLAIN_WORDS;

export interface ExplainRouteInput {
  readonly words: number;
  readonly locale: string;
  /** Remote Config route_short_text_max_words. */
  readonly maxShortWords: number;
  /** Remote Config route_ondevice_locales_web. */
  readonly onDeviceLocales: readonly string[];
}

export interface ExplainRoute {
  readonly task: 'explain.short' | 'explain.long';
  /** Why: short enough and a device language, too long, or a language the device model lacks. */
  readonly basis: 'short' | 'long' | 'locale';
  readonly words: number;
  readonly maxShortWords: number;
  readonly locale: string;
}

/** explain.short when `words <= route_short_text_max_words && locale in route_ondevice_locales`. */
export function explainRoute(input: ExplainRouteInput): ExplainRoute {
  const short = input.words <= input.maxShortWords;
  const deviceLocale = input.onDeviceLocales.includes(input.locale);
  const base = { words: input.words, maxShortWords: input.maxShortWords, locale: input.locale };
  if (short && deviceLocale) return { task: 'explain.short', basis: 'short', ...base };
  return { task: 'explain.long', basis: short ? 'locale' : 'long', ...base };
}

/**
 * Lines of a batched current-status answer: one per program, starting with `[program-id]`.
 * Lines for ids not in `ids` are ignored; a program without a line is absent from the result.
 * The first line for an id wins.
 */
export function parseStatusLines(text: string, ids: readonly string[]): ReadonlyMap<string, string> {
  const known = new Set(ids);
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*]\s*)?\[([a-z0-9]+(?:-[a-z0-9]+)*)\]\s*[:\-–—]?\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const [, id = '', status = ''] = m;
    if (known.has(id) && !out.has(id) && status !== '') out.set(id, status);
  }
  return out;
}

/** List lines (`- Name: text`) of a grounded answer, without the bullet. Other lines are dropped. */
export function parseListLines(text: string, max: number): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.+?)\s*$/.exec(line);
    if (m?.[1]) out.push(m[1].replace(/\*\*/g, ''));
    if (out.length >= max) break;
  }
  return out;
}

export interface Source {
  readonly uri: string;
  readonly title: string;
}

/** Only absolute https links are shown; duplicates are removed, order kept. */
export function safeSources(chunks: readonly { readonly uri?: string | undefined; readonly title?: string | undefined }[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const c of chunks) {
    if (typeof c.uri !== 'string') continue;
    // Absolute https URL with a host; no whitespace, quotes or angle brackets (no DOM URL parser in core/).
    const m = /^https:\/\/([A-Za-z0-9.-]+)(?::[0-9]+)?(?:[/?#][^\s"'<>]*)?$/.exec(c.uri);
    if (!m || seen.has(c.uri)) continue;
    seen.add(c.uri);
    const title = typeof c.title === 'string' && c.title.trim() !== '' ? c.title.trim() : (m[1] as string);
    out.push({ uri: c.uri, title });
  }
  return out;
}

/** Signed 16-bit little-endian PCM (Gemini TTS output) to samples in [-1, 1). */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const count = Math.floor(bytes.length / 2);
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
  for (let i = 0; i < count; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** The sample rate in a mime type such as `audio/L16;codec=pcm;rate=24000` (24 kHz when absent). */
export function pcmRate(mimeType: string): number {
  const m = /rate=(\d+)/.exec(mimeType);
  const rate = m?.[1] ? Number(m[1]) : 24000;
  return rate >= 8000 && rate <= 96000 ? rate : 24000;
}
