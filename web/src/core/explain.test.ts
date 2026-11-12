import { describe, expect, it } from 'vitest';
import { explainRoute, parseListLines, parseStatusLines, pcm16ToFloat, pcmRate, safeSources } from './explain';

describe('explainRoute', () => {
  const base = { maxShortWords: 80, onDeviceLocales: ['en', 'es'] };
  it('is explain.short only when short enough and in a device language', () => {
    expect(explainRoute({ ...base, words: 80, locale: 'en' })).toMatchObject({ task: 'explain.short', basis: 'short' });
    expect(explainRoute({ ...base, words: 81, locale: 'en' })).toMatchObject({ task: 'explain.long', basis: 'long' });
    expect(explainRoute({ ...base, words: 10, locale: 'ko' })).toMatchObject({ task: 'explain.long', basis: 'locale' });
    expect(explainRoute({ ...base, words: 200, locale: 'ko' })).toMatchObject({ task: 'explain.long', basis: 'long' });
  });
});

describe('grounded answer parsing', () => {
  it('status lines: known ids only, first wins, bullets and separators tolerated', () => {
    const text = '- [a] Open now.\n[b]: Closed.\n[a] Second line.\n[zz] Unknown.\n[c]\nfree text';
    expect([...parseStatusLines(text, ['a', 'b', 'c'])]).toEqual([
      ['a', 'Open now.'],
      ['b', 'Closed.'],
    ]);
  });

  it('list lines: bullets and numbers, bold removed, capped', () => {
    expect(parseListLines('Intro\n- **One**: x\n2) Two\n* Three\n• Four', 3)).toEqual(['One: x', 'Two', 'Three']);
  });

  it('sources: absolute https only, deduplicated, host as fallback title', () => {
    expect(
      safeSources([
        { uri: 'https://a.example/x', title: ' A ' },
        { uri: 'http://b.example/' },
        { uri: 'javascript:alert(1)' },
        { uri: 'https://a.example/x', title: 'again' },
        { uri: 'https://c.example/p?q=1' },
        { uri: 'https://d.example/"><script>' },
      ]),
    ).toEqual([
      { uri: 'https://a.example/x', title: 'A' },
      { uri: 'https://c.example/p?q=1', title: 'c.example' },
    ]);
  });
});

describe('speech audio', () => {
  it('decodes 16-bit little-endian PCM and reads the rate', () => {
    expect([...pcm16ToFloat(new Uint8Array([0x00, 0x00, 0x00, 0x40, 0x00, 0x80, 0xff]))]).toEqual([0, 0.5, -1]);
    expect(pcmRate('audio/L16;codec=pcm;rate=24000')).toBe(24000);
    expect(pcmRate('audio/L16')).toBe(24000);
    expect(pcmRate('audio/L16;rate=5')).toBe(24000);
  });
});
