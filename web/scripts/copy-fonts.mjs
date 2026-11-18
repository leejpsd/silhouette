// Copies the bundled typefaces (SIL OFL 1.1) from the @fontsource packages into public/fonts/:
// Latin and Latin Extended subsets of the weights the design uses, with each family's licence.
// The app never requests a font from another host.
//   node scripts/copy-fonts.mjs
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const FAMILIES = {
  'big-shoulders-display': [900],
  'inter-tight': [400, 500, 600, 700],
  'ibm-plex-mono': [400, 500, 600],
};
const out = new URL('../public/fonts/', import.meta.url);
mkdirSync(out, { recursive: true });
// Only the families above: anything else in the folder (an earlier design's fonts) is removed.
for (const file of readdirSync(out)) if (!Object.keys(FAMILIES).some((f) => file.includes(f))) rmSync(new URL(file, out));
for (const [family, weights] of Object.entries(FAMILIES)) {
  const pkg = new URL(`../node_modules/@fontsource/${family}/`, import.meta.url);
  for (const weight of weights) {
    for (const subset of ['latin', 'latin-ext']) {
      const file = `${family}-${subset}-${weight}-normal.woff2`;
      copyFileSync(new URL(`files/${file}`, pkg), new URL(file, out));
    }
  }
  copyFileSync(new URL('LICENSE', pkg), new URL(`LICENSE-${family}.txt`, out));
}
console.log('fonts copied to public/fonts/');
