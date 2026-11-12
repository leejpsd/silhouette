// Renders the PNG app icons (same shape as public/icon.svg) without image dependencies.
// Run once: node scripts/make-icons.mjs. Output is committed in public/.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x2f, 0x43, 0xa0];
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Shape in a 48-unit box: head circle (24,14.5) r 8.5; shoulders = top half of an ellipse
// centred (24,42) rx 17 ry 15. `scale` shrinks the glyph for the maskable safe zone.
function inside(x, y, size, { rounded, scale }) {
  const u = (v) => (v / size) * 48;
  const [X, Y] = [u(x), u(y)];
  if (rounded) {
    const r = 11;
    const cx = Math.min(Math.max(X, r), 48 - r);
    const cy = Math.min(Math.max(Y, r), 48 - r);
    if ((X - cx) ** 2 + (Y - cy) ** 2 > r * r) return 'none';
  }
  const gx = 24 + (X - 24) / scale;
  const gy = 24 + (Y - 24) / scale;
  const head = (gx - 24) ** 2 + (gy - 14.5) ** 2 <= 8.5 ** 2;
  const body = gy <= 42 && ((gx - 24) / 17) ** 2 + ((gy - 42) / 15) ** 2 <= 1;
  return head || body ? 'fg' : 'bg';
}

function render(size, opts) {
  const ss = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let fg = 0, bg = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const hit = inside(x + (sx + 0.5) / ss, y + (sy + 0.5) / ss, size, opts);
        if (hit === 'fg') fg++;
        else if (hit === 'bg') bg++;
      }
      const n = ss * ss;
      const alpha = (fg + bg) / n;
      const mix = fg + bg === 0 ? 0 : fg / (fg + bg);
      const o = 1 + x * 4;
      for (let i = 0; i < 3; i++) row[o + i] = Math.round(BG[i] * (1 - mix) + FG[i] * mix);
      row[o + 3] = Math.round(alpha * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), render(192, { rounded: true, scale: 0.7 }));
writeFileSync(new URL('icon-512.png', out), render(512, { rounded: true, scale: 0.7 }));
writeFileSync(new URL('icon-512-maskable.png', out), render(512, { rounded: false, scale: 0.55 }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { rounded: false, scale: 0.7 }));
console.log('icons written');
