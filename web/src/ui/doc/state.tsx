// In-memory state of the document flow (add, preview, review). Documents are never persisted: closing or
// reloading the app forgets them. Only the confirmed yearly income is saved, as a Quick Check answer.
import { createContext, useContext } from 'react';
import type { Raw, Skeleton } from '../../core/types';
import type { PlaceholderMap } from '../../core/skeleton';
import type { ReviewField } from '../../core/review';
import type { PaystubValues, W2Values } from '../../core/validate';
import type { CloudBecause, InferenceSource, RoutingReason, TaskError } from '../../ai/tasks';
import type { Locale } from '../i18n';

export type SourceKind = 'pdf' | 'paste' | 'photo' | 'sample' | 'manual';

/** The documents this flow reads: a paystub, or a Form W-2 (recognised by its title, core/doc-type.ts). */
export type FlowDocType = 'paystub' | 'w2';

export interface Extraction {
  readonly review: readonly ReviewField[];
  /**
   * SAMPLE_KEY: a bundled sample filled from its answer key on this device, with no model.
   * RECORDED: the bundled sample read from the on-device model's recorded answer (routing.json recordedSample).
   * RECORDED_CLOUD: the bundled sample read from a recorded cloud reading of its silhouette (routing.json recordedCloud).
   */
  readonly inferenceSource: InferenceSource | 'SAMPLE_KEY' | 'RECORDED' | 'RECORDED_CLOUD';
  /** RECORDED: the machine and the date of the recording the answer comes from. */
  readonly recording?: { readonly machine: string; readonly date: string; readonly path: string } | undefined;
  readonly reason: RoutingReason;
  readonly ranInCloudBecause?: CloudBecause | undefined;
  /** Read on this device without the deductions, which it could not read reliably (they feed no result). */
  readonly deductionsNotRead?: boolean | undefined;
  /** Fields this device left out as not read (deductions, names); none feeds a result. */
  readonly notRead?: readonly string[] | undefined;
  /** W-2 boxes left out of the answer, from the device or the cloud (DEVICE_READING.md section 9), and why. */
  readonly leftOut?: readonly { readonly field: string; readonly problem: 'not-money' | 'not-a-year' | 'not-consistent' }[] | undefined;
}

export interface DocumentState {
  readonly docType: FlowDocType;
  readonly language: Locale;
  readonly sourceKind: SourceKind | null;
  readonly text: Raw<string> | null;
  readonly skeleton: Skeleton | null;
  readonly map: Raw<PlaceholderMap> | null;
  readonly extraction: Extraction | null;
  readonly photoSource: { readonly inferenceSource: InferenceSource; readonly reason: RoutingReason } | null;
  readonly error: TaskError | null;
  /** Words the user hid in the preview (lowercase); they and their phrases are masked. */
  readonly hiddenWords: readonly string[];
  /** Paystubs already confirmed in this session (for multi-paystub annualization). */
  readonly confirmedStubs: readonly PaystubValues[];
  /** W-2s already confirmed in this session (another employer's form of the same year is added). */
  readonly confirmedW2s: readonly W2Values[];
}

/** A set holds one type: with W-2s confirmed, the next document of the set is a W-2. */
export const emptyDocument = (language: Locale, confirmedStubs: readonly PaystubValues[] = [], confirmedW2s: readonly W2Values[] = []): DocumentState => ({
  docType: confirmedW2s.length > 0 ? 'w2' : 'paystub',
  language,
  sourceKind: null,
  text: null,
  skeleton: null,
  map: null,
  extraction: null,
  photoSource: null,
  error: null,
  hiddenWords: [],
  confirmedStubs,
  confirmedW2s,
});

export interface DocumentContextValue {
  readonly doc: DocumentState;
  update(patch: Partial<DocumentState>): void;
  reset(keepStubs: boolean): void;
}

export const DocumentContext = createContext<DocumentContextValue | null>(null);

export function useDocument(): DocumentContextValue {
  const value = useContext(DocumentContext);
  if (!value) throw new Error('useDocument outside DocumentContext');
  return value;
}
