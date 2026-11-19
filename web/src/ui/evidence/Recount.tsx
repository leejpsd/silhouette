// "Recount from the file": the cloud evaluation's figures, recounted in this browser from the evaluation
// file itself (the documents, their answers and every request body it saved), and the file to download.
import { useState } from 'react';
import evalFileUrl from '../../../eval/results/v15p4.json?url';
import en from '../../../../shared/skeleton/allowlist/en.json';
import es from '../../../../shared/skeleton/allowlist/es.json';
import ko from '../../../../shared/skeleton/allowlist/ko.json';
import { useApp } from '../context';
import { recompute, type CloudEvalFile, type LabelWords, type Recomputed } from './cloud-eval';

const LABELS: LabelWords = Object.fromEntries(
  Object.entries({ en, es, ko }).map(([l, a]) => [l, new Set((a as { words: readonly string[] }).words.map((w) => w.toLowerCase()))]),
);

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'failed' } | { kind: 'done'; r: Recomputed };

export function Recount({ shownRight, shownTotal, shownLeaks, shownBodies }: { shownRight: number; shownTotal: number; shownLeaks: number; shownBodies: number }) {
  const { t, locale } = useApp();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const n = (v: number) => v.toLocaleString(locale);
  const run = async () => {
    setState({ kind: 'busy' });
    try {
      const res = await fetch(evalFileUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: 'done', r: recompute((await res.json()) as CloudEvalFile, LABELS) });
    } catch {
      setState({ kind: 'failed' });
    }
  };
  const r = state.kind === 'done' ? state.r : null;
  const same = r !== null && r.allRight === shownRight && r.paystubs === shownTotal && r.bodiesWithValue === shownLeaks && r.bodies === shownBodies;
  return (
    <div className="recount" data-testid="recount">
      <p className="small muted">{t('tasks.recount.lead')}</p>
      <div className="recount-actions">
        <button type="button" className="small-action recount-button" onClick={() => void run()} disabled={state.kind === 'busy'} data-testid="recount-button">
          {state.kind === 'busy' ? t('tasks.recount.busy') : t('tasks.recount.button')}
        </button>
        <a className="text-link" href={evalFileUrl} download="cloud-evaluation-v15p4.json" data-testid="recount-download">
          {t('tasks.recount.download')}
        </a>
      </div>
      <div aria-live="polite">
        {r && (
          <div data-testid="recount-result" data-same={same}>
            <ul className="recount-list small">
              <li data-testid="recount-right">{t('tasks.recount.right', { right: n(r.allRight), total: n(r.paystubs) })}</li>
              <li data-testid="recount-leaks">
                {t('tasks.recount.leaks', { leaky: n(r.bodiesWithValue), bodies: n(r.bodies), values: n(r.valuesSearched) })}
              </li>
            </ul>
            <p className="small strong">{same ? t('tasks.recount.same') : t('tasks.recount.differs')}</p>
          </div>
        )}
        {state.kind === 'failed' && (
          <p className="small block-alert" role="alert" data-testid="recount-failed">
            {t('tasks.recount.failed')}
          </p>
        )}
      </div>
    </div>
  );
}
