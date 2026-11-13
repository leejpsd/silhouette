import { readFileSync } from 'node:fs';
// WCAG 2.2 AA contrast for the colour pairs the UI uses (1.4.3 text 4.5:1, 1.4.11 controls and focus
// 3:1), by design role, and the rule that pink is a fill that needs an inner border where it is weak.
import { describe, expect, it } from 'vitest';

import tokens from '../../../shared/design/tokens.json';
import { COLOR_ROLES, tokensCss } from './tokens';

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

type Role = keyof typeof tokens.color.light;

/** Text pairs: [text, surface]. */
const TEXT: readonly (readonly [Role, Role])[] = [
  ['ink', 'ground'],
  ['inkMuted', 'ground'],
  ['ink', 'card'],
  ['inkMuted', 'card'],
  ['onBlock', 'block'],
  ['onBlockMuted', 'block'],
  ['ground', 'block'], // the ground-filled action inside the block, read in reverse
  ['ink', 'ground'],
  ['onPaper', 'paper'],
  ['onPaperMuted', 'paper'],
  ['onLeave', 'leave'],
  ['onMine', 'mine'],
];

/** Focus rings and control outlines: [ring or border, what it sits on]. */
const UI: readonly (readonly [Role, Role])[] = [
  ['focus', 'ground'],
  ['focus', 'card'],
  ['blockFocus', 'block'],
  ['leaveFocus', 'leave'],
  ['onPaper', 'paper'],
  ['ink', 'ground'],
  ['onBlock', 'block'],
];

describe('design tokens (roles)', () => {
  for (const mode of ['light', 'dark'] as const) {
    const c = tokens.color[mode];
    it(`${mode}: text pairs reach 4.5:1`, () => {
      for (const [fg, bg] of TEXT) expect(ratio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: focus rings and outlines reach 3:1`, () => {
      for (const [fg, bg] of UI) expect(ratio(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    });
    it(`${mode}: pink is never text, and where it is weak against its surface it needs the onLeave border`, () => {
      // The inner border (1.5 px onLeave) is what makes the shape visible there; it must itself reach 3:1.
      for (const bg of ['ground', 'paper', 'block'] as const) {
        if (ratio(c.leave, c[bg]) < 3) expect(ratio(c.leaveFocus, c[bg]), `onLeave border on ${bg}`).toBeGreaterThanOrEqual(3);
      }
      expect(ratio(c.onLeave, c.leave)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the app emits role names only, never the older alias names', () => {
    const css = tokensCss();
    for (const role of COLOR_ROLES) expect(css).toContain(`--${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:`);
    for (const alias of ['background', 'surface', 'text-muted', 'primary', 'verdict-likely', 'danger']) expect(css).not.toContain(`--color-${alias}:`);
    expect(COLOR_ROLES).toContain('ground');
    expect(COLOR_ROLES).toContain('focus');
  });

  it('every value the stylesheet uses comes from the tokens, and none is emitted broken', () => {
    const css = tokensCss();
    expect(css).not.toMatch(/undefined|NaN|\[object Object\]/);
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    const defined = new Set([...css.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    // Custom properties the stylesheet defines itself, or that are set at run time.
    for (const m of styles.matchAll(/(--[a-z0-9-]+):/g)) defined.add(m[1]);
    for (const own of ['--block-covers', '--chars', '--design']) defined.add(own);
    const used = new Set([...styles.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
    for (const name of used) expect(defined.has(name), name).toBe(true);
  });

  it('the wide layout starts where layout.wide says, and compact height where size.compact says', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(styles).toContain(`@media (min-width: ${tokens.layout.wide.from}px)`);
    const under = Number(/under (\d+) px tall/.exec(tokens.size.compact.note)?.[1]);
    expect(styles).toContain(`@media (max-height: ${under - 1}px)`);
  });
});
