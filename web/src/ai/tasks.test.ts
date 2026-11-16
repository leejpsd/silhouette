// The model is mocked at the ai/ boundary (setModelProviderForTests); everything else is real:
// prompt loading, schema conversion, response parsing, error classification, rehydration.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HybridParams } from 'firebase/ai';

import { Raw, reveal } from '../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile } from '../core/skeleton';
import { buildReview } from '../core/review';
import { classifyError, TaskError } from './errors';
import { setModelProviderForTests, type ModelPort } from './model-port';
import { CLOUD_MODEL, POINTER_SCHEMAS, activePointerConfig, extractPointers, pointerModelParams } from './tasks';
import { setConfigForTests } from '../data/remote-config';
import { POINTER_V2, POINTER_V3, POINTER_V4, pointerConfigFor } from './pointer-config';
import { readPhoto } from './on-device';
import { setDeviceModelForTests } from './device-fake';
import { POINTER_EXTRACT, POINTER_EXTRACT_V3, POINTER_EXTRACT_V4, parsePrompt } from './prompts';
import { toModelSchema } from './model-schema';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const enFile = JSON.parse(shared('skeleton/allowlist/en.json')) as AllowlistFile;
const allow = buildAllowlist([enFile]);
const intro = buildIntroducers([enFile]);
const rehydrateFixture = JSON.parse(shared('fixtures/conformance/rehydrate.json')) as {
  cases: { id: string; pointers: Record<string, unknown>; expected: Record<string, unknown> }[];
};
const pointersOf = (id: string) => rehydrateFixture.cases.find((c) => c.id === id)!;

interface Call {
  params: HybridParams;
  prompts: unknown[];
}

/** A fake model: answers with `reply` (or throws it) and records params and prompts. */
function fakeModels(reply: string | Error | ((call: number) => string | Error), source = 'in_cloud') {
  const calls: Call[] = [];
  setModelProviderForTests(async (params) => {
    const call: Call = { params, prompts: [] };
    calls.push(call);
    const port: ModelPort = {
      async generateContent(request) {
        call.prompts.push(request);
        const r = typeof reply === 'function' ? reply(call.prompts.length) : reply;
        if (r instanceof Error) throw r;
        return { response: { text: () => r, inferenceSource: source } };
      },
    };
    return port;
  });
  return calls;
}

afterEach(() => setModelProviderForTests(null));

const doc = skeletonize(Raw.of(shared('samples/paystub-en-01.txt')), allow, intro);

describe('document.pointer.extract', () => {
  it('returns the pointers with provenance; rehydration gives the fixture values', async () => {
    const fixture = pointersOf('paystub-en-01-correct');
    fakeModels(JSON.stringify(fixture.pointers));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en');
    expect(result.inferenceSource).toBe('IN_CLOUD');
    expect(result.reason).toBe('document-silhouette-only');
    const review = buildReview(POINTER_SCHEMAS.paystub, result.value, doc.skeleton, doc.map);
    expect(review.find((f) => f.name === 'grossPay')?.value).toBe(1271.88);
    expect(review.find((f) => f.name === 'deductions')?.items).toHaveLength(4);
  });

  it('maps an on-device answer to ON_DEVICE', async () => {
    fakeModels('{}', 'on_device');
    expect((await extractPointers(doc.skeleton, 'paystub', 'en')).inferenceSource).toBe('ON_DEVICE');
  });

  it('invalid references and a wrong enum are dropped by the Rehydrator, not trusted', async () => {
    const bad = pointersOf('paystub-en-01-bad-refs');
    fakeModels(JSON.stringify(bad.pointers));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en');
    const review = buildReview(POINTER_SCHEMAS.paystub, result.value, doc.skeleton, doc.map);
    expect(review.find((f) => f.name === 'grossPay')?.value).toBeNull(); // N99 does not exist
    expect(review.find((f) => f.name === 'netPay')?.value).toBeNull(); // W4 is not a number reference
    expect(review.find((f) => f.name === 'payFrequency')?.value).toBeNull(); // "fortnightly" is not in the enum
    expect(review.find((f) => f.name === 'employeeName')?.value).toBe('Maria Lopez'); // W99 dropped, W4 W5 kept
  });

  it('a model that answers with prose or a non-object is a bad-output error', async () => {
    fakeModels('The gross pay is 1,271.88.');
    await expect(extractPointers(doc.skeleton, 'paystub', 'en')).rejects.toMatchObject({ kind: 'bad-output' });
    fakeModels('["N12"]');
    await expect(extractPointers(doc.skeleton, 'paystub', 'en')).rejects.toMatchObject({ kind: 'bad-output' });
  });

  it('an App Check rejection is reported as app-check with the SDK message kept', async () => {
    const sdkError = Object.assign(
      new Error('Error fetching from https://firebasevertexai.googleapis.com/v1beta/...: [401 ] Firebase App Check token is invalid.'),
      { code: 'AI/fetch-error', customErrorData: { status: 401 } },
    );
    fakeModels(sdkError);
    const error = (await extractPointers(doc.skeleton, 'paystub', 'en').catch((e: unknown) => e)) as TaskError;
    expect(error).toBeInstanceOf(TaskError);
    expect(error.kind).toBe('app-check');
    expect(error.status).toBe(401);
    expect(error.detail).toContain('App Check');
  });

  it('classifies permission, quota and network failures', () => {
    expect(classifyError(Object.assign(new Error('[403 ] Requests are blocked'), { customErrorData: { status: 403 } })).kind).toBe('permission');
    expect(classifyError(Object.assign(new Error('[429 ] RESOURCE_EXHAUSTED'), { customErrorData: { status: 429 } })).kind).toBe('quota');
    expect(classifyError(new TypeError('Failed to fetch')).kind).toBe('network');
  });

  it('uses one model instance per task, document type and language', async () => {
    const calls = fakeModels('{}');
    await extractPointers(doc.skeleton, 'paystub', 'en');
    await extractPointers(doc.skeleton, 'paystub', 'en');
    await extractPointers(doc.skeleton, 'paystub', 'ko');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.prompts).toHaveLength(2);
  });

  it('configures PREFER_ON_DEVICE with one schema derivation for cloud and device, every field required', () => {
    const params = pointerModelParams('paystub', 'ko');
    expect(params.mode).toBe('prefer_on_device');
    const cloud = params.inCloudParams!;
    expect(cloud.model).toBe(CLOUD_MODEL);
    expect(cloud.systemInstruction).toBe(activePointerConfig().prompt.system);
    expect(activePointerConfig().prompt.system).toContain('Use null when the field is not in the document.');
    expect(cloud.generationConfig?.responseMimeType).toBe('application/json');
    const cloudSchema = cloud.generationConfig?.responseSchema as Record<string, unknown>;
    const deviceSchema = params.onDeviceParams?.promptOptions?.responseConstraint as Record<string, unknown>;
    const fields = Object.keys(POINTER_SCHEMAS.paystub.properties);
    expect(cloudSchema['required']).toEqual(fields);
    expect(deviceSchema['required']).toEqual(fields);
    const cloudProps = cloudSchema['properties'] as Record<string, Record<string, unknown>>;
    const deviceProps = deviceSchema['properties'] as Record<string, Record<string, unknown>>;
    expect(cloudProps['grossPay']).toEqual({ type: 'string', nullable: true });
    expect(deviceProps['grossPay']).toEqual({ type: ['string', 'null'] });
    // English (the instructions) and the document's language: Korean makes the device unavailable, so the cloud reads it.
    expect(params.onDeviceParams?.createOptions?.expectedInputs).toEqual([{ type: 'text', languages: ['en', 'ko'] }]);
  });

  it('treats null answers as "not in the document"', async () => {
    fakeModels(JSON.stringify({ grossPay: 'N12', netPay: null, deductions: null }));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en');
    expect(result.value).toEqual({ grossPay: 'N12' });
  });

  it('sends only the skeleton: no canary string reaches the model prompt (unit-level canary)', async () => {
    const canary = JSON.parse(shared('fixtures/canary/paystub-canary-01.json')) as { document: string; canaries: string[] };
    const canaryDoc = skeletonize(Raw.of(shared(`fixtures/canary/${canary.document}`)), allow, intro);
    const calls = fakeModels('{}');
    await extractPointers(canaryDoc.skeleton, 'paystub', 'en');
    const sent = JSON.stringify(calls[0]!.prompts) + JSON.stringify(calls[0]!.params);
    for (const value of canary.canaries) expect(sent, value).not.toContain(value);
    expect(sent).toContain('Document type: paystub');
  });
});

describe('document.photo.read (ONLY_ON_DEVICE)', () => {
  beforeEach(() => setDeviceModelForTests('available'));
  afterEach(() => setDeviceModelForTests('absent'));

  const photo = () => Raw.of<Blob>(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }));

  it('returns Raw text when the model runs on device', async () => {
    const calls = fakeModels('Gross Pay 1,271.88', 'on_device');
    const result = await readPhoto(photo(), 'paystub', 'en');
    expect(reveal(result.value)).toBe('Gross Pay 1,271.88');
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'photo-never-leaves' });
    expect(calls[0]!.params.mode).toBe('only_on_device');
    expect(calls[0]!.params.inCloudParams).toBeUndefined();
  });

  it('reports on-device-unavailable when the SDK cannot run on device', async () => {
    fakeModels(Object.assign(new Error('Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.'), { code: 'AI/unsupported' }));
    await expect(readPhoto(photo(), 'paystub', 'en')).rejects.toMatchObject({ kind: 'on-device-unavailable' });
  });

  it('refuses a result that did not come from the device', async () => {
    fakeModels('text', 'in_cloud');
    await expect(readPhoto(photo(), 'paystub', 'en')).rejects.toMatchObject({ kind: 'on-device-unavailable' });
  });

  it('accepts only JPEG and PNG', async () => {
    fakeModels('text', 'on_device');
    await expect(readPhoto(Raw.of<Blob>(new Blob(['x'], { type: 'image/heic' })), 'paystub', 'en')).rejects.toMatchObject({
      kind: 'on-device-unavailable',
    });
  });
});

describe('schema and prompt from /shared', () => {
  it('converts the pointer schema into the model subset deterministically', () => {
    const schema = toModelSchema(JSON.parse(shared('schemas/pointer.paystub.json')) as Record<string, unknown>);
    const keys = new Set<string>();
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n !== null && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.add(k); walk(v); }
    };
    walk(schema);
    for (const banned of ['$ref', '$defs', 'x-kind', 'additionalProperties', 'pattern', '$id', 'oneOf']) expect(keys.has(banned), banned).toBe(false);
    const props = schema['properties'] as Record<string, Record<string, unknown>>;
    expect(props['grossPay']).toEqual({ type: 'string' });
    expect(props['payFrequency']).toEqual({ enum: ['weekly', 'biweekly', 'semimonthly', 'monthly'], type: 'string' });
    expect(props['payDate']).toEqual({ anyOf: [{ type: 'string' }, { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } }] });
    expect(toModelSchema(JSON.parse(shared('schemas/pointer.paystub.json')) as Record<string, unknown>)).toEqual(schema);
  });

  it('selects the bundled prompt version named by Remote Config, the newest for an unknown value', () => {
    try {
      expect(activePointerConfig()).toBe(POINTER_V4);
      expect(pointerModelParams('paystub', 'en').inCloudParams?.systemInstruction).toBe(POINTER_EXTRACT_V4.system);
      setConfigForTests({ promptPointerExtractV: 3 });
      expect(activePointerConfig()).toBe(POINTER_V3);
      setConfigForTests({ promptPointerExtractV: 2 });
      expect(activePointerConfig()).toBe(POINTER_V2);
      expect(pointerModelParams('paystub', 'en').inCloudParams?.systemInstruction).toBe(POINTER_EXTRACT.system);
      setConfigForTests({ promptPointerExtractV: 99 });
      expect(activePointerConfig()).toBe(POINTER_V4);
      expect(pointerConfigFor(1)).toBe(POINTER_V4);
    } finally {
      setConfigForTests(null);
    }
  });

  it('v3 is v2 plus the gross pay line, read from shared/prompts/pointer-extract.v3.md', () => {
    const v3 = parsePrompt('pointer-extract.v3', shared('prompts/pointer-extract.v3.md'));
    expect(v3).toEqual(POINTER_EXTRACT_V3);
    expect(v3.user).toBe(POINTER_EXTRACT.user);
    expect(v3.system).toContain('It is never a single earnings line such as Regular or Overtime.');
    expect(v3.system.replace(/\n- Gross pay is the total[^\n]*/, '')).toBe(POINTER_EXTRACT.system);
  });

  it('reads the system instruction and user template from shared/prompts/pointer-extract.v2.md', () => {
    const prompt = parsePrompt('pointer-extract.v2', shared('prompts/pointer-extract.v2.md'));
    expect(prompt).toEqual(POINTER_EXTRACT);
    expect(prompt.system.startsWith('You label fields in a document')).toBe(true);
    expect(prompt.system.endsWith('Return JSON only.')).toBe(true);
    expect(prompt.system).toContain('Use null when the field is not in the document.');
    expect(prompt.user).toBe('Document type: {docType}\nDocument:\n{skeleton}');
  });
});

describe('on-device failure falls back to the cloud once (cloud-safe input only)', () => {
  /** On device (prefer_on_device) the model throws; in the cloud (only_in_cloud) it answers. */
  function deviceFails(deviceError: Error, cloudReply = '{"grossPay":"N12"}') {
    const modes: string[] = [];
    setModelProviderForTests(async (params) => ({
      async generateContent() {
        modes.push(params.mode);
        if (params.mode === 'prefer_on_device') throw deviceError;
        return { response: { text: () => cloudReply, inferenceSource: 'in_cloud' } };
      },
    }));
    return modes;
  }

  it('repeats a failed on-device call in the cloud and says why', async () => {
    const modes = deviceFails(Object.assign(new Error('The input is too large.'), { name: 'QuotaExceededError' }));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en');
    expect(modes).toEqual(['prefer_on_device', 'only_in_cloud']);
    expect(result).toMatchObject({ inferenceSource: 'IN_CLOUD', reason: 'on-device-failed', value: { grossPay: 'N12' } });
    expect(result.deviceError).toContain('The input is too large');
  });

  it('also falls back when the device answered something that is not JSON', async () => {
    const modes: string[] = [];
    setModelProviderForTests(async (params) => ({
      async generateContent() {
        modes.push(params.mode);
        return params.mode === 'prefer_on_device'
          ? { response: { text: () => 'not json', inferenceSource: 'on_device' } }
          : { response: { text: () => '{}', inferenceSource: 'in_cloud' } };
      },
    }));
    expect((await extractPointers(doc.skeleton, 'paystub', 'en')).reason).toBe('on-device-failed');
    expect(modes).toEqual(['prefer_on_device', 'only_in_cloud']);
  });

  it('does not repeat cloud failures (App Check, network)', async () => {
    const modes = deviceFails(Object.assign(new Error('[401 ] App Check token is invalid.'), { customErrorData: { status: 401 } }));
    await expect(extractPointers(doc.skeleton, 'paystub', 'en')).rejects.toMatchObject({ kind: 'app-check' });
    expect(modes).toEqual(['prefer_on_device']);
    const modes2 = deviceFails(new TypeError('Failed to fetch'));
    await expect(extractPointers(doc.skeleton, 'paystub', 'en')).rejects.toMatchObject({ kind: 'network' });
    expect(modes2).toEqual(['prefer_on_device']);
  });

  it('never sends Raw input to the cloud: a failed photo read is not repeated anywhere', async () => {
    setDeviceModelForTests('available');
    const modes: string[] = [];
    setModelProviderForTests(async (params) => ({
      async generateContent() {
        modes.push(params.mode);
        throw new Error('The input is too large.');
      },
    }));
    await expect(readPhoto(Raw.of<Blob>(new Blob([new Uint8Array([1])], { type: 'image/png' })), 'paystub', 'en')).rejects.toBeInstanceOf(TaskError);
    expect(modes).toEqual(['only_on_device']);
    setDeviceModelForTests('absent');
  });
});
