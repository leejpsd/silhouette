// The cloud evaluation, recomputed in the browser from the file itself (web/eval/results/v15p4.json):
// how many paystubs were read entirely right, and whether any value printed on a paystub appears in any
// request body sent for it. Nothing here trusts the totals written in the file.

export interface CloudEvalDocument {
  readonly id: string;
  readonly language: string;
  readonly docType: string;
  readonly layout: string;
  readonly score?: { readonly allCorrect?: boolean } | undefined;
  readonly gold: Readonly<Record<string, unknown>>;
  readonly requestBodies: readonly unknown[];
}

export interface CloudEvalFile {
  readonly date: string;
  readonly documents: readonly CloudEvalDocument[];
}

export interface Recomputed {
  /** English paystubs in the ten main layouts, and how many had every field right. */
  readonly paystubs: number;
  readonly allRight: number;
  /** Every request body of every document, and how many contained a value printed on that document. */
  readonly bodies: number;
  readonly bodiesWithValue: number;
  /** How many value strings were searched for. */
  readonly valuesSearched: number;
}

const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Values of 5+ characters: any occurrence. Shorter ones: not inside a longer word or number. */
export function appears(haystack: string, value: string): boolean {
  if (value.length >= 5) return haystack.includes(value);
  const before = /^[0-9]/.test(value) ? '(?<![0-9.,])' : '(?<![\\p{L}\\p{M}])';
  const after = /[0-9]$/.test(value) ? '(?![0-9])' : '(?![\\p{L}\\p{M}])';
  return new RegExp(`${before}${escape(value)}${after}`, 'u').test(haystack);
}

const money = (n: number, decimals: number) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Label words by language ("Gross", "Federal"): they legitimately appear in a silhouette as labels. */
export type LabelWords = Readonly<Record<string, ReadonlySet<string>>>;

const isLabelWord = (word: string, language: string, labels: LabelWords) =>
  (labels['en']?.has(word.toLowerCase()) ?? false) || (labels[language]?.has(word.toLowerCase()) ?? false);

/**
 * The values of a document as they can be printed (the same strings as web/eval/leaks.mjs): amounts
 * with and without cents, names whole, each name word that is not a label word, and each pair of
 * adjacent name words as printed ("Jordan Gross", "Gross & Daughters"). Three characters or more.
 */
export function valueStrings(gold: Readonly<Record<string, unknown>>, language: string, labels: LabelWords): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    if (s.length >= 3) out.add(s);
  };
  for (const [field, value] of Object.entries(gold)) {
    if (field === 'deductions' && Array.isArray(value)) {
      for (const d of value as { amount?: unknown }[]) if (typeof d.amount === 'number') for (const dec of [0, 2]) add(money(d.amount, dec));
    } else if (typeof value === 'number') {
      for (const dec of [0, 2]) add(money(value, dec));
      add(String(value));
    } else if (typeof value === 'string' && field !== 'payFrequency') {
      add(value);
      const words = value.split(' ');
      for (const w of words) if (!isLabelWord(w, language, labels)) add(w);
      for (let i = 0; i + 1 < words.length; i++) for (const sep of [' ', ' & ', ', ']) add(`${words[i]!}${sep}${words[i + 1]!}`);
    }
  }
  return [...out];
}

export function recompute(file: CloudEvalFile, labels: LabelWords): Recomputed {
  const paystubs = file.documents.filter((d) => d.language === 'en' && d.docType === 'paystub' && d.layout !== 'L11');
  let bodies = 0;
  let bodiesWithValue = 0;
  let valuesSearched = 0;
  for (const doc of file.documents) {
    const values = valueStrings(doc.gold, doc.language, labels);
    valuesSearched += values.length;
    for (const body of doc.requestBodies) {
      bodies++;
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      if (values.some((v) => appears(text, v))) bodiesWithValue++;
    }
  }
  return { paystubs: paystubs.length, allRight: paystubs.filter((d) => d.score?.allCorrect === true).length, bodies, bodiesWithValue, valuesSearched };
}
