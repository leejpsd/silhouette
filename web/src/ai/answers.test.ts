// Explanations, prepared and typed questions, grounded tasks and speech, with the model faked at the
// ai/ boundary. Response shapes follow the Firebase AI Logic SDK (groundingMetadata with
// searchEntryPoint.renderedContent and groundingChunks; inlineData audio parts).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HybridParams } from 'firebase/ai';

import { Raw, asPublic } from '../core/types';
import { generalize, type Bands } from '../core/generalize';
import type { RulePack } from '../core/rules';
import { setConfigForTests } from '../data/remote-config';
import { classify } from '../data/net-monitor';
import { setModelProviderForTests, type ModelResponse } from './model-port';
import {
  askChip,
  discoverLeads,
  explainProgram,
  nearbyHelp,
  planAskChip,
  planCurrentStatus,
  planExplain,
  planNearby,
  programCurrentStatus,
  readAloud,
  requestBody,
  TTS_MODEL,
  type ExplainInput,
  type ProgramFacts,
} from './tasks';
import { askFreeText, explainPersonal, type PersonalResult } from './on-device';
import { setDeviceModelForTests } from './device-fake';
import { ASK_V4, EXPLAIN_V5 } from './prompts';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const pack = JSON.parse(shared('rulepacks/zz-test/pack.json')) as RulePack;
const bands = JSON.parse(shared('bands/zz-test.json')) as Bands;

const profile = generalize(Raw.of({ jurisdiction: 'zz-test', annualIncome: 21000, householdSize: 3, housing: 'renter' }), bands);
const facts: ProgramFacts = {
  programId: 'utility-discount',
  name: 'Test Utility Discount',
  facts: 'A discount on the monthly bill.\nThis program uses: Yearly income; Housing.\nThis program checks: Your income is under the limit; You rent or own your home.',
};
const input: ExplainInput = asPublic({ program: facts, locale: 'en' });

interface Call {
  params: HybridParams;
  prompts: unknown[];
}

function fake(reply: (params: HybridParams) => Partial<ModelResponse> | Error) {
  const calls: Call[] = [];
  setModelProviderForTests(async (params) => {
    const call: Call = { params, prompts: [] };
    calls.push(call);
    return {
      async generateContent(request) {
        call.prompts.push(request);
        const r = reply(params);
        if (r instanceof Error) throw r;
        return { response: { text: () => '', ...r } as ModelResponse };
      },
    };
  });
  return calls;
}

afterEach(() => {
  setDeviceModelForTests('absent');
  setModelProviderForTests(null);
  setConfigForTests(null);
});

describe('nothing about the person', () => {
  it('the general explanation and prepared questions carry the program only: no profile, criterion states or verdict', () => {
    for (const plan of [planExplain(input, 'short'), planExplain(input, 'long'), planAskChip(input, asPublic({ id: 'change', question: 'What could change this result?' }))]) {
      expect(plan.prompt).not.toMatch(/Profile|incomeBand|householdSize|renter|Met from|Not met|Checked on the device|likely|qualif/i);
      expect(requestBody(plan)).not.toMatch(/incomeBand|"housing"|Met from the general facts/);
      expect(plan.fields).not.toContain('profile-silhouette');
    }
  });

  it('a Generalized profile does not type-check as the input', () => {
    // @ts-expect-error the input is Public only (routing.json: explain.* and ask.chip take Public)
    planExplain({ profile, program: facts, locale: 'en' }, 'short');
    // @ts-expect-error a plain object is not Public either
    planAskChip({ program: facts, locale: 'en' }, asPublic({ id: 'apply', question: 'How do I apply?' }));
  });
});

describe('explain.short / explain.long routing', () => {
  it('a short English explanation is explain.short, PREFER_ON_DEVICE, reason short-text', () => {
    const plan = planExplain(input, 'short');
    expect(plan).toMatchObject({ taskId: 'explain.short', mode: 'PREFER_ON_DEVICE', reason: 'short-text' });
    expect(plan.route).toMatchObject({ basis: 'short', words: 60, maxShortWords: 80 });
  });

  it('a long explanation, or a language the device lacks, is explain.long, PREFER_IN_CLOUD', () => {
    expect(planExplain(input, 'long')).toMatchObject({ taskId: 'explain.long', mode: 'PREFER_IN_CLOUD', reason: 'long-or-unsupported-locale', route: { basis: 'long' } });
    expect(planExplain({ ...input, locale: 'ko' }, 'short')).toMatchObject({ taskId: 'explain.long', route: { basis: 'locale' } });
  });

  it('follows the Remote Config threshold and locale list', () => {
    setConfigForTests({ routeShortTextMaxWords: 40 });
    expect(planExplain(input, 'short').taskId).toBe('explain.long');
    setConfigForTests({ onDeviceLocales: ['en', 'ko'] });
    expect(planExplain({ ...input, locale: 'ko' }, 'short').taskId).toBe('explain.short');
  });

  it('fills shared/prompts/explain.v5.md with the program name and its information only', () => {
    const plan = planExplain(input, 'short');
    expect(plan.systemInstruction).toBe(EXPLAIN_V5.system.replace('{locale}', 'English'));
    expect(plan.prompt).toBe(['Program: Test Utility Discount', `Information about this program: ${facts.facts}`, 'Write 60 words or fewer.'].join('\n'));
  });

  it('prepared questions use shared/prompts/ask.v4.md', () => {
    const plan = planAskChip(input, asPublic({ id: 'apply', question: 'How do I apply?' }));
    expect(plan.systemInstruction).toBe(ASK_V4.system.replace('{locale}', 'English'));
    expect(plan.prompt).toBe(['Program: Test Utility Discount', `Information about this program: ${facts.facts}`, 'Question: How do I apply?', 'Write 80 words or fewer.'].join('\n'));
  });
});

describe('running explanations and chips', () => {
  it('returns the answer with source, reason and route; the chip answer too', async () => {
    const calls = fake(() => ({ text: () => ' This program lowers utility bills… ', inferenceSource: 'on_device' }));
    const result = await explainProgram(planExplain(input, 'short'));
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'short-text', route: { words: 60 } });
    expect(result.value.text).toBe('This program lowers utility bills…');
    expect(calls[0]!.params.mode).toBe('prefer_on_device');
    const chip = await askChip(planAskChip(input, asPublic({ id: 'apply', question: 'How do I apply?' })));
    expect(chip.reason).toBe('prepared-question');
    expect(calls[1]!.prompts[0]).toContain('Question: How do I apply?');
  });

  it('an on-device failure is repeated once in the cloud with reason on-device-failed', async () => {
    const calls = fake((p) => (p.mode === 'prefer_on_device' ? Object.assign(new Error('The input is too large'), {}) : { text: () => 'ok', inferenceSource: 'in_cloud' }));
    const result = await explainProgram(planExplain(input, 'short'));
    expect(result).toMatchObject({ inferenceSource: 'IN_CLOUD', reason: 'on-device-failed' });
    expect(calls.map((c) => c.params.mode)).toEqual(['prefer_on_device', 'only_in_cloud']);
  });

  it('the body shown is the SDK serialization, keys and order included, and the record names what it carries', () => {
    const plan = planExplain(input, 'long');
    const body = requestBody(plan);
    expect(Object.keys(JSON.parse(body) as object)).toEqual(['generationConfig', 'safetySettings', 'systemInstruction', 'contents']);
    expect(body).toContain('"maxOutputTokens":720');
    expect(JSON.parse(body)).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: plan.prompt }] }],
      systemInstruction: { role: 'system', parts: [{ text: plan.systemInstruction }] },
      safetySettings: [],
    });
    fake(() => ({ text: () => 'x' }));
    void explainProgram(plan);
    const url = new URL('https://firebasevertexai.googleapis.com/v1beta/projects/p/models/gemini-3.5-flash-lite:generateContent');
    expect(classify(url, body).fields).toEqual(['program-facts']);
  });

  it('a reply that states a result is asked for again, then refused; it is never returned', async () => {
    let n = 0;
    fake(() => ({ text: () => (++n === 1 ? 'You may qualify for this program.' : 'This program helps renters.'), inferenceSource: 'in_cloud' }));
    expect((await explainProgram(planExplain(input, 'long'))).value.text).toBe('This program helps renters.');
    expect(n).toBe(2);
    fake(() => ({ text: () => 'You qualify.', inferenceSource: 'in_cloud' }));
    await expect(explainProgram(planExplain(input, 'long'))).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('a cancelled request rejects with kind cancelled and its reply is dropped', async () => {
    let release: () => void = () => undefined;
    setModelProviderForTests(async () => ({
      generateContent: () => new Promise((resolve) => (release = () => resolve({ response: { text: () => 'late', inferenceSource: 'in_cloud' } }))),
    }));
    const abort = new AbortController();
    const pending = explainProgram(planExplain(input, 'long'), { signal: abort.signal });
    await new Promise((r) => setTimeout(r, 0));
    abort.abort();
    release();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('a daily limit is told apart from a busy minute', async () => {
    fake(() => Object.assign(new Error('Quota exceeded for metric: generate_requests_per_model_per_day, limit: 500'), { customErrorData: { status: 429 } }));
    await expect(explainProgram(planExplain(input, 'long'))).rejects.toMatchObject({ kind: 'quota-daily' });
    fake(() => Object.assign(new Error('Resource exhausted, please retry'), { customErrorData: { status: 429 } }));
    await expect(explainProgram(planExplain(input, 'long'))).rejects.toMatchObject({ kind: 'quota' });
  });
});

const personal: PersonalResult = {
  locale: 'en',
  programName: 'Test Food Help',
  facts: 'This program checks: income; residency.',
  verdictLabel: 'Probably not',
  verdict: 'unlikely',
  criteriaLines: '- Your income is under the limit: met (limit 34,000, yours 33,333)\n- You meet the residency rule: not met',
};

describe('the person\'s own result (on device only)', () => {
  beforeEach(() => setDeviceModelForTests('available'));
  afterEach(() => setDeviceModelForTests('absent'));

  it('explain.personal runs ONLY_ON_DEVICE with the result, limits and values, and refuses a cloud answer', async () => {
    const calls = fake(() => ({ text: () => 'The rules say probably not, because the residency rule is not met.', inferenceSource: 'on_device' }));
    const result = await explainPersonal(Raw.of(personal));
    expect(result).toEqual({ value: 'The rules say probably not, because the residency rule is not met.', inferenceSource: 'ON_DEVICE', reason: 'your-result-stays-on-device' });
    expect(calls[0]!.params.mode).toBe('only_on_device');
    expect(calls[0]!.params.inCloudParams).toBeUndefined();
    expect(calls[0]!.prompts[0]).toContain('Result from the rules: Probably not');
    expect(calls[0]!.prompts[0]).toContain('(limit 34,000, yours 33,333)');
    fake(() => ({ text: () => 'x', inferenceSource: 'in_cloud' }));
    await expect(explainPersonal(Raw.of({ ...personal, locale: 'es' }))).rejects.toMatchObject({ kind: 'on-device-unavailable' });
  });

  it('hedged wording is fine for the person\'s own result unless it contradicts the verdict; a definite claim is not', async () => {
    fake(() => ({ text: () => 'You may qualify once your residency is confirmed.', inferenceSource: 'on_device' }));
    expect((await explainPersonal(Raw.of({ ...personal, verdict: 'maybe' }))).value).toContain('You may qualify');
    await expect(explainPersonal(Raw.of(personal))).rejects.toMatchObject({ kind: 'blocked' });
    fake(() => ({ text: () => 'You do not qualify.', inferenceSource: 'on_device' }));
    await expect(explainPersonal(Raw.of(personal))).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('a typed question runs ONLY_ON_DEVICE with shared/prompts/ask-personal.v1.md', async () => {
    const calls = fake(() => ({ text: () => 'On device answer', inferenceSource: 'on_device' }));
    const result = await askFreeText(Raw.of('Can I apply if I moved here last month?'), Raw.of(personal));
    expect(result).toEqual({ value: 'On device answer', inferenceSource: 'ON_DEVICE', reason: 'typed-text-may-be-personal' });
    expect(calls[0]!.params.mode).toBe('only_on_device');
    expect(calls[0]!.prompts[0]).toContain('Question: Can I apply if I moved here last month?');
  });
});

const groundingMetadata = {
  searchEntryPoint: { renderedContent: '<style>.chip{}</style><div class="container"><a class="chip" href="https://www.google.com/search?q=x">x</a></div>' },
  groundingChunks: [
    { web: { uri: 'https://example.org/food', title: 'example.org' } },
    { web: { uri: 'javascript:alert(1)', title: 'bad' } },
    { web: { uri: 'https://example.org/food', title: 'duplicate' } },
  ],
  webSearchQueries: ['test food help applications'],
};

describe('program.currentStatus (Search grounding)', () => {
  const statusInput = {
    programs: asPublic(pack.programs.map((p) => ({ id: p.id, name: p.name }))),
    jurisdiction: asPublic('zz-test'),
    year: asPublic(2026),
    checkedOn: asPublic('2026-01-01'),
    locale: 'en',
  };

  it('asks about every program of the pack in one ONLY_IN_CLOUD request with the googleSearch tool', () => {
    const plan = planCurrentStatus(statusInput);
    expect(plan).toMatchObject({ mode: 'ONLY_IN_CLOUD', reason: 'needs-current-info', tools: [{ googleSearch: {} }] });
    for (const p of pack.programs) expect(plan.prompt).toContain(`[${p.id}] ${p.name}`);
  });

  it('parses one line per program, keeps Search Suggestions as given and only safe sources', async () => {
    const calls = fake(() => ({
      text: () => '[food-help] Applications are open.\n[unknown-id] ignored\n[work-credit]: Deadline April 15.',
      inferenceSource: 'in_cloud',
      candidates: [{ groundingMetadata }],
    }));
    const result = await programCurrentStatus(statusInput);
    expect(calls[0]!.params.mode).toBe('only_in_cloud');
    expect(calls[0]!.params.onDeviceParams).toBeUndefined();
    expect([...result.value.statuses]).toEqual([
      ['food-help', 'Applications are open.'],
      ['work-credit', 'Deadline April 15.'],
    ]);
    expect(result.value.grounding.searchEntryPoint).toBe(groundingMetadata.searchEntryPoint.renderedContent);
    expect(result.value.grounding.sources).toEqual([{ uri: 'https://example.org/food', title: 'example.org' }]);
  });

  it('search text that states a result is asked for again, then refused', async () => {
    fake(() => ({ text: () => '[food-help] You qualify for this program.', candidates: [{ groundingMetadata }] }));
    await expect(programCurrentStatus(statusInput)).rejects.toMatchObject({ kind: 'blocked' });
    fake(() => ({ text: () => '- City Fan Program: you may qualify for free fans.', candidates: [{ groundingMetadata }] }));
    await expect(discoverLeads({ profile, known: asPublic([]), locale: 'en' })).rejects.toMatchObject({ kind: 'blocked' });
  });

  it('a billing or permission error is classified, not swallowed', async () => {
    fake(() => Object.assign(new Error('Grounding requires a billing account'), { customErrorData: { status: 403 } }));
    await expect(programCurrentStatus(statusInput)).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('discover.leads and nearby.help', () => {
  it('leads are list lines with sources', async () => {
    fake(() => ({ text: () => 'Here are leads:\n- City Fan Program: free fans in summer.\n- **Food Pantry**: weekly groceries.', candidates: [{ groundingMetadata }] }));
    const result = await discoverLeads({ profile, known: asPublic(['Test Food Help']), locale: 'en' });
    expect(result.value.leads).toEqual(['City Fan Program: free fans in summer.', 'Food Pantry: weekly groceries.']);
    expect(result.reason).toBe('needs-current-info');
  });

  it('nearby sends the county centroid in toolConfig with the googleMaps tool, never more', async () => {
    const withCounty = generalize(Raw.of({ jurisdiction: 'zz-test', county: 'testshire' }), bands);
    const nearbyInput = { profile: withCounty, centroid: asPublic({ latitude: 10.5, longitude: -20.25 }), countyName: asPublic('Testshire'), locale: 'en' };
    const plan = planNearby(nearbyInput);
    expect(plan.tools).toEqual([{ googleMaps: {} }]);
    expect(plan.toolConfig).toEqual({ retrievalConfig: { latLng: { latitude: 10.5, longitude: -20.25 }, languageCode: 'en' } });
    expect(plan.prompt).toBe('Area: Testshire, zz-test');
    fake(() => ({
      text: () => '- Help Center: benefits help.',
      candidates: [{ groundingMetadata: { groundingChunks: [{ maps: { uri: 'https://maps.google.com/?cid=1', title: 'Help Center', text: 'Open 9-5', placeId: 'places/1' } }] } }],
    }));
    const result = await nearbyHelp(nearbyInput);
    expect(result.value.places).toEqual([{ title: 'Help Center', uri: 'https://maps.google.com/?cid=1', text: 'Open 9-5' }]);
    expect(result.reason).toBe('needs-places');
    expect(() => planNearby({ ...nearbyInput, profile })).toThrow('county');
  });
});

describe('readAloud', () => {
  it('sends only an explanation answer to the speech model and returns the audio', async () => {
    fake((p) => {
      if (p.inCloudParams?.model === TTS_MODEL) {
        return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AAAA' } }] } }], inferenceSource: 'in_cloud' };
      }
      return { text: () => 'Plain explanation.', inferenceSource: 'in_cloud' };
    });
    const answer = await explainProgram(planExplain(input, 'long'));
    expect(answer.value.text).toBe('Plain explanation.');
    const speech = await readAloud(answer.value, 'en');
    expect(speech).toMatchObject({ value: { data: 'AAAA', mimeType: 'audio/L16;codec=pcm;rate=24000' }, inferenceSource: 'IN_CLOUD', reason: 'speech' });
  });
});

describe('checks on model text on every path, in the answer language', () => {
  const fixture = JSON.parse(shared('fixtures/conformance/output-check.json')) as {
    cases: { id: string; locale: string; scope: 'general' | 'personal'; text: string; blocked: boolean; verdict?: PersonalResult['verdict'] }[];
  };
  const blocked = fixture.cases.filter((c) => c.blocked && (c.locale === 'en' || c.locale === 'es'));
  const statusInput = (locale: string) => ({
    programs: asPublic(pack.programs.map((p) => ({ id: p.id, name: p.name }))),
    jurisdiction: asPublic('zz-test'),
    year: asPublic(2026),
    checkedOn: asPublic('2026-01-01'),
    locale,
  });
  const generalPaths: Record<string, (locale: string) => Promise<unknown>> = {
    'explain.short': (locale) => explainProgram(planExplain(asPublic({ program: facts, locale }), 'short')),
    'explain.long': (locale) => explainProgram(planExplain(asPublic({ program: facts, locale }), 'long')),
    ...Object.fromEntries(
      ['apply', 'documents', 'change', 'offer'].map((id) => [`ask.chip ${id}`, (locale: string) => askChip(planAskChip(asPublic({ program: facts, locale }), asPublic({ id, question: id })))]),
    ),
    'program.currentStatus': (locale) => programCurrentStatus(statusInput(locale)),
    'discover.leads': (locale) => discoverLeads({ profile, known: asPublic([]), locale }),
  };

  it('has blocked sentences in English and Spanish', () => {
    expect(blocked.some((c) => c.locale === 'en')).toBe(true);
    expect(blocked.some((c) => c.locale === 'es')).toBe(true);
  });

  for (const k of blocked) {
    for (const [path, run] of Object.entries(generalPaths)) {
      it(`${k.id} is blocked on ${path}`, async () => {
        let n = 0;
        fake(() => ({ text: () => (n++, k.text), inferenceSource: 'in_cloud', candidates: [{ groundingMetadata }] }));
        await expect(run(k.locale)).rejects.toMatchObject({ kind: 'blocked' });
        expect(n).toBe(2);
      });
    }
    if (k.scope === 'personal') {
      // The guard of ONLY_ON_DEVICE tasks needs a device model that reports itself available.
      for (const [path, run] of Object.entries({
        'explain.personal': () => explainPersonal(Raw.of({ ...personal, locale: k.locale, verdict: k.verdict ?? 'maybe' })),
        'ask.freeText': () => askFreeText(Raw.of('?'), Raw.of({ ...personal, locale: k.locale, verdict: k.verdict ?? 'maybe' })),
      })) {
        it(`${k.id} is blocked on ${path}`, async () => {
          setDeviceModelForTests('available');
          fake(() => ({ text: () => k.text, inferenceSource: 'on_device' }));
          await expect(run()).rejects.toMatchObject({ kind: 'blocked' });
        });
      }
    }
  }

  it('a Spanish claim on a Spanish prepared question is checked against the Spanish list', async () => {
    fake(() => ({ text: () => 'Calificas para esta ayuda.', inferenceSource: 'in_cloud' }));
    await expect(askChip(planAskChip(asPublic({ program: facts, locale: 'es' }), asPublic({ id: 'apply', question: '¿Cómo solicito?' })))).rejects.toMatchObject({ kind: 'blocked' });
  });
});
