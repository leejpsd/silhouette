// Turns tokens.json into CSS custom properties (light, and dark via prefers-color-scheme).
import tokens from '../../../shared/design/tokens.json';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function colorVars(scheme: Record<string, string>): string {
  return Object.entries(scheme).map(([k, v]) => `--color-${kebab(k)}:${v};`).join('');
}

export function tokensCss(): string {
  const t = tokens;
  const font = t.typography.fontFamily.text.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(',');
  const scale = Object.entries(t.typography.scale)
    .map(([k, s]) => `--type-${kebab(k)}-size:${s.size / 16}rem;--type-${kebab(k)}-line:${s.lineHeight / s.size};--type-${kebab(k)}-weight:${s.weight};--type-${kebab(k)}-tracking:${s.letterSpacing / s.size}em;`)
    .join('');
  const space = Object.entries(t.spacing).map(([k, v]) => `--space-${k}:${v / 16}rem;`).join('');
  const radius = Object.entries(t.radius).map(([k, v]) => `--radius-${k}:${v}px;`).join('');
  const size = Object.entries(t.size).map(([k, v]) => `--size-${kebab(k)}:${k === 'readingWidth' ? `${v / 16}rem` : `${v}px`};`).join('');
  const ease = `cubic-bezier(${t.motion.easing.standard.join(',')})`;
  const motion = `--motion-short:${t.motion.duration.short}ms;--motion-medium:${t.motion.duration.medium}ms;--ease-standard:${ease};`;
  return (
    `:root{color-scheme:light dark;--font-text:${font};${scale}${space}${radius}${size}${motion}${colorVars(t.color.light)}}` +
    `@media (prefers-color-scheme: dark){:root{${colorVars(t.color.dark)}}}`
  );
}

export function installTokens(doc: Document): void {
  const style = doc.createElement('style');
  style.dataset['tokens'] = 'silhouette';
  style.textContent = tokensCss();
  doc.head.prepend(style);
}
