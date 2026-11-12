// Explanations, prepared and typed questions, grounded tasks and speech, with the model faked at the
// ai/ boundary. Response shapes follow the Firebase AI Logic SDK (groundingMetadata with
// searchEntryPoint.renderedContent and groundingChunks; inlineData audio parts).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { HybridParams } from 'firebase/ai';

import { Raw, asPublic } from '../core/types';
import { generalize, silhouetteVerdicts, type Bands } from '../core/generalize';
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
  requestPreview,
  TTS_MODEL,
  type ExplainInput,
  type ProgramFacts,
} from './tasks';
import { askFreeText } from './on-device';
import { EXPLAIN_V1 } from './prompts';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const pack = JSON.parse(shared('rulepacks/zz-test/pack.json')) as RulePack;
const bands = JSON.parse(shared('bands/zz-test.json')) as Bands;

const profile = generalize(Raw.of({ jurisdiction: 'zz-test', annualIncome: 21000, householdSize: 3, housing: 'renter' }), bands);
const facts: ProgramFacts = {
  programId: 'utility-discount',
  name: 'Test Utility Discount',
  facts: 'This program checks: Your income is under the limit; You rent or own your home.',
  criteria: { 'income-limit': 'Your income is under the limit', housing: 'You rent or own your home' },
  verdictWords: { likely: 'You may qualify', maybe: 'Possible', depends: 'Depends on an answer you skipped', unlikely: 'Probably not' },
  stateNotes: { fail: 'not met', unknown: 'not known: this answer stays on the device or was skipped' },
};
const verdict = silhouetteVerdicts(pack, bands, profile).find((v) => v.programId === 'utility-discount')!;
const input: ExplainInput = { profile, verdict, program: asPublic(facts), locale: 'en' };

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
  setModelProviderForTests(null);
  setConfigForTests(null);
});

describe('silhouette verdicts', () => {
  it('criteria the silhouette cannot decide are marked as not sent, not as skipped', () => {
    const food = silhouetteVerdicts(pack, bands, profile).find((v) => v.programId === 'food-help')!;
    const plan = planExplain({ ...input, verdict: food, program: asPublic({ ...facts, programId: 'food-help', criteria: { 'income-limit': 'Income', residency: 'Residency' } }) }, 'short');
    expect(plan.prompt).toContain('Criteria not met or unknown: Residency (not known: this answer stays on the device or was skipped)');
  });

  it('use only the silhouette: a sensitive answer is unknown, so the result can only be "depends" or weaker', () => {
    const food = silhouetteVerdicts(pack, bands, profile).find((v) => v.programId === 'food-help')!;
    expect(food.criteria.find((c) => c.id === 'residency')?.state).toBe('unknown');
    expect(food.verdict).not.toBe('likely');
    expect(verdict).toEqual({ programId: 'utility-discount', verdict: 'likely', criteria: [{ id: 'income-limit', state: 'pass' }, { id: 'housing', state: 'pass' }] });
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

  it('fills shared/prompts/explain.v1.md with the silhouette, the facts and the silhouette verdict only', () => {
    const plan = planExplain(input, 'short');
    expect(plan.systemInstruction).toBe(EXPLAIN_V1.system.replace('{locale}', 'English'));
    expect(plan.prompt).toBe(
      [
        'Profile: {"jurisdiction":"zz-test","incomeBand":"B","householdSize":3,"childAgeBands":null,"county":null,"housing":"renter"}',
        'Program: Test Utility Discount',
        `Program facts: ${facts.facts}`,
        'Verdict: You may qualify',
        'Criteria met: Your income is under the limit; You rent or own your home',
        'Criteria not met or unknown: -',
        'Write 60 words or fewer.',
      ].join('\n'),
    );
    expect(plan.prompt).not.toContain('21000');
  });
});

describe('running explanations and chips', () => {
  it('returns the answer with source, reason and route; the chip answer too', async () => {
    const calls = fake(() => ({ text: () => ' You may qualify because… ', inferenceSource: 'on_device' }));
    const result = await explainProgram(planExplain(input, 'short'));
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'short-text', route: { words: 60 } });
    expect(result.value.text).toBe('You may qualify because…');
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

  it('the preview shows the request that is sent, and the record names what it carries', () => {
    const plan = planExplain(input, 'long');
    const body = requestPreview(plan);
    expect(body['contents']).toEqual([{ role: 'user', parts: [{ text: plan.prompt }] }]);
    expect(body['systemInstruction']).toEqual({ role: 'system', parts: [{ text: plan.systemInstruction }] });
    fake(() => ({ text: () => 'x' }));
    void explainProgram(plan);
    const url = new URL('https://firebasevertexai.googleapis.com/v1beta/projects/p/models/gemini-3.5-flash-lite:generateContent');
    expect(classify(url, JSON.stringify(body)).fields).toEqual(['profile-silhouette', 'program-facts']);
  });
});

describe('ask.freeText (typed question)', () => {
  it('runs ONLY_ON_DEVICE and refuses a cloud answer', async () => {
    const calls = fake(() => ({ text: () => 'On device answer', inferenceSource: 'on_device' }));
    const result = await askFreeText(Raw.of('Can I apply if I moved here last month?'), input);
    expect(result).toEqual({ value: 'On device answer', inferenceSource: 'ON_DEVICE', reason: 'typed-text-may-be-personal' });
    expect(calls[0]!.params.mode).toBe('only_on_device');
    expect(calls[0]!.params.inCloudParams).toBeUndefined();
    fake(() => ({ text: () => 'x', inferenceSource: 'in_cloud' }));
    await expect(askFreeText(Raw.of('q'), { ...input, locale: 'es' })).rejects.toMatchObject({ kind: 'on-device-unavailable' });
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
    const speech = await readAloud(answer.value, 'en');
    expect(speech).toMatchObject({ value: { data: 'AAAA', mimeType: 'audio/L16;codec=pcm;rate=24000' }, inferenceSource: 'IN_CLOUD', reason: 'speech' });
  });
});
