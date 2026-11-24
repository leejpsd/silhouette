// The judges' path keeps its rails: once it is started from "For judges", the results and the review
// each show the next step as one card, so the model step (the sample paystub) is one press away from the
// first results instead of a page the judge has to go back to.
import { useState } from 'react';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { useApp } from '../context';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { useDocument, type DocumentContextValue } from '../doc/state';
import { Play } from '../design/icons';
import { navigate } from '../router';
import { OPEN_RECORD_EVENT } from '../Chrome';
import sampleText from '../../../../shared/samples/paystub-en-01.txt?raw';

const KEY = 'silhouette.judges-path';
const AUTO = 'silhouette.judges-auto';

/**
 * "Run all three steps" (judges.runAll): the stage the one-press path is at. Each screen takes its stage
 * once, does what the person would press there, and hands on: the preview reads the sample (on this
 * device when it has the model, otherwise a recording, then its silhouette in the cloud now, or the
 * recorded cloud reading when that does not complete; the button's words say the silhouette is sent), the review
 * confirms the values that decide the result and uses them, and the results open.
 */
export type AutoStage = 'read' | 'use';

export function setAutoRun(stage: AutoStage | null): void {
  try {
    if (stage) sessionStorage.setItem(AUTO, stage);
    else sessionStorage.removeItem(AUTO);
  } catch {
    // Without storage the steps simply wait for the person.
  }
}

/** Takes the stage if it is the one asked for: true once, then the stage is cleared. */
export function takeAutoRun(stage: AutoStage): boolean {
  try {
    if (sessionStorage.getItem(AUTO) !== stage) return false;
    sessionStorage.removeItem(AUTO);
    return true;
  } catch {
    return false;
  }
}

/** Presses the control once it is there and enabled, waiting up to `ms`; false if it never came. */
export async function pressWhenReady(selector: string, ms: number, live: () => boolean): Promise<boolean> {
  for (let waited = 0; waited <= ms && live(); waited += 100) {
    const el = document.querySelector<HTMLButtonElement>(selector);
    if (el && !el.disabled) {
      el.click();
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export function startJudgesPath(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Without storage the path simply has no "next" cards.
  }
}

export function endJudgesPath(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to end.
  }
}

export const onJudgesPath = (): boolean => {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** Step 1: the bundled sample paystub, opened on its silhouette. */
export function openSamplePaystub(update: DocumentContextValue['update']): void {
  const text = Raw.of(sampleText);
  const { skeleton, map } = skeletonize(text, allowlistFor('en'), introducersFor('en'));
  update({ docType: 'paystub', confirmedW2s: [], text, skeleton, map, sourceKind: 'sample', language: 'en', extraction: null, error: null, hiddenWords: [], photoSource: null });
  navigate({ name: 'doc-preview' });
}

/**
 * The next step of the judges' path, when that path is in use: 1 the sample paystub read by a model,
 * 2 the results it sharpens, 3 what left the device.
 */
export function JudgeNext({ step }: { step: 1 | 2 | 3 }) {
  const { t } = useApp();
  const { update } = useDocument();
  const [active] = useState(onJudgesPath);
  if (!active) return null;
  const run = () => (step === 1 ? openSamplePaystub(update) : step === 2 ? navigate({ name: 'results' }) : window.dispatchEvent(new Event(OPEN_RECORD_EVENT)));
  return (
    <button type="button" className="judge-next" onClick={run} data-testid={`judge-next-${step}`}>
      <span className="judge-next-text">
        <span className="judge-next-eyebrow">{t('judges.next', { n: step })}</span>
        <span className="judge-next-title">{t(step === 1 ? 'judges.step1.title' : step === 2 ? 'judges.step2.title' : 'judges.step3.title')}</span>
      </span>
      <span className="judge-next-disc" aria-hidden="true">
        <Play />
      </span>
    </button>
  );
}
