// Skeletonizer and Rehydrator. Contract: shared/skeleton/SPEC.md (v1).
// Ported from shared/reference/silhouette.mjs; must stay byte-identical with it.

import { Raw, brandSkeleton, reveal, type Skeleton } from './types';

// ---------- 1. Normalization ----------

export function normalize(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[⟦⟧]/g, '');
}

// ---------- 2. Tokenization (deny by default) ----------

/**
 * Characters that are kept verbatim and never belong to a word (shared/skeleton/SPEC.md section 2).
 * Everything else that is not an ASCII digit is word material and is masked unless allowlisted.
 * Explicit code points only: no Unicode property classes, so every platform behaves the same.
 */
export const SAFE_CLASS =
  '\\u0009\\u000A\\u0020\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000' + // whitespace
  '\\u0021-\\u002F\\u003A-\\u003F\\u005B-\\u005E\\u0060\\u007B-\\u007E' + // ASCII punctuation and symbols except @ and _
  '\\u00A2\\u00A3\\u00A5\\u00A7\\u00B0\\u00B1\\u00B6\\u00B7\\u00D7\\u00F7' + // ¢ £ ¥ § ° ± ¶ · × ÷
  '\\u2013\\u2014\\u2018\\u2019\\u201C\\u201D\\u2022\\u2026\\u20A9\\u20AC\\u2116' + // – — ‘ ’ “ ” • … ₩ € №
  '\\u3001\\u3002\\u3008-\\u3011\\u3014\\u3015\\u30FB' + // CJK punctuation
  '\\uFF01\\uFF05\\uFF08\\uFF09\\uFF0B-\\uFF0F\\uFF1A\\uFF1B\\uFF1D\\uFF1F\\uFF3B\\uFF3D\\uFF5E'; // fullwidth punctuation

const X = `[^0-9${SAFE_CLASS}]`;

/** Month names (English full and abbreviated, Spanish full), matched ASCII case-insensitively only. */
export const MONTHS: readonly (readonly string[])[] = [
  ['january', 'jan', 'enero'], ['february', 'feb', 'febrero'], ['march', 'mar', 'marzo'], ['april', 'apr', 'abril'],
  ['may', 'mayo'], ['june', 'jun', 'junio'], ['july', 'jul', 'julio'], ['august', 'aug', 'agosto'],
  ['september', 'sept', 'sep', 'septiembre', 'setiembre'], ['october', 'oct', 'octubre'],
  ['november', 'nov', 'noviembre'], ['december', 'dec', 'diciembre'],
];
/**
 * ASCII case-insensitive, written out as [aA] classes. A regex-wide ignore-case flag would also fold
 * non-ASCII letters (U+017F LONG S matches "s" under Unicode case folding).
 */
const eitherCase = (word: string): string => [...word].map((ch) => `[${ch}${ch.toUpperCase()}]`).join('');
const MONTH = `(?:${MONTHS.flat()
  .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
  .map(eitherCase)
  .join('|')})`;
const ORD = ['st', 'nd', 'rd', 'th'].map(eitherCase).join('|');
const DE = eitherCase('de');
const EL = eitherCase('l');

/** "October 17, 2026", "Oct. 17 2026", "17 October 2026", "17 de octubre de 2026". */
export const MONTH_DATE_SOURCE =
  `${MONTH}\\.? [0-9]{1,2}(?:${ORD})?,? [0-9]{4}(?![0-9])|[0-9]{1,2}(?:${ORD})? (?:${DE} )?${MONTH}\\.?,? (?:${DE}${EL}? )?[0-9]{4}(?![0-9])`;

/** Groups: 1 DATE, 2 NUM, 3 WORD, 4 OTHER. Compiled with flags `gu`, matched by code point. */
export const TOKEN_SOURCE =
  `(${MONTH_DATE_SOURCE}|[0-9]{1,4}[/.\\-][0-9]{1,2}[/.\\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|(${X}+(?:['\\u2019\\-]${X}+)*)|([\\s\\S])`;
export const TOKEN_FLAGS = 'gu';
const TOKEN_PATTERN = new RegExp(TOKEN_SOURCE, TOKEN_FLAGS);

// ---------- 4. Allowlist ----------

export interface AllowlistFile {
  readonly locale: string;
  readonly version: number;
  readonly words: readonly string[];
  /** Role labels and function words that stand in front of a name (section 4.2). */
  readonly introducers?: readonly string[] | undefined;
}

/** The union of the given allowlist files (document language ∪ en). */
export function buildAllowlist(files: readonly AllowlistFile[]): ReadonlySet<string> {
  const allow = new Set<string>();
  for (const file of files) for (const word of file.words) allow.add(word);
  return allow;
}

/** The union of the files' introducer lists (document language ∪ en), section 4.2. */
export function buildIntroducers(files: readonly AllowlistFile[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const file of files) for (const word of file.introducers ?? []) out.add(word);
  return out;
}

function isAllowlisted(word: string, allow: ReadonlySet<string>): boolean {
  const lower = word.toLowerCase();
  if (allow.has(lower)) return true;
  if (!lower.includes('-')) return false;
  return lower.split('-').every((part) => allow.has(part));
}

// ---------- 3. Replacement ----------

/** Placeholder id (`D1`, `N3`, `W12`) → original token text. Always wrapped in Raw. */
export type PlaceholderMap = Record<string, string>;

export interface SkeletonResult {
  /** Cloud-safe document silhouette. */
  readonly skeleton: Skeleton;
  /** Placeholder → original value. Raw: never leaves the device. */
  readonly map: Raw<PlaceholderMap>;
}

type PlaceholderKind = 'D' | 'N' | 'W';

interface Token {
  readonly kind: PlaceholderKind | 'O';
  text: string;
  keep: boolean;
  /** The user chose to hide this word (section 4.3). */
  hidden?: boolean;
}

/** Separators that keep two words in one phrase (section 4.1): "Jordan Gross", "Smith, John", "Smith & Jones". */
const PHRASE_JOINERS: ReadonlySet<string> = new Set([' ', ', ', ' & ']);

/**
 * Turns Raw document text into a Skeleton. One of the two functions allowed to produce a
 * cloud-safe value from Raw (shared/DATA_TYPES.md).
 */
export function skeletonize(
  text: Raw<string>,
  allow: ReadonlySet<string>,
  introducers: ReadonlySet<string> = new Set(),
  /**
   * Section 4.3: lowercase words the user chose to hide in this document. They are masked even when
   * allowlisted (also as a hyphen-separated part: `gross` hides `Gross-Pay`), and their whole phrase
   * with them, introducers included. Stored with the document on the device; never sent.
   */
  hide: ReadonlySet<string> = new Set(),
): SkeletonResult {
  const input = normalize(reveal(text));
  // Pass 1: tokens. Consecutive safe characters form one separator token.
  const tokens: Token[] = [];
  for (const m of input.matchAll(TOKEN_PATTERN)) {
    const [, date, num, word, other] = m;
    const last = tokens[tokens.length - 1];
    if (date !== undefined) tokens.push({ kind: 'D', text: date, keep: false });
    else if (num !== undefined) tokens.push({ kind: 'N', text: num, keep: false });
    else if (word !== undefined) {
      const lower = word.toLowerCase();
      const hidden = hide.has(lower) || (lower.includes('-') && lower.split('-').some((part) => hide.has(part)));
      tokens.push({ kind: 'W', text: word, keep: isAllowlisted(word, allow) && !hidden, hidden });
    } else if (last && last.kind === 'O') last.text += other ?? '';
    else tokens.push({ kind: 'O', text: other ?? '', keep: true });
  }
  // Pass 2: a phrase is masked as a whole (section 4.1).
  for (let i = 0; i < tokens.length; ) {
    if ((tokens[i] as Token).kind !== 'W') {
      i++;
      continue;
    }
    let j = i;
    while (
      j + 2 < tokens.length &&
      (tokens[j + 1] as Token).kind === 'O' &&
      PHRASE_JOINERS.has((tokens[j + 1] as Token).text) &&
      (tokens[j + 2] as Token).kind === 'W'
    ) {
      j += 2;
    }
    // Section 4.2: leading introducers ("Employee", "This Lease is made between") are labels in front
    // of a name, never part of it. They keep their own decision; the last word is never set aside.
    // A phrase in which the user hid a word is masked whole, introducers included.
    let userHidden = false;
    for (let k = i; k <= j; k += 2) userHidden = userHidden || ((tokens[k] as Token).hidden ?? false);
    let start = i;
    while (!userHidden && start < j && (tokens[start] as Token).keep && introducers.has((tokens[start] as Token).text.toLowerCase())) start += 2;
    let keep = true;
    for (let k = start; k <= j; k += 2) keep = keep && (tokens[k] as Token).keep;
    for (let k = start; k <= j; k += 2) (tokens[k] as Token).keep = keep;
    i = j + 1;
  }
  // Pass 3: placeholders, numbered in document order.
  const counters: Record<PlaceholderKind, number> = { D: 0, N: 0, W: 0 };
  const map: PlaceholderMap = {};
  let skeleton = '';
  for (const t of tokens) {
    if (t.kind === 'O' || (t.kind === 'W' && t.keep)) {
      skeleton += t.text;
      continue;
    }
    const id = `${t.kind}${++counters[t.kind]}`;
    map[id] = t.text;
    skeleton += `⟦${id}⟧`;
  }
  return { skeleton: brandSkeleton(skeleton), map: Raw.of(map) };
}

/** The allowlisted words that survive in a skeleton (what the user can still choose to hide). */
export function visibleWords(skeleton: Skeleton): string[] {
  const words = new Set<string>();
  const pattern = new RegExp(TOKEN_SOURCE, TOKEN_FLAGS);
  for (const m of skeleton.replace(/⟦[DNW][0-9]+⟧/g, ' ').matchAll(pattern)) {
    if (m[3] !== undefined) words.add(m[3]);
  }
  return [...words];
}

// ---------- 5. Pointer rehydration ----------

const NUMBER_FORMAT = /^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?$/;

/**
 * An amount typed by the user: surrounding spaces and one leading currency symbol ($ € £ ¥ ₩) are
 * removed, then the number format of shared/skeleton/SPEC.md section 5 applies ("28,000.50",
 * "28000.5"). Anything else, such as "28.000,50" or "1,2345", is rejected (undefined).
 */
export function parseTypedAmount(text: string): number | undefined {
  // Section 5.1: trim tab, LF, CR, space and no-break space only (not every Unicode space), then
  // one leading currency sign and the same characters after it.
  const trimmed = text.replace(/^[\t\n\r \u00A0]+|[\t\n\r \u00A0]+$/g, '').replace(/^[$€£¥₩][\t\n\r \u00A0]*/u, '');
  return parseNumber(trimmed);
}

/** SPEC.md section 5 step 2. Returns undefined for any token that does not match the format. */
export function parseNumber(token: string): number | undefined {
  if (!NUMBER_FORMAT.test(token)) return undefined;
  return Number(token.replace(/,/g, ''));
}

export type FieldKind = 'text' | 'number' | 'date' | 'enum' | 'list';

/** The subset of a pointer schema (shared/schemas/pointer.*.json) the Rehydrator reads. */
export interface PointerFieldSpec {
  readonly 'x-kind'?: FieldKind | undefined;
  readonly enum?: readonly string[] | undefined;
  readonly items?:
    | {
        readonly properties: Readonly<Record<string, PointerFieldSpec>>;
        readonly required?: readonly string[] | undefined;
      }
    | undefined;
}

export interface PointerSchema {
  readonly properties: Readonly<Record<string, PointerFieldSpec>>;
}

export type RehydratedScalar = string | number;
export type RehydratedItem = Record<string, RehydratedScalar>;
export type RehydratedFields = Record<string, RehydratedScalar | RehydratedItem[]>;

function own(obj: unknown, key: string): unknown {
  if (obj === null || typeof obj !== 'object' || !Object.hasOwn(obj, key)) return undefined;
  return (obj as Record<string, unknown>)[key];
}

function readField(spec: PointerFieldSpec, ref: unknown, map: PlaceholderMap): RehydratedScalar | undefined {
  const kind = spec['x-kind'];
  if (kind === 'enum') return typeof ref === 'string' && (spec.enum ?? []).includes(ref) ? ref : undefined;
  const has = (r: unknown): r is string => typeof r === 'string' && Object.hasOwn(map, r);
  if (kind === 'number') {
    if (!has(ref) || ref[0] !== 'N') return undefined;
    return parseNumber(map[ref] as string);
  }
  if (kind === 'date') {
    if (has(ref) && ref[0] === 'D') return map[ref];
    if (Array.isArray(ref) && ref.length === 3 && ref.every((r) => has(r) && r[0] === 'N')) {
      return (ref as string[]).map((r) => map[r]).join('-');
    }
    return undefined;
  }
  if (kind === 'text') {
    if (!Array.isArray(ref)) return undefined;
    const parts = ref.filter(has).map((r) => map[r] as string);
    return parts.length ? parts.join(' ') : undefined;
  }
  return undefined;
}

/**
 * Resolves model pointers against the placeholder map. `pointers` is untrusted model output.
 * The result holds exact document values and therefore stays Raw.
 */
export function rehydrate(schema: PointerSchema, pointers: unknown, rawMap: Raw<PlaceholderMap>): Raw<RehydratedFields> {
  const map = reveal(rawMap);
  const out: RehydratedFields = {};
  for (const [name, spec] of Object.entries(schema.properties)) {
    const ref = own(pointers, name);
    if (ref === undefined || ref === null) continue;
    if (spec['x-kind'] === 'list') {
      if (!Array.isArray(ref) || spec.items === undefined) continue;
      const items: RehydratedItem[] = [];
      for (const entry of ref) {
        const item: RehydratedItem = {};
        for (const [sub, subSpec] of Object.entries(spec.items.properties)) {
          const value = readField(subSpec, own(entry, sub), map);
          if (value !== undefined) item[sub] = value;
        }
        if ((spec.items.required ?? []).every((key) => Object.hasOwn(item, key))) items.push(item);
      }
      if (items.length) out[name] = items;
      continue;
    }
    const value = readField(spec, ref, map);
    if (value !== undefined) out[name] = value;
  }
  return Raw.of(out);
}
