// "Leaving your device" in plain words (contract v1.44): what a request carried, read from its exact body.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chipParts, whatLeft } from './what-left';

const recording = JSON.parse(readFileSync(new URL('../../eval/results/cloud-recording/sample-cloud-2026-11-19.json', import.meta.url), 'utf8')) as { requestBody: string };

describe('whatLeft', () => {
  it('reads the silhouette of a document reading, and counts the values kept here', () => {
    const w = whatLeft(recording.requestBody)!;
    expect(w.text.startsWith('⟦W1⟧ ⟦W2⟧ ⟦W3⟧')).toBe(true);
    expect(w.text).toContain('Gross Pay   ⟦N12⟧');
    expect(w.text).not.toContain('Document type');
    expect(w.kept).toEqual({ numbers: 22, dates: 3, words: 12 });
  });

  it('removes line numbers', () => {
    const body = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Document type: paystub\nDocument:\nL01: Gross ⟦N1⟧\nL02: Paid ⟦D1⟧' }] }] });
    expect(whatLeft(body)).toEqual({ text: 'Gross ⟦N1⟧\nPaid ⟦D1⟧', kept: { numbers: 1, dates: 1, words: 0 } });
  });

  it('shows another request as its text, with nothing counted', () => {
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: 'system' }] }, contents: [{ role: 'user', parts: [{ text: 'Explain this program.' }] }] });
    expect(whatLeft(body)).toEqual({ text: 'Explain this program.', kept: null });
  });

  it('has no plain words for a request with a file, or a body that is not a model request', () => {
    expect(whatLeft(JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Read it' }, { inlineData: { mimeType: 'image/png', data: 'x' } }] }] }))).toBeNull();
    expect(whatLeft('not json')).toBeNull();
    expect(whatLeft('{}')).toBeNull();
  });
});

describe('chipParts', () => {
  it('splits the text into runs and placeholder ids', () => {
    expect(chipParts('Gross ⟦N12⟧ on ⟦D3⟧')).toEqual([{ text: 'Gross ' }, { text: 'N12', id: 'N12' }, { text: ' on ' }, { text: 'D3', id: 'D3' }]);
  });
});
