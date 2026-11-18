// The device noun: how iOS and Android name the thing the person holds.
// Rule: copy/PLATFORM_VARIANTS.md, section "The device noun". Table: copy/platform/device-noun.json.
import fs from 'node:fs';

const table = JSON.parse(fs.readFileSync(new URL('../copy/platform/device-noun.json', import.meta.url), 'utf8'));
const LETTER = /[\p{L}\p{M}\p{N}]/u;

/** The text a platform shows for one copy string. Web shows it unchanged. */
export function forPlatform(text, language, platform, nouns = table) {
  const map = nouns[language]?.[platform];
  if (!map || typeof text !== 'string') return text;
  const phrases = Object.keys(map).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  let out = '';
  let i = 0;
  scan: while (i < text.length) {
    // Never rewrite inside a {placeholder}.
    if (text[i] === '{') {
      const end = text.indexOf('}', i);
      if (end !== -1) { out += text.slice(i, end + 1); i = end + 1; continue; }
    }
    for (const phrase of phrases) {
      if (!text.startsWith(phrase, i)) continue;
      const before = i === 0 ? '' : text[i - 1];
      const after = text[i + phrase.length] ?? '';
      // Whole words only, and not half of a compound such as "on-device" or "device-first".
      if (LETTER.test(before) || before === '-' || LETTER.test(after) || after === '-') continue;
      out += map[phrase];
      i += phrase.length;
      continue scan;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/** The copy key a platform reads: its own variant when there is one, the plain key otherwise. */
export function lookup(copy, key, platform) {
  return copy[`${key}.${platform}`] ?? copy[key];
}
