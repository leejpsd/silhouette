// Deterministic clean-up of name pointers, on the device, after the model answered.
//
// The Skeletonizer keeps introducers at the start of a phrase visible (shared/skeleton/SPEC.md
// section 4.2), so a model normally points only at the name. This is a second line of defence for
// what that rule leaves masked: titles ("Ms Lopez"), and introducers that follow a masked word or
// appear in a phrase the user hid. The original words are known here, so leading words that
// introduce a name and are never part of one are dropped from text fields.
// Only leading words are dropped, so names that contain label words ("Jordan Gross", "Federal
// Security Services") keep all their words.

import { reveal, type Raw } from './types';
import type { PlaceholderMap, PointerSchema } from './skeleton';

/**
 * Titles and labels that are not introducers in shared/skeleton/allowlist/*.json (section 4.2
 * leaves them out on purpose, because they say something about the person), but that are still
 * not part of a name when a model points at them in front of one.
 */
export const LOCAL_NAME_PREFIXES: ReadonlySet<string> = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'names', 'employees']);

/**
 * Returns the pointers with leading introducers removed from every text field. `introducers` is the
 * shared list for the document (document language ∪ en); the local titles above are added to it.
 */
export function tidyNamePointers(
  schema: PointerSchema,
  pointers: unknown,
  rawMap: Raw<PlaceholderMap>,
  introducers: ReadonlySet<string>,
): unknown {
  if (pointers === null || typeof pointers !== 'object' || Array.isArray(pointers)) return pointers;
  const map = reveal(rawMap);
  const out: Record<string, unknown> = { ...(pointers as Record<string, unknown>) };
  for (const [name, spec] of Object.entries(schema.properties)) {
    if (spec['x-kind'] !== 'text' || !Object.hasOwn(out, name) || !Array.isArray(out[name])) continue;
    const refs = out[name] as unknown[];
    let start = 0;
    while (start < refs.length - 1) {
      const ref = refs[start];
      const word = typeof ref === 'string' && Object.hasOwn(map, ref) ? map[ref] : undefined;
      const lower = word?.toLowerCase();
      if (lower === undefined || !(introducers.has(lower) || LOCAL_NAME_PREFIXES.has(lower))) break;
      start++;
    }
    out[name] = refs.slice(start);
  }
  return out;
}
