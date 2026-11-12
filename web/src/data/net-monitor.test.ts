import { afterEach, describe, expect, it } from 'vitest';
import { clearOutbound, outboundEntries } from './outbound';
import { AI_LOGIC_HOST, aiPayloadText, classify, installNetMonitor } from './net-monitor';

afterEach(() => clearOutbound());

describe('network monitor', () => {
  it('extracts the text parts of a generateContent body', () => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: 'SYSTEM' }] },
      contents: [{ role: 'user', parts: [{ text: 'Document type: paystub' }, { inlineData: { data: 'x', mimeType: 'image/png' } }] }],
    });
    expect(aiPayloadText(body)).toEqual({ text: 'SYSTEM\n\nDocument type: paystub', hasInlineData: true });
    expect(classify(new URL(`https://${AI_LOGIC_HOST}/v1beta/x:generateContent`), body)).toMatchObject({
      channel: 'ai-cloud',
      fields: ['document-silhouette', 'inline-file'],
    });
  });

  it('records cross-origin requests before sending and ignores same-origin ones', async () => {
    const sent: string[] = [];
    const target = {
      fetch: (async (input: RequestInfo | URL) => {
        sent.push(String(input));
        return new Response('{}');
      }) as typeof fetch,
      location: new URL('https://app.example/') as unknown as Location,
    };
    installNetMonitor(target);
    await target.fetch('/assets/app.js');
    await target.fetch('data:image/png;base64,AAAA');
    await target.fetch(`https://${AI_LOGIC_HOST}/v1beta/models/m:generateContent`, {
      method: 'POST',
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Gross Pay ⟦N1⟧' }] }] }),
    });
    await target.fetch('https://content-firebaseappcheck.googleapis.com/v1/x:exchangeDebugToken', { method: 'POST', body: '{"debug_token":"SECRET"}' });
    expect(sent).toHaveLength(4);
    const entries = outboundEntries();
    expect(entries.map((e) => e.channel)).toEqual(['ai-cloud', 'app-check']);
    expect(entries[0]!.payload).toBe('Gross Pay ⟦N1⟧');
    expect(JSON.stringify(entries[1])).not.toContain('SECRET');
  });
});
