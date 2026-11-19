import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { heldoutFigures, type HeldoutFiles } from './heldout-eval';
import summary from '../../../eval/results/heldout/summary.json';

const eval_ = (p: string) => new URL(`../../../eval/${p}`, import.meta.url);
const json = (p: string) => JSON.parse(readFileSync(eval_(p), 'utf8')) as unknown;
const sets = ['heldout', 'heldout-2'];
const golds = Object.fromEntries(sets.flatMap((s) => readdirSync(eval_(s)).filter((f) => f.endsWith('.gold.json')).map((f) => [f.replace('.gold.json', ''), json(`${s}/${f}`)]))) as Record<string, Record<string, unknown>>;
const texts = Object.fromEntries(sets.flatMap((s) => readdirSync(eval_(s)).filter((f) => f.endsWith('.txt')).map((f) => [f.replace('.txt', ''), readFileSync(eval_(`${s}/${f}`), 'utf8')])));
const labels = Object.fromEntries(['en', 'es', 'ko'].map((l) => [l, new Set((JSON.parse(readFileSync(new URL(`../../../../shared/skeleton/allowlist/${l}.json`, import.meta.url), 'utf8')) as { words: string[] }).words)]));
const files: HeldoutFiles = {
  cloud1: json('results/heldout/cloud-h36.json') as HeldoutFiles['cloud1'],
  device1: json('results/heldout/device-2026-11-19T0631-chrome157-macos.json') as HeldoutFiles['device1'],
  cloud2: json('results/heldout/heldout-2-cloud-h37.json') as HeldoutFiles['cloud2'],
  device2: json('results/heldout/heldout-2-device-2026-11-19T0705-chrome157-macos.json') as HeldoutFiles['device2'],
};

describe('the never-seen sets, figured from their result files', () => {
  it('match the summary the tasks page shows', () => {
    const figures = heldoutFigures(files, golds, texts, labels);
    expect(figures).toEqual(summary.figures);
  });
});
