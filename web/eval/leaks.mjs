// Leak check helpers: which gold values of a document may never appear in what is sent for it.
import { readFileSync } from 'node:fs';

const ALLOW = Object.fromEntries(
  ['en', 'es', 'ko'].map((l) => [l, new Set(JSON.parse(readFileSync(new URL(`../../shared/skeleton/allowlist/${l}.json`, import.meta.url), 'utf8')).words)]),
);

/** A word that is also a document label ("Gross", "Federal") legitimately appears in skeletons as a label. */
export const isLabelWord = (word, language) => ALLOW.en.has(word.toLowerCase()) || (ALLOW[language]?.has(word.toLowerCase()) ?? false);

const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Values of 5+ characters: any occurrence. Shorter ones: not inside a longer word or number. */
export function appears(haystack, value) {
  if (value.length >= 5) return haystack.includes(value);
  const before = /^[0-9]/.test(value) ? '(?<![0-9.,])' : '(?<![\\p{L}\\p{M}])';
  const after = /[0-9]$/.test(value) ? '(?![0-9])' : '(?![\\p{L}\\p{M}])';
  return new RegExp(`${before}${escapeRe(value)}${after}`, 'u').test(haystack);
}

/**
 * Gold names, dates and amounts, in the form they are printed in the document. A name is checked
 * whole, each of its words that is not a label word on its own, and each pair of adjacent words as
 * printed ("Jordan Gross", "Gross & Daughters"), so label words inside names are covered too.
 */
export function goldStrings(gold, text, language = 'en') {
  const out = new Set();
  const money = (n, decimals) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const add = (s) => {
    if (typeof s === 'string' && s.length >= 3 && appears(text, s)) out.add(s);
  };
  for (const [field, value] of Object.entries(gold)) {
    if (field === 'deductions') {
      for (const d of value) for (const dec of [0, 2]) add(money(d.amount, dec));
    } else if (typeof value === 'number') {
      for (const dec of [0, 2]) add(money(value, dec));
      add(String(value));
    } else if (typeof value === 'string' && field !== 'payFrequency') {
      add(value);
      const words = value.split(' ');
      for (const w of words) if (!isLabelWord(w, language)) add(w);
      for (let i = 0; i + 1 < words.length; i++) for (const sep of [' ', ' & ', ', ']) add(`${words[i]}${sep}${words[i + 1]}`);
    }
  }
  return [...out];
}
