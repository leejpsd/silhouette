// Which document a text is, decided by code (no model): a Form W-2 carries its own title, "Form W-2" or
// "Wage and Tax Statement", at the top. Anything else is read as a paystub.
import { reveal, type Raw } from './types';

/** How far down the title may stand: the first lines that have text. */
const TOP_LINES = 6;
const W2_TITLE = /\bW[-‐‑–]?2\b|\bwage and tax statement\b/i;

export function detectDocType(text: Raw<string>): 'paystub' | 'w2' {
  const top = reveal(text)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(0, TOP_LINES)
    .join('\n');
  return W2_TITLE.test(top) ? 'w2' : 'paystub';
}
