// WCAG 2.2 AA contrast for the token pairs the UI uses (1.4.3 text 4.5:1, 1.4.11 controls 3:1).
import { describe, expect, it } from 'vitest';

import tokens from '../../../shared/design/tokens.json';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT_ON = ['background', 'surface', 'surfaceSunken'] as const;
const TEXT = ['text', 'textMuted', 'primary', 'verdictLikely', 'verdictMaybe', 'verdictDepends', 'verdictUnlikely', 'danger'] as const;
const PAIRS = [['onPrimary', 'primary'], ['onNotice', 'notice'], ['onPrivate', 'private'], ['onDanger', 'danger']] as const;

describe('design tokens', () => {
  for (const mode of ['light', 'dark'] as const) {
    const c = tokens.color[mode];
    it(`${mode}: text colors reach 4.5:1 on every surface`, () => {
      for (const fg of TEXT) for (const bg of TEXT_ON) expect(ratio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const [fg, bg] of PAIRS) expect(ratio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: control borders and focus ring reach 3:1`, () => {
      for (const bg of TEXT_ON) {
        expect(ratio(c.borderStrong, c[bg]), `borderStrong on ${bg}`).toBeGreaterThanOrEqual(3);
        expect(ratio(c.focus, c[bg]), `focus on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
