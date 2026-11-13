// Turns shared/design/tokens.json into CSS custom properties: the design roles (ground, ink, block,
// paper, leave, …) for light and, via prefers-color-scheme, dark; type, spacing, radii, sizes,
// shadows, rotations, motion and the grain. Only role names are emitted; the older contract names in
// tokens.json are aliases and are not used by the app.
import tokens from '../../../shared/design/tokens.json';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** The colour keys that are design roles (the keys before `ground` are aliases kept for other code). */
export const COLOR_ROLES: readonly string[] = (() => {
  const keys = Object.keys(tokens.color.light);
  return keys.slice(keys.indexOf('ground'));
})();

function colorVars(scheme: Readonly<Record<string, string>>): string {
  return COLOR_ROLES.map((k) => `--${kebab(k)}:${scheme[k]};`).join('');
}

/** A font stack with the metric-matched fallback face (src/ui/fonts.css) right after the web font. */
const family = (list: readonly string[]): string =>
  [list[0] as string, `${list[0] as string} Fallback`, ...list.slice(1)].map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(',');
const bezier = (b: readonly number[]): string => `cubic-bezier(${b.join(',')})`;

/** The grain as one SVG tile (fractal noise from the grain tokens), for a single fixed layer. */
export function grainTile(): string {
  const g = tokens.grain;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>` +
    `<filter id='n'><feTurbulence type='${g.type}' baseFrequency='${g.baseFrequency}' numOctaves='${g.numOctaves}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${g.alpha} 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

export function tokensCss(): string {
  const t = tokens;
  const fonts =
    `--font-display:${family(t.typography.fontFamily.display)};` +
    `--font-text:${family(t.typography.fontFamily.text)};` +
    `--font-mono:${family(t.typography.fontFamily.mono)};`;
  type Step = { size: number; lineHeight: number; weight: number; letterSpacing: number };
  const scale = (Object.entries(t.typography.scale) as [string, { size: unknown }][])
    .filter((e): e is [string, Step] => typeof e[1].size === 'number')
    .map(([k, s]) => `--type-${kebab(k)}-size:${s.size / 16}rem;--type-${kebab(k)}-line:${+(s.lineHeight / s.size).toFixed(4)};--type-${kebab(k)}-weight:${s.weight};--type-${kebab(k)}-tracking:${+(s.letterSpacing / s.size).toFixed(4)}em;`)
    .join('');
  const space = Object.entries(t.spacing)
    .filter((e): e is [string, number] => typeof e[1] === 'number')
    .map(([k, v]) => `--space-${kebab(k)}:${v / 16}rem;`)
    .join('');
  const [bpTop, bpRight, bpBottom, bpLeft] = t.spacing.blockPadding;
  const blockPadding = `--space-block-padding:${bpTop}px ${bpRight}px ${bpBottom}px ${bpLeft}px;`;
  const radius = Object.entries(t.radius).map(([k, v]) => `--radius-${kebab(k)}:${v}px;`).join('');
  const size = Object.entries(t.size)
    .map(([k, v]) => (Array.isArray(v) ? `--size-${kebab(k)}-w:${v[0]}px;--size-${kebab(k)}-h:${v[1]}px;` : `--size-${kebab(k)}:${k === 'readingWidth' ? `${(v as number) / 16}rem` : `${v}px`};`))
    .join('');
  const shadow = Object.entries(t.shadow)
    .filter(([k]) => k !== 'note')
    .map(([k, v]) => `--shadow-${kebab(k)}:${v};`)
    .join('');
  const rotation = Object.entries(t.rotation)
    .map(([k, v]) => (Array.isArray(v) ? `--rotate-${kebab(k)}-a:${v[0]}deg;--rotate-${kebab(k)}-b:${v[1]}deg;` : `--rotate-${kebab(k)}:${v}deg;`))
    .join('');
  const duration = Object.entries(t.motion.duration).map(([k, v]) => `--duration-${kebab(k)}:${v}ms;`).join('');
  const easing = Object.entries(t.motion.easing).map(([k, v]) => `--ease-${kebab(k)}:${bezier(v)};`).join('');
  const delay = Object.entries(t.motion.delay).map(([k, v]) => `--delay-${kebab(k)}:${v}ms;`).join('');
  const grain = `--grain-image:${grainTile()};--grain-opacity:${t.grain.opacity};`;
  // The checkbox tick, drawn in onLeave on the pink fill (an SVG cannot read custom properties).
  const tick = encodeURIComponent(t.color.light.onLeave);
  const check = `--check-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6.5 12.5l3.5 3.5 7.5-8' fill='none' stroke='${tick}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");`;
  return (
    `:root{color-scheme:light dark;${fonts}${scale}${space}${blockPadding}${radius}${size}${shadow}${rotation}${duration}${easing}${delay}${grain}${check}` +
    `--grain-blend:${t.grain.blend.light};${colorVars(t.color.light)}}` +
    `@media (prefers-color-scheme: dark){:root{--grain-blend:${t.grain.blend.dark};${colorVars(t.color.dark)}}}`
  );
}

export function installTokens(doc: Document): void {
  const style = doc.createElement('style');
  style.dataset['tokens'] = 'silhouette';
  style.textContent = tokensCss();
  doc.head.prepend(style);
}
