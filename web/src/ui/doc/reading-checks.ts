// The deterministic checks of a reading of one silhouette (core/pointer-check.ts), as the app passes them
// to extractPointers. Shared by the document screens and the held-out evaluation, so both measure the same.
import { corePointerProblems, deductionsProblems, notReadFields, pointerProblems, unconfirmedFields, w2PointerProblems, ytdMissingWithCandidate } from '../../core/pointer-check';
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
