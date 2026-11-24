// The device runs over never-seen paystubs, counted in this browser from their run files and the sets'
// answer keys (only the .gold.json files; the documents are not loaded): Chrome 157 on the first set
// (web/eval/heldout/) and the iPhone 17 Pro on the third (web/eval/heldout-3/), the iPhone's run file as
// committed in ios/eval/on-device/heldout/. A test checks these against eval/heldout-score.mjs.
import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { heldoutDeviceFigures, type HeldoutDeviceFigures } from './heldout-eval';

const GOLDS_1 = import.meta.glob<Record<string, unknown>>('../../../eval/heldout/*.gold.json', { import: 'default' });
const GOLDS_3 = import.meta.glob<Record<string, unknown>>('../../../eval/heldout-3/*.gold.json', { import: 'default' });
const idOf = (path: string) => (path.split('/').pop() ?? '').replace(/\.gold\.json$/, '');

/** When each run was made (the run files' own dates). */
export const HELDOUT_RUN_DATES = { chrome: '2026-11-19', iphone: '2026-11-24' } as const;

export interface HeldoutDevices {
  readonly chrome: HeldoutDeviceFigures;
  readonly iphone: HeldoutDeviceFigures;
}

async function golds(glob: typeof GOLDS_1) {
  return Object.fromEntries(await Promise.all(Object.entries(glob).map(async ([p, f]) => [idOf(p), await f()] as const)));
}

let cached: Promise<HeldoutDevices> | null = null;
export function loadHeldoutDevices(): Promise<HeldoutDevices> {
  cached ??= (async () => {
    const [chromeRun, iphoneRun, gold1, gold3] = await Promise.all([
      import('../../../eval/results/heldout/device-2026-11-19T0631-chrome157-macos.json').then((m) => m.default),
      import('../../../../ios/eval/on-device/heldout/heldout-device-2026-11-24T0359-silhouette0-ios2652.json').then((m) => m.default),
      golds(GOLDS_1),
      golds(GOLDS_3),
    ]);
    type Run = Parameters<typeof heldoutDeviceFigures>[0];
    return { chrome: heldoutDeviceFigures(chromeRun as unknown as Run, gold1), iphone: heldoutDeviceFigures(iphoneRun as unknown as Run, gold3) };
  })();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

export function useHeldoutDevices(): HeldoutDevices | null {
  const [value, setValue] = useState<HeldoutDevices | null>(null);
  useEffect(() => {
    let live = true;
    loadHeldoutDevices().then(
      (v) => live && setValue(v),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return value;
}

/** One run in a line of short facts, numbers first. */
export function useHeldoutLine(): (f: HeldoutDeviceFigures) => string {
  const { t, locale } = useApp();
  const n = (v: number) => v.toLocaleString(locale);
  return (f) =>
    [
      t('judges.heldout.first', { first: n(f.firstWrong), total: n(f.documents), stopped: n(f.stopped) }),
      t('judges.heldout.retried', { retried: n(f.retried) }),
      t('judges.heldout.stayed', { onDevice: n(f.onDevice) }),
      t('judges.heldout.allRight', { allRight: n(f.incomeAllRight) }),
      t(f.incomeWrong > 0 && f.incomeWrongFromCloud === f.incomeWrong ? 'judges.heldout.wrongCloud' : 'judges.heldout.wrong', { wrong: n(f.incomeWrong), total: n(f.documents) }),
    ].join(' · ');
}
