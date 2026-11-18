// Turns the design tokens (version 7) into CSS custom properties: the design roles (ground, ink, block,
// paper, leave, …) and the named palette (night, redact, the greys) for light and, via
// prefers-color-scheme, dark; type, spacing, radii, sizes, the transparent colours, and motion. Only role
// names are emitted; the older contract names in tokens.json are aliases and are not used by the app. The
// retired keys of the older look (shadow, rotation, grain) stay in the file for parsers and are not emitted.
// Design v8: the web reads its own copy of tokens version 7 until it is promoted to shared/design/tokens.json.
import tokens from './design/tokens.v7.json';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * The colour keys that are design roles: `ground` and everything after it, plus `focus` (the ring on
 * ground and cards, listed among the older keys). The other keys before `ground` are aliases.
 */
export const COLOR_ROLES: readonly string[] = (() => {
  const keys = Object.keys(tokens.color.light);
  return ['focus', ...keys.slice(keys.indexOf('ground'))];
})();

function colorVars(scheme: Readonly<Record<string, string>>): string {
  return COLOR_ROLES.map((k) => `--${kebab(k)}:${scheme[k]};`).join('');
}

/** A font stack with the metric-matched fallback face (src/ui/fonts.css) right after the web font. */
const family = (list: readonly string[]): string =>
  [list[0] as string, `${list[0] as string} Fallback`, ...list.slice(1)].map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(',');
const bezier = (b: readonly number[]): string => `cubic-bezier(${b.join(',')})`;

/**
 * The transparent colours of the System board, from `alpha`: the dock's text colour at 85 / 22 / 8 / 4 %
 * (white on the ink dock; ink on the light dock of the dark scheme), the 1 px border in the text colour,
 * and the scrims.
 */
function alphaVars(scheme: 'light' | 'dark'): string {
  const a = tokens.alpha;
  const on = a.onInk;
  const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(',');
  const onDock = rgb(tokens.color[scheme].onBlock);
  const text = rgb(tokens.color[scheme].ink);
  return (
    `--on-ink-ring:rgba(${onDock},${on.ring});--on-ink-border:rgba(${onDock},${on.border});--on-ink-divider:rgba(${onDock},${on.divider});--on-ink-fill:rgba(${onDock},${on.fill});` +
    `--on-ink-underline:rgba(${onDock},${a.onInkUnderline});--ink-border:rgba(${text},${a.inkBorder});--ink-border-strong:rgba(${text},${a.inkBorderStrong});` +
    `--scrim-sheet:rgba(14,14,14,${a.scrimSheet});--scrim-modal:rgba(14,14,14,${a.scrimModal});--cloud-border-on-ink:rgba(${onDock},${a.cloudBorderOnInk});`
  );
}

export function tokensCss(): string {
  const t = tokens;
  const fonts =
    `--font-display:${family(t.typography.fontFamily.display)};` +
    `--font-text:${family(t.typography.fontFamily.text)};` +
    `--font-mono:${family(t.typography.fontFamily.mono)};`;
  // Entries whose size is a note in words (the Korean display face) are skipped.
  type Step = { size: number; lineHeight: number; weight: number; letterSpacing?: number };
  const scale = (Object.entries(t.typography.scale) as [string, { size: unknown }][])
    .filter((e): e is [string, Step] => typeof e[1].size === 'number')
    .map(([k, s]) => `--type-${kebab(k)}-size:${s.size / 16}rem;--type-${kebab(k)}-line:${+(s.lineHeight / s.size).toFixed(4)};--type-${kebab(k)}-weight:${s.weight};--type-${kebab(k)}-tracking:${+((s.letterSpacing ?? 0) / s.size).toFixed(4)}em;`)
    .join('');
  const steps = t.typography.sizeSteps;
  const fit = `--display-scale-cap:${steps.displayScaleCap};--headline-floor:${steps.headlineFloor};--label-floor:${steps.labelFloor};`;
  const space = Object.entries(t.spacing)
    .filter((e): e is [string, number] => typeof e[1] === 'number')
    .map(([k, v]) => `--space-${kebab(k)}:${v / 16}rem;`)
    .join('');
  const inline = t.spacing.inline.map((v, i) => `--space-inline-${i + 1}:${v / 16}rem;`).join('');
  const [bpTop, bpRight, bpBottom, bpLeft] = t.spacing.blockPadding;
  const blockPadding = `--space-block-padding:${bpTop}px ${bpRight}px ${bpBottom}px ${bpLeft}px;`;
  const radius = Object.entries(t.radius).map(([k, v]) => `--radius-${kebab(k)}:${v}px;`).join('');
  // Numbers become lengths; a pair is width and height (the marker); a longer list is numbered
  // (row heights); a group (compact height) is flattened; notes in words are skipped.
  const length = (k: string, v: number) => `--size-${kebab(k)}:${k === 'readingWidth' ? `${v / 16}rem` : `${v}px`};`;
  const size = Object.entries(t.size as Record<string, unknown>)
    .map(([k, v]) => {
      if (typeof v === 'number') return length(k, v);
      if (Array.isArray(v)) return v.length === 2 ? `--size-${kebab(k)}-w:${v[0]}px;--size-${kebab(k)}-h:${v[1]}px;` : v.map((n, i) => `--size-${kebab(k)}-${i + 1}:${n}px;`).join('');
      if (v && typeof v === 'object')
        return Object.entries(v)
          .filter((e): e is [string, number] => typeof e[1] === 'number')
          .map(([n, x]) => length(`${k}-${n}`, x))
          .join('');
      return '';
    })
    .join('');
  const wide = t.layout.wide;
  // The phone headline measure is unitless: wide screens keep it in em at each headline's design size.
  const layout = `--wide-content-max:${wide.contentMax}px;--wide-column-max:${wide.startHeadlineMaxWidth}px;--wide-block-width:${wide.blockWidth}px;--wide-gap:${wide.gap}px;--phone-measure:${t.layout.phone.headlineMeasure};`;
  const duration = Object.entries(t.motion.duration).map(([k, v]) => `--duration-${kebab(k)}:${v}ms;`).join('');
  const easing = Object.entries(t.motion.easing).map(([k, v]) => `--ease-${kebab(k)}:${bezier(v)};`).join('');
  const delay = Object.entries(t.motion.delay).map(([k, v]) => `--delay-${kebab(k)}:${v}ms;`).join('');
  // The checkbox tick, drawn in the dock colour on the selected tile's text colour (an SVG cannot read
  // custom properties, so light and dark each get their own image).
  const tick = (stroke: string) =>
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6.5 12.5l3.5 3.5 7.5-8' fill='none' stroke='${encodeURIComponent(stroke)}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
  // Also drawn in the card colour, for a check in the text colour on a card or a raised row.
  const check = (scheme: 'light' | 'dark') => `--check-image:${tick(t.color[scheme].block)};--check-image-card:${tick(t.color[scheme].card)};`;
  return (
    `:root{color-scheme:light dark;${fonts}${scale}${fit}${space}${inline}${blockPadding}${layout}${radius}${size}${duration}${easing}${delay}${check('light')}` +
    `${colorVars(t.color.light)}${alphaVars('light')}}` +
    `@media (prefers-color-scheme: dark){:root{${check('dark')}${colorVars(t.color.dark)}${alphaVars('dark')}}}`
  );
}

export function installTokens(doc: Document): void {
  const style = doc.createElement('style');
  style.dataset['tokens'] = 'silhouette';
  style.textContent = tokensCss();
  doc.head.prepend(style);
}

/** Width from which the app uses two columns (content left, block right). */
export const WIDE_FROM: number = tokens.layout.wide.from;
/** Display type scales with the system text size up to this factor. */
export const DISPLAY_SCALE_CAP: number = tokens.typography.sizeSteps.displayScaleCap;
export const HEADLINE_FLOOR: number = tokens.typography.sizeSteps.headlineFloor;
export const LABEL_FLOOR: number = tokens.typography.sizeSteps.labelFloor;
