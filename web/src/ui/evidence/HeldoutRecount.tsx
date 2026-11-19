// "Recount the never-seen sets from their files": the held-out figures recounted in this browser from the
// result files, the documents and their answer keys, and compared with the figures shown.
import { useState } from 'react';
import cloud1Url from '../../../eval/results/heldout/cloud-h36.json?url';
import device1Url from '../../../eval/results/heldout/device-2026-11-19T0631-chrome157-macos.json?url';
import cloud2Url from '../../../eval/results/heldout/heldout-2-cloud-h37.json?url';
import device2Url from '../../../eval/results/heldout/heldout-2-device-2026-11-19T0705-chrome157-macos.json?url';
import en from '../../../../shared/skeleton/allowlist/en.json';
import es from '../../../../shared/skeleton/allowlist/es.json';
import ko from '../../../../shared/skeleton/allowlist/ko.json';
import { useApp } from '../context';
import type { LabelWords } from './cloud-eval';
import { heldoutFigures, type HeldoutFigures, type HeldoutFiles } from './heldout-eval';

const LABELS: LabelWords = Object.fromEntries(
  Object.entries({ en, es, ko }).map(([l, a]) => [l, new Set((a as { words: readonly string[] }).words.map((w) => w.toLowerCase()))]),
);
// The documents and their answer keys, loaded only when a recount is asked for.
const TEXTS = import.meta.glob<string>(['../../../eval/heldout/*.txt', '../../../eval/heldout-2/*.txt'], { query: '?raw', import: 'default' });
const GOLDS = import.meta.glob<Record<string, unknown>>(['../../../eval/heldout/*.gold.json', '../../../eval/heldout-2/*.gold.json'], { import: 'default' });
const idOf = (path: string) => (path.split('/').pop() ?? '').replace(/\.gold\.json$|\.txt$/, '');

async function load(): Promise<HeldoutFigures> {
  const get = async (url: string) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return res.json() as Promise<unknown>;
  };
  const [cloud1, device1, cloud2, device2] = await Promise.all([get(cloud1Url), get(device1Url), get(cloud2Url), get(device2Url)]);
  const texts = Object.fromEntries(await Promise.all(Object.entries(TEXTS).map(async ([p, f]) => [idOf(p), await f()] as const)));
  const golds = Object.fromEntries(await Promise.all(Object.entries(GOLDS).map(async ([p, f]) => [idOf(p), await f()] as const)));
  return heldoutFigures({ cloud1, device1, cloud2, device2 } as HeldoutFiles, golds, texts, LABELS);
}

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'failed' } | { kind: 'done'; r: HeldoutFigures };

export function HeldoutRecount({ shown }: { shown: HeldoutFigures }) {
  const { t, locale } = useApp();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const n = (v: number) => v.toLocaleString(locale);
  const run = async () => {
    setState({ kind: 'busy' });
    try {
      setState({ kind: 'done', r: await load() });
    } catch {
      setState({ kind: 'failed' });
    }
  };
  const r = state.kind === 'done' ? state.r : null;
  const same = r !== null && JSON.stringify(r) === JSON.stringify(shown);
  return (
    <div className="recount" data-testid="heldout-recount">
      <div className="recount-actions">
        <button type="button" className="small-action recount-button" onClick={() => void run()} disabled={state.kind === 'busy'} data-testid="heldout-recount-button">
          {state.kind === 'busy' ? t('tasks.recount.busy') : t('tasks.heldout.recount')}
        </button>
      </div>
      <div aria-live="polite">
        {r && (
          <div data-testid="heldout-recount-result" data-same={same}>
            <ul className="recount-list small">
              <li data-testid="heldout-recount-paystubs">
                {t('tasks.heldout.recountPaystubs', { cloud: n(r.paystubs.cloudWrong), device: n(r.paystubs.deviceWrong), total: n(r.paystubs.documents) })}
              </li>
              <li data-testid="heldout-recount-w2">
                {t('tasks.heldout.recountW2', { right: n(r.w2.afterChecks.right), left: n(r.w2.afterChecks.leftOut), wrong: n(r.w2.afterChecks.wrong), total: n(r.w2.afterChecks.documents) })}
              </li>
              <li data-testid="heldout-recount-leaks">{t('tasks.heldout.recountLeaks', { leaky: n(r.leaks.withValue), bodies: n(r.leaks.bodies) })}</li>
            </ul>
            <p className="small strong">{same ? t('tasks.recount.same') : t('tasks.recount.differs')}</p>
          </div>
        )}
        {state.kind === 'failed' && (
          <p className="small block-alert" role="alert" data-testid="heldout-recount-failed">
            {t('tasks.recount.failed')}
          </p>
        )}
      </div>
    </div>
  );
}
