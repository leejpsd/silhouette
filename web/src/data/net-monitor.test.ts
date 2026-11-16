import { afterEach, describe, expect, it } from 'vitest';
import { clearOutbound, outboundState, restoreOutbound } from './outbound';
import { AI_LOGIC_HOST, BLOCKED_REASON, aiPayloadText, bodyToSend, classify, describeAiRequests, expectRequestBody, installNetMonitor, modelOf, permitCloudRequest } from './net-monitor';

afterEach(() => clearOutbound(null));

const generateBody = JSON.stringify({
  systemInstruction: { parts: [{ text: 'SYSTEM' }] },
  contents: [{ role: 'user', parts: [{ text: 'Document type: paystub\nGross Pay ⟦N1⟧' }] }],
  generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'object' } },
});

describe('network monitor', () => {
  it('extracts text parts and classifies AI Logic requests with model and full body', () => {
    expect(aiPayloadText(generateBody).text).toBe('SYSTEM\n\nDocument type: paystub\nGross Pay ⟦N1⟧');
    const url = new URL(`https://${AI_LOGIC_HOST}/v1beta/projects/p/models/gemini-3.5-flash-lite:generateContent`);
    expect(classify(url, generateBody).fields).toEqual(['model-request']);
    describeAiRequests('SYSTEM', ['document-silhouette']);
    const info = classify(url, generateBody);
    expect(info).toMatchObject({ channel: 'ai-cloud', fields: ['document-silhouette'], model: 'gemini-3.5-flash-lite' });
    describeAiRequests('OTHER', ['profile-silhouette', 'program-facts']);
    const other = generateBody.replace('SYSTEM', 'OTHER');
    expect(classify(url, other).fields).toEqual(['profile-silhouette', 'program-facts']);
    expect(JSON.parse(info.body as string)).toEqual(JSON.parse(generateBody));
    expect(modelOf('/v1beta/projects/p/models/x:generateContent')).toBe('x');
  });

  it('records the body byte for byte, keeping keys that merely contain "token"', () => {
    const body = '{"generationConfig":{"maxOutputTokens":256},"safetySettings":[],"contents":[]}';
    const info = classify(new URL(`https://${AI_LOGIC_HOST}/v1beta/projects/p/models/m:generateContent`), body);
    expect(info.body).toBe(body);
  });

  it('sends the bytes that were shown when the SDK serializes the same request, and refuses a different one', () => {
    const shown = '{"generationConfig":{"maxOutputTokens":256},"safetySettings":[],"systemInstruction":{"role":"system","parts":[{"text":"S"}]},"contents":[{"role":"user","parts":[{"text":"P"}]}]}';
    const release = expectRequestBody(shown);
    const reordered = JSON.stringify({ contents: [{ parts: [{ text: 'P' }], role: 'user' }], generationConfig: { maxOutputTokens: 256 }, safetySettings: [], systemInstruction: { role: 'system', parts: [{ text: 'S' }] } });
    expect(bodyToSend(reordered)).toBe(shown);
    const changed = reordered.replace('"P"', '"Q"');
    expect(bodyToSend(changed)).toBeNull();
    // A request no cloud-capable task registered is never sent.
    const unrelated = JSON.stringify({ systemInstruction: { parts: [{ text: 'OTHER' }] }, contents: [] });
    expect(bodyToSend(unrelated)).toBeNull();
    release();
    expect(bodyToSend(changed)).toBeNull();
    expect(bodyToSend(reordered)).toBeNull();
  });

  it('lets a request through only while a cloud-capable task permits its system instruction', () => {
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: 'POINTERS' }] }, contents: [] });
    expect(bodyToSend(body)).toBeNull();
    const release = permitCloudRequest('POINTERS');
    expect(bodyToSend(body)).toBe(body);
    expect(bodyToSend(body.replace('POINTERS', 'PERSONAL'))).toBeNull();
    release();
    expect(bodyToSend(body)).toBeNull();
  });

  it('records attempted, then sent or failed, with the reason; drops queries and App Check bodies', async () => {
    const target = {
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('fail')) throw new TypeError('Failed to fetch');
        if (url.includes('denied')) return new Response('{}', { status: 401, statusText: 'Unauthorized' });
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
      location: new URL('https://app.example/') as unknown as Location,
    };
    installNetMonitor(target);
    await target.fetch('/assets/app.js');
    await target.fetch('data:image/png;base64,AAAA');
    const release = permitCloudRequest('SYSTEM');
    const pending = target.fetch(`https://${AI_LOGIC_HOST}/v1beta/projects/p/models/m:generateContent?key=SECRETKEY`, { method: 'POST', body: generateBody });
    expect(outboundState().entries.at(-1)?.status).toBe('attempted');
    await pending;
    await target.fetch('https://content-firebaseappcheck.googleapis.com/v1/x:exchangeDebugToken', { method: 'POST', body: '{"debug_token":"SECRET"}' });
    await target.fetch(`https://${AI_LOGIC_HOST}/v1beta/models/m:generateContent/denied`, { method: 'POST', body: generateBody });
    await expect(target.fetch('https://fail.example/x', { method: 'POST', body: '{}' })).rejects.toThrow();
    release();
    // Nothing asked for this one: it is blocked before it leaves, and recorded as blocked.
    await expect(target.fetch(`https://${AI_LOGIC_HOST}/v1beta/models/m:generateContent`, { method: 'POST', body: generateBody })).rejects.toThrow(BLOCKED_REASON);

    const entries = outboundState().entries;
    expect(entries.map((e) => [e.channel, e.status])).toEqual([
      ['ai-cloud', 'sent'],
      ['app-check', 'sent'],
      ['ai-cloud', 'failed'],
      ['other', 'failed'],
      ['ai-cloud', 'blocked'],
    ]);
    expect(entries[0]).toMatchObject({ httpStatus: 200, path: '/v1beta/projects/p/models/m:generateContent', model: 'm' });
    expect(entries[2]).toMatchObject({ httpStatus: 401, error: 'HTTP 401 Unauthorized' });
    expect(entries[3]?.error).toBe('Failed to fetch');
    const stored = JSON.stringify(entries);
    expect(stored).not.toContain('SECRET');
    expect(stored).not.toContain('key=');
    expect(entries[1]?.body).toBeUndefined();
  });

  it('restores a saved ledger and keeps the deletion date when cleared', () => {
    restoreOutbound({ entries: [{ id: 'a', channel: 'ai-cloud', at: 1, destination: 'h', path: '/p', fields: [], bytes: 0, status: 'sent' }], clearedAt: null });
    expect(outboundState().entries).toHaveLength(1);
    clearOutbound(1234);
    expect(outboundState()).toEqual({ entries: [], clearedAt: 1234 });
  });
});
