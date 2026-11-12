// Skeletonizer and Rehydrator. Contract: shared/skeleton/SPEC.md (v1).
// Ported from shared/reference/silhouette.mjs; must stay byte-identical with it.

import { Raw, brandSkeleton, reveal, type Skeleton } from './types';

// ---------- 1. Normalization ----------

export function normalize(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[⟦⟧]/g, '');
}

// ---------- 2. Tokenization ----------

/**
 * The combined reference regex from SPEC.md section 2, `gu` flags. Groups:
 * 1 DATE, 2 NUM, 3 WORD, 4 OTHER. Placeholders use U+27E6 / U+27E7.
 */
export const TOKEN_PATTERN =
  /([0-9]{1,4}[/.\-][0-9]{1,2}[/.\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|([\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*)|([\s\S])/gu;

// ---------- 4. Allowlist ----------

export interface AllowlistFile {
  readonly locale: string;
  readonly version: number;
  readonly words: readonly string[];
}

/** The union of the given allowlist files (SPEC.md section 4: app locale ∪ en). */
export function buildAllowlist(files: readonly AllowlistFile[]): ReadonlySet<string> {
  const allow = new Set<string>();
  for (const file of files) for (const word of file.words) allow.add(word);
  return allow;
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

/**
 * Turns Raw document text into a Skeleton. One of the two functions allowed to produce a
 * cloud-safe value from Raw (shared/DATA_TYPES.md).
 */
export function skeletonize(text: Raw<string>, allow: ReadonlySet<string>): SkeletonResult {
  const input = normalize(reveal(text));
  const counters: Record<PlaceholderKind, number> = { D: 0, N: 0, W: 0 };
  const map: PlaceholderMap = {};
  let skeleton = '';
  const placeholder = (kind: PlaceholderKind, value: string): string => {
    const id = `${kind}${++counters[kind]}`;
    map[id] = value;
    return `⟦${id}⟧`;
  };
  for (const m of input.matchAll(TOKEN_PATTERN)) {
    const [, date, num, word, other] = m;
    if (date !== undefined) skeleton += placeholder('D', date);
    else if (num !== undefined) skeleton += placeholder('N', num);
    else if (word !== undefined) skeleton += isAllowlisted(word, allow) ? word : placeholder('W', word);
    else skeleton += other ?? '';
  }
  return { skeleton: brandSkeleton(skeleton), map: Raw.of(map) };
}

// ---------- 5. Pointer rehydration ----------

const NUMBER_FORMAT = /^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?$/;

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
