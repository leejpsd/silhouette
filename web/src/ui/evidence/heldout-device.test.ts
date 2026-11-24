// The device runs over never-seen paystubs, figured as the judges' page and #/tasks show them. They must
// agree with eval/heldout-score.mjs on the same files and with eval/results/heldout/summary.json.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heldoutDeviceFigures } from './heldout-eval';
import summary from '../../../eval/results/heldout/summary.json';
const CHROME_RUN = '../../../eval/results/heldout/device-2026-11-19T0631-chrome157-macos.json';
const IPHONE_RUN = '../../../../ios/eval/on-device/heldout/heldout-device-2026-11-24T0359-silhouette0-ios2652.json';

const json = (u: URL) => JSON.parse(readFileSync(u, 'utf8')) as never;
const goldsOf = (set: string) => {
  const dir = new URL(`../../../eval/${set}/`, import.meta.url);
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.gold.json')).map((f) => [f.replace('.gold.json', ''), json(new URL(f, dir))]));
};
const run = (path: string) => json(new URL(path, import.meta.url));

describe('device runs over never-seen paystubs', () => {
  it('Chrome 157, the first set: as the summary the tasks page shows', () => {
    const f = heldoutDeviceFigures(run(CHROME_RUN), goldsOf('heldout'));
    expect(f).toMatchObject({ documents: summary.figures.paystubs.documents, firstWrong: summary.figures.paystubs.deviceFirstWrong, retried: summary.figures.paystubs.retried, incomeWrong: summary.figures.paystubs.deviceWrong, incomeAllRight: summary.figures.paystubs.deviceAllRight });
    expect(f.stopped).toBe(f.firstWrong);
  });

  it('iPhone 17 Pro, the third set: as eval/heldout-score.mjs scores it', () => {
    const f = heldoutDeviceFigures(run(IPHONE_RUN), goldsOf('heldout-3'));
    expect(f).toEqual({ documents: 24, onDevice: 2, retried: 22, firstWrong: 22, stopped: 22, incomeAllRight: 19, incomeWrong: 1, incomeWrongFromCloud: 1 });
  });
});
