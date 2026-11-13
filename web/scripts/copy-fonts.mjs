// Copies the bundled typefaces (SIL OFL 1.1) from the @fontsource packages into public/fonts/:
// Latin and Latin Extended subsets of the weights the design uses, with each family's licence.
// The app never requests a font from another host.
//   node scripts/copy-fonts.mjs
import { copyFileSync, mkdirSync } from 'node:fs';

const FAMILIES = {
  'darker-grotesque': [800, 900],
  'hanken-grotesk': [400, 600, 700],
  'dm-mono': [400, 500],
};
const out = new URL('../public/fonts/', import.meta.url);
mkdirSync(out, { recursive: true });
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
