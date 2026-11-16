// The response constraint of on-device pointer extraction for one document, in the JSON Schema dialect
// Chrome's Prompt API takes. It is strict and built for this document's silhouette:
// - no keys other than the schema's, and every key present (null when the field is not there);
// - names only word placeholders (W…), dates only date placeholders (D…), amounts and counts only
//   number placeholders (N…), each limited to the ids this silhouette actually contains;
// - fixed lists only their options; each deduction is exactly { amount: N…, kind: one of the kinds }.
// The cloud model keeps the shared schema; on the device, where the model is small, the constraint
// itself rules out keys that do not exist, ids that do not exist and ids of the wrong kind.
//
// On the device a paystub is read in two parts (src/ai/tasks.ts): the core fields, then the
// deductions. Each part has its own constraint ('core' or 'deductions'); 'whole' is both in one.
import type { Skeleton } from '../core/types';
import type { PointerSchema } from '../core/skeleton';
import type { ModelSchemaOptions } from './model-schema';

type Node = Record<string, unknown>;

export type DevicePart = 'whole' | 'core' | 'deductions';

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

/** Field names of a part of a pointer schema (the list fields are the deductions part). */
export function partFields(schema: PointerSchema, part: DevicePart): string[] {
  return Object.entries(schema.properties)
    .filter(([, spec]) => part === 'whole' || (spec['x-kind'] === 'list') === (part === 'deductions'))
    .map(([name]) => name);
}

/** One placeholder id out of `ids`, or null; only null when the silhouette has none of that kind. */
const idOrNull = (ids: readonly string[]): Node => (ids.length > 0 ? { type: ['string', 'null'], enum: [...ids, null] } : { type: 'null' });

function fieldConstraint(spec: PointerSchema['properties'][string], ids: ReturnType<typeof placeholderIds>): Node {
  switch (spec['x-kind']) {
    case 'text':
      return ids.W.length > 0 ? { type: ['array', 'null'], minItems: 1, items: { type: 'string', enum: [...ids.W] } } : { type: 'null' };
    case 'date':
      return idOrNull(ids.D);
    case 'number':
      return idOrNull(ids.N);
    case 'enum':
      return { type: ['string', 'null'], enum: [...(spec.enum ?? []), null] };
    case 'list': {
      const item = spec.items as { properties: Record<string, { enum?: readonly string[] }> } | undefined;
      const kinds = item?.properties['kind']?.enum ?? [];
      return {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            amount: ids.N.length > 0 ? { type: 'string', enum: [...ids.N] } : { type: 'null' },
            kind: { type: 'string', enum: [...kinds] },
          },
          required: ['amount', 'kind'],
          additionalProperties: false,
        },
      };
    }
    default:
      return { type: ['string', 'null'], enum: [...ids.N, ...ids.D, ...ids.W, null] };
  }
}

/**
 * The strict on-device constraint for `part` of the pointer schema. `options` is accepted for the
 * configuration's sake: the device form is always every key required, null allowed (pointer schema v2).
 */
export function deviceResponseConstraint(schema: PointerSchema, options: ModelSchemaOptions, skeleton: Skeleton, part: DevicePart = 'whole'): Record<string, unknown> {
  void options;
  const ids = placeholderIds(skeleton);
  const fields = partFields(schema, part);
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((name) => [name, fieldConstraint(schema.properties[name] as never, ids)])),
    required: fields,
    additionalProperties: false,
  };
}
