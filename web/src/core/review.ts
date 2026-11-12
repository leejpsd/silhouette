// Review model for extracted document fields: each field's rehydrated value plus the
// source lines of the document with the referenced tokens marked. Deterministic; reuses rehydrate()
// field by field so review values are exactly what skeleton/SPEC.md section 5 produces.
// Output is plain data for on-device display only (not CloudSafe).

import { reveal, type Raw, type Skeleton } from './types';
import { rehydrate, type PlaceholderMap, type PointerFieldSpec, type PointerSchema, type RehydratedItem, type RehydratedScalar } from './skeleton';

/** A piece of a source line: plain text, or the original value of a placeholder. */
export interface SourceSegment {
  readonly text: string;
  /** Placeholder id when this segment was hidden in the skeleton. */
  readonly ref?: string;
  /** True when this placeholder is one the field points at. */
  readonly highlight?: boolean;
}

export interface ReviewItem {
  readonly value: RehydratedItem;
  readonly refs: readonly string[];
  readonly source: readonly (readonly SourceSegment[])[];
}

export interface ReviewField {
  readonly name: string;
  readonly kind: 'text' | 'number' | 'date' | 'enum' | 'list';
  /** Rehydrated value, or null when the model gave nothing usable ("not found"). */
  readonly value: RehydratedScalar | null;
  readonly items: readonly ReviewItem[];
  readonly refs: readonly string[];
  readonly source: readonly (readonly SourceSegment[])[];
}

const PLACEHOLDER = /⟦([DNW][0-9]+)⟧/g;

function refsOf(ref: unknown, map: PlaceholderMap): string[] {
  const list = Array.isArray(ref) ? ref : [ref];
  return list.filter((r): r is string => typeof r === 'string' && Object.hasOwn(map, r));
}

function own(obj: unknown, key: string): unknown {
  return obj !== null && typeof obj === 'object' && Object.hasOwn(obj, key) ? (obj as Record<string, unknown>)[key] : undefined;
}

/** Skeleton lines that contain one of `refs`, with placeholders restored to their original text. */
export function sourceLines(skeleton: string, map: PlaceholderMap, refs: readonly string[]): SourceSegment[][] {
  if (refs.length === 0) return [];
  const wanted = new Set(refs);
  const out: SourceSegment[][] = [];
  for (const line of skeleton.split('\n')) {
    const ids = [...line.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
    if (!ids.some((id) => wanted.has(id))) continue;
    const segments: SourceSegment[] = [];
    let last = 0;
    for (const m of line.matchAll(PLACEHOLDER)) {
      const id = m[1] as string;
      if (m.index > last) segments.push({ text: line.slice(last, m.index) });
      segments.push({ text: map[id] ?? '', ref: id, highlight: wanted.has(id) });
      last = m.index + m[0].length;
    }
    if (last < line.length) segments.push({ text: line.slice(last) });
    out.push(segments);
  }
  return out;
}

export function buildReview(schema: PointerSchema, pointers: unknown, skeleton: Skeleton, rawMap: Raw<PlaceholderMap>): ReviewField[] {
  const map = reveal(rawMap);
  return Object.entries(schema.properties).map(([name, spec]): ReviewField => {
    const kind = (spec['x-kind'] ?? 'text') as ReviewField['kind'];
    const ref = own(pointers, name);
    const single = (fieldSpec: PointerFieldSpec, value: unknown) =>
      reveal(rehydrate({ properties: { [name]: fieldSpec } }, { [name]: value }, rawMap))[name];
    if (kind === 'list') {
      const items: ReviewItem[] = [];
      for (const entry of Array.isArray(ref) ? ref : []) {
        const result = single(spec, [entry]);
        if (!Array.isArray(result) || result.length === 0) continue;
        const subRefs = Object.keys(spec.items?.properties ?? {}).flatMap((sub) =>
          spec.items?.properties[sub]?.['x-kind'] === 'enum' ? [] : refsOf(own(entry, sub), map),
        );
        items.push({ value: result[0] as RehydratedItem, refs: subRefs, source: sourceLines(skeleton, map, subRefs) });
      }
      return { name, kind, value: null, items, refs: items.flatMap((i) => i.refs), source: [] };
    }
    const value = ref === undefined || ref === null ? undefined : single(spec, ref);
    const scalar = value === undefined || Array.isArray(value) ? null : value;
    const refs = scalar === null || kind === 'enum' ? [] : refsOf(ref, map);
    return { name, kind, value: scalar, items: [], refs, source: sourceLines(skeleton, map, refs) };
  });
}

/** Counts of hidden values per placeholder kind, for the skeleton preview. */
export function placeholderCounts(skeleton: Skeleton): { readonly D: number; readonly N: number; readonly W: number } {
  const counts = { D: 0, N: 0, W: 0 };
  for (const m of skeleton.matchAll(PLACEHOLDER)) counts[(m[1] as string)[0] as 'D' | 'N' | 'W']++;
  return counts;
}

