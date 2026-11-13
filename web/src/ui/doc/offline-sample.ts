// routing.json `offlineSample`: a bundled sample still works with no network and no device model.
// Its fields are filled from the sample's fixed answer key on this device (shared/samples/answers.json);
// no model is used, nothing is sent, and the result is labelled as sample answers.
import routing from '../../../../shared/routing.json';
import answers from '../../../../shared/samples/answers.json';
import enText from '../../../../shared/samples/paystub-en-01.txt?raw';
import koText from '../../../../shared/samples/payslip-ko-01.txt?raw';
import { skeletonize } from '../../core/skeleton';
import { Raw, type Skeleton } from '../../core/types';
import type { RoutingReason } from '../../ai/tasks';
import { allowlistFor, introducersFor } from './allowlists';
import type { Locale } from '../i18n';

export const OFFLINE_SAMPLE_REASON = routing.offlineSample.reason as RoutingReason;

const TEXTS: Readonly<Record<string, string>> = { 'paystub-en-01.txt': enText, 'payslip-ko-01.txt': koText };

/**
 * The answer key for this silhouette, when it is the silhouette of a bundled sample with nothing
 * hidden (the keys are for that silhouette only). Null for any other document.
 */
export function sampleAnswerKey(skeleton: Skeleton): unknown {
  for (const [file, entry] of Object.entries(answers.samples)) {
    const text = TEXTS[file];
    if (text === undefined) continue;
    const locale = entry.locale as Locale;
    if (skeletonize(Raw.of(text), allowlistFor(locale), introducersFor(locale)).skeleton === skeleton) return entry.pointers;
  }
  return null;
}
