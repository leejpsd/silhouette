// The deterministic checks of a reading of one silhouette (core/pointer-check.ts), as the app passes them
// to extractPointers. Shared by the document screens and the held-out evaluation, so both measure the same.
import { corePointerProblems, deductionsProblems, notReadFields, pointerProblems, unconfirmedFields, w2LeftOut, w2PointerProblems, ytdMissingWithCandidate } from '../../core/pointer-check';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import type { PlaceholderMap } from '../../core/skeleton';
import type { Raw, Skeleton } from '../../core/types';
import { PACK } from '../pack';
/** The documents a reading can be of (doc/state.tsx FlowDocType). */
type FlowDocType = 'paystub' | 'w2';

/**
 * A paystub: a core that fails is a failed attempt; deductions, names, hours or rate that fail are left
 * out as not read. A W-2 is read in one request: an answer that fails its check is a failed attempt.
 */
export function readingChecks(skeleton: Skeleton, map: Raw<PlaceholderMap>, language: string, docType: FlowDocType = 'paystub') {
  if (docType === 'w2') return { validate: (pointers: Record<string, unknown>) => w2PointerProblems(POINTER_SCHEMAS.w2, pointers, map), checkParts: undefined };
  const schema = POINTER_SCHEMAS.paystub;
  return {
    validate: (pointers: Record<string, unknown>) => pointerProblems(schema, pointers, skeleton, map, PACK.jurisdiction),
    checkParts: {
      core: (pointers: Record<string, unknown>) => corePointerProblems(schema, pointers, map, PACK.jurisdiction, skeleton),
      deductions: (pointers: Record<string, unknown>) => deductionsProblems(schema, pointers, map, PACK.jurisdiction),
      notRead: (pointers: Record<string, unknown>) => notReadFields(pointers, skeleton),
      ytdMissing: (pointers: Record<string, unknown>) => ytdMissingWithCandidate(schema, pointers, skeleton, map, PACK.jurisdiction),
      confirm: (pointers: Record<string, unknown>) => unconfirmedFields(schema, pointers, skeleton, map, PACK.jurisdiction, language),
    },
  };
}

/**
 * Every W-2 answer used, from the device or the cloud: the boxes whose answer is not money (a box number, a
 * street number) or a tax year that is not a year are left out, so the person types them; code never picks
 * another placeholder. A paystub answer is returned as it is.
 */
export function leaveOutBoxes(docType: FlowDocType, pointers: unknown, map: Raw<PlaceholderMap>) {
  if (docType !== 'w2' || pointers === null || typeof pointers !== 'object') return { pointers, leftOut: undefined };
  const left = w2LeftOut(POINTER_SCHEMAS.w2, pointers, map);
  if (left.fields.length === 0) return { pointers, leftOut: undefined };
  const kept = Object.fromEntries(Object.entries(pointers as Record<string, unknown>).filter(([k]) => !left.fields.some((f) => f.field === k)));
  return { pointers: kept, leftOut: left.fields };
}
