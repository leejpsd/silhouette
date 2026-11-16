// The response constraint of on-device pointer extraction for one document: the pointer schema in the
// JSON Schema dialect Chrome's Prompt API takes, with every placeholder reference restricted to the
// placeholder ids that this document's silhouette actually contains (numbers to N ids, dates to D or
// N ids, names to any id). The cloud model keeps the shared schema; on the device, where the model is
// small, the constraint itself rules out ids that do not exist and ids of the wrong kind.
import type { Skeleton } from '../core/types';
import type { PointerSchema } from '../core/skeleton';
import { toModelSchema, type ModelSchemaOptions } from './model-schema';

type Node = Record<string, unknown>;

/** Placeholder ids of a silhouette by kind, in order of first appearance. */
export function placeholderIds(skeleton: Skeleton): { readonly N: string[]; readonly D: string[]; readonly W: string[] } {
  const out = { N: [] as string[], D: [] as string[], W: [] as string[] };
  for (const m of skeleton.matchAll(/⟦([NDW])([0-9]+)⟧/g)) {
    const id = `${m[1]}${m[2]}`;
    const list = out[m[1] as 'N' | 'D' | 'W'];
    if (!list.includes(id)) list.push(id);
  }
  return out;
}

/** Restricts every string node below `node` to `allowed` (keeping null where the node allows it). */
function restrict(node: unknown, allowed: readonly string[]): unknown {
  if (Array.isArray(node)) return node.map((n) => restrict(n, allowed));
  if (node === null || typeof node !== 'object') return node;
  const n = { ...(node as Node) };
  for (const key of ['items', 'anyOf', 'oneOf', 'properties']) {
    if (n[key] === undefined) continue;
    if (key === 'properties') {
      n[key] = Object.fromEntries(Object.entries(n[key] as Node).map(([k, v]) => [k, k === 'kind' ? v : restrict(v, allowed)]));
    } else n[key] = restrict(n[key], allowed);
  }
  const type = n['type'];
  const isString = type === 'string' || (Array.isArray(type) && type.includes('string'));
  if (isString && n['enum'] === undefined && allowed.length > 0) {
    n['enum'] = Array.isArray(type) && type.includes('null') ? [...allowed, null] : [...allowed];
  }
  return n;
}

export function deviceResponseConstraint(schema: PointerSchema, options: ModelSchemaOptions, skeleton: Skeleton): Record<string, unknown> {
  const base = toModelSchema(schema as never, { ...options, dialect: 'jsonschema' });
  const ids = placeholderIds(skeleton);
  const all = [...ids.N, ...ids.D, ...ids.W];
  const kinds = schema.properties as Record<string, { 'x-kind'?: string }>;
  const props = base['properties'] as Record<string, unknown>;
  const allowedFor = (name: string): string[] => {
    const kind = kinds[name]?.['x-kind'];
    if (kind === 'number' || kind === 'list') return ids.N;
    if (kind === 'date') return [...ids.D, ...ids.N];
    if (kind === 'enum') return [];
    return all;
  };
  return { ...base, properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, restrict(v, allowedFor(k))])) };
}
