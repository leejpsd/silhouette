// The document as it is on this phone, line by line, with each placeholder's original text, for the
// preview's "On this phone" view. Built with the review screen's own reading of the placeholder map
// (core/review buildReview), so nothing else unwraps the document.
import { buildReview, type SourceSegment } from '../../core/review';
import type { PlaceholderMap, PointerSchema } from '../../core/skeleton';
import type { Raw, Skeleton } from '../../core/types';

const PLACEHOLDER = /⟦([DNW][0-9]+)⟧/g;
const WHOLE: PointerSchema = { properties: { document: { 'x-kind': 'text' } } } as unknown as PointerSchema;

/** Every line of the skeleton; lines with placeholders carry their original text per placeholder. */
export function phoneLines(skeleton: Skeleton, map: Raw<PlaceholderMap>): (readonly SourceSegment[])[] {
  const ids = [...skeleton.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
  const restored = buildReview(WHOLE, { document: ids }, skeleton, map)[0]?.source ?? [];
  let next = 0;
  return skeleton.split('\n').map((line) => {
    if (!PLACEHOLDER.test(line)) return [{ text: line }];
    PLACEHOLDER.lastIndex = 0;
    return restored[next++] ?? [{ text: line }];
  });
}
