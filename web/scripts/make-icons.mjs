// Renders the PNG app icons from one drawing: an ink square, a white silhouette and an orange chip (the
// colour of everything that may leave the device). public/icon.svg is the favicon; the PNGs are the
// installed-app icons. Run once after changing the drawing: node scripts/make-icons.mjs (needs
// rsvg-convert, from librsvg). Output is committed in public/.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const INK = '#0E0E0E';
const GLYPH = `<g fill="#FFFFFF"><circle cx="20" cy="17" r="7"/><path d="M6 40c0-8.3 6.3-13 14-13s14 4.7 14 13z"/></g><rect x="27" y="29" width="15" height="10" rx="3.5" fill="#FF5B1F" stroke="${INK}" stroke-width="2" paint-order="stroke"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`;

// The favicon and the regular icons: rounded. The maskable icon fills the square and keeps the glyph in
// the safe zone; the Apple touch icon is square (the system rounds it).
const rounded = svg(`<rect width="48" height="48" rx="11" fill="${INK}"/>${GLYPH}`);
const maskable = svg(`<rect width="48" height="48" fill="${INK}"/><g transform="translate(9.6 9.6) scale(0.6)">${GLYPH}</g>`);
const square = svg(`<rect width="48" height="48" fill="${INK}"/>${GLYPH}`);

const pub = new URL('../public/', import.meta.url).pathname;
writeFileSync(join(pub, 'icon.svg'), `${rounded}\n`);
const dir = mkdtempSync(join(tmpdir(), 'icons-'));
const render = (source, size, out) => {
  const file = join(dir, `${out}.svg`);
  writeFileSync(file, source);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), file, '-o', join(pub, out)]);
};
render(rounded, 192, 'icon-192.png');
render(rounded, 512, 'icon-512.png');
render(maskable, 512, 'icon-512-maskable.png');
render(square, 180, 'apple-touch-icon.png');
console.log('icons written to public/');
