// In-memory state of the document flow (add, preview, review). Documents are never persisted: closing or
// reloading the app forgets them. Only the confirmed yearly income is saved, as a Quick Check answer.
import { createContext, useContext } from 'react';
import type { Raw, Skeleton } from '../../core/types';
import type { PlaceholderMap } from '../../core/skeleton';
import type { ReviewField } from '../../core/review';
import type { PaystubValues } from '../../core/validate';
import type { InferenceSource, RoutingReason, TaskError } from '../../ai/tasks';
import type { Locale } from '../i18n';

export type SourceKind = 'pdf' | 'paste' | 'photo' | 'sample' | 'manual';

export interface Extraction {
  readonly review: readonly ReviewField[];
  /** SAMPLE_KEY: a bundled sample filled from its answer key on this device, with no model. */
  readonly inferenceSource: InferenceSource | 'SAMPLE_KEY';
  readonly reason: RoutingReason;
  readonly ranInCloudBecause?: 'no-device-model' | undefined;
}

export interface DocumentState {
  readonly docType: 'paystub';
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
}

export const emptyDocument = (language: Locale, confirmedStubs: readonly PaystubValues[] = []): DocumentState => ({
  docType: 'paystub',
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
