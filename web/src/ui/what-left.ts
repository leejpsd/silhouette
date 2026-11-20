// "Leaving your device" in plain words (contract v1.44, record.whatLeft / record.whatWent / record.whatStayed):
// a request in the record opens first on what left as a person reads it, the silhouette with its placeholder
// chips, and on what stayed (the values behind the placeholders, counted). The exact request body stays
// under "For developers". Read from the body as it was sent, so the two never disagree.

const PLACEHOLDER = /⟦([DNW])[0-9]+⟧/g;

export interface WhatLeft {
  /** The text that left, as the model received it (a document's silhouette, line numbers removed). */
  readonly text: string;
  /** The values kept on this device, by kind: one per placeholder in the silhouette. Null for a request without placeholders. */
  readonly kept: { readonly numbers: number; readonly dates: number; readonly words: number } | null;
}

/**
 * What a model request carried as text, from its exact body: the user content (for a document reading, the
 * silhouette after "Document:"). Null when the body is not a model request with text, or carries a file
 * (an image is not text a person can read here; its exact request stays under "For developers").
 */
export function whatLeft(body: string): WhatLeft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const contents = (parsed as { contents?: unknown }).contents;
  if (!Array.isArray(contents)) return null;
  const parts = contents.flatMap((c: { role?: unknown; parts?: unknown }) => (c?.role === 'user' && Array.isArray(c.parts) ? (c.parts as unknown[]) : []));
  if (parts.some((p) => typeof p === 'object' && p !== null && ('inlineData' in p || 'fileData' in p))) return null;
  const texts = parts.flatMap((p) => (typeof p === 'object' && p !== null && typeof (p as { text?: unknown }).text === 'string' ? [(p as { text: string }).text] : []));
  if (texts.length === 0) return null;
  const all = texts.join('\n\n');
  // A document reading: the silhouette follows "Document:" (shared/prompts/pointer-extract), maybe line-numbered.
  const doc = /(?:^|\n)Document:\n([\s\S]*)$/.exec(all);
  // Long runs of spaces (a document's columns) are shortened, so the lines fit beside the record.
  const text = (doc ? (doc[1] as string).split('\n').map((line) => line.replace(/^L[0-9]+: /, '')).join('\n') : all).replace(/ {4,}/g, '   ').replace(/\s+$/, '');
  const kept = { numbers: 0, dates: 0, words: 0 };
  let any = false;
  for (const m of text.matchAll(PLACEHOLDER)) {
    any = true;
    if (m[1] === 'N') kept.numbers++;
    else if (m[1] === 'D') kept.dates++;
    else kept.words++;
  }
  return { text, kept: any ? kept : null };
}

/** The text split into plain runs and placeholder ids (shown as chips). */
export function chipParts(text: string): { readonly text: string; readonly id?: string }[] {
  const out: { text: string; id?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/⟦([DNW][0-9]+)⟧/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1] as string, id: m[1] as string });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
