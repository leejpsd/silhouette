// The model is mocked at the ai/ boundary (setModelProviderForTests); everything else is real:
// prompt loading, schema conversion, response parsing, error classification, rehydration.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { HybridParams } from 'firebase/ai';

import { Raw, reveal } from '../core/types';
import { buildAllowlist, skeletonize, type AllowlistFile } from '../core/skeleton';
import { buildReview } from '../core/review';
import { classifyError, TaskError } from './errors';
import { setModelProviderForTests, type ModelPort } from './model-port';
import { ACTIVE_POINTER_CONFIG, CLOUD_MODEL, POINTER_SCHEMAS, extractPointers, pointerModelParams } from './tasks';
import { POINTER_V1 } from './pointer-config';
import { readPhoto } from './on-device';
import { POINTER_EXTRACT, parsePrompt } from './prompts';
import { toModelSchema } from './model-schema';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const allow = buildAllowlist([JSON.parse(shared('skeleton/allowlist/en.json')) as AllowlistFile]);
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

const doc = skeletonize(Raw.of(shared('samples/paystub-en-01.txt')), allow);

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
    expect(cloud.systemInstruction).toBe(ACTIVE_POINTER_CONFIG.prompt.system);
    expect(ACTIVE_POINTER_CONFIG.prompt.system).toContain('Use null when the field is not in the document.');
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
    expect(params.onDeviceParams?.createOptions?.expectedInputs).toEqual([{ type: 'text', languages: ['ko'] }]);
  });

  it('treats null answers as "not in the document"', async () => {
    fakeModels(JSON.stringify({ grossPay: 'N12', netPay: null, deductions: null }));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en');
    expect(result.value).toEqual({ grossPay: 'N12' });
  });

  it('the shared v1 configuration is still available', () => {
    const params = pointerModelParams('paystub', 'en', { config: POINTER_V1 });
    expect(params.inCloudParams?.systemInstruction).toBe(POINTER_EXTRACT.system);
    expect((params.inCloudParams?.generationConfig?.responseSchema as Record<string, unknown>)['required']).toBeUndefined();
  });

  it('sends only the skeleton: no canary string reaches the model prompt (unit-level canary)', async () => {
    const canary = JSON.parse(shared('fixtures/canary/paystub-canary-01.json')) as { document: string; canaries: string[] };
    const canaryDoc = skeletonize(Raw.of(shared(`fixtures/canary/${canary.document}`)), allow);
    const calls = fakeModels('{}');
    await extractPointers(canaryDoc.skeleton, 'paystub', 'en');
    const sent = JSON.stringify(calls[0]!.prompts) + JSON.stringify(calls[0]!.params);
    for (const value of canary.canaries) expect(sent, value).not.toContain(value);
    expect(sent).toContain('Document type: paystub');
  });
});

describe('document.photo.read (ONLY_ON_DEVICE)', () => {
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

  it('reads the system instruction and user template from shared/prompts/pointer-extract.v1.md', () => {
    const prompt = parsePrompt('pointer-extract.v1', shared('prompts/pointer-extract.v1.md'));
    expect(prompt).toEqual(POINTER_EXTRACT);
    expect(prompt.system.startsWith('You label fields in a document')).toBe(true);
    expect(prompt.system.endsWith('Return JSON only.')).toBe(true);
    expect(prompt.user).toBe('Document type: {docType}\nDocument:\n{skeleton}');
  });
});

describe('pointer v2 schemas', () => {
  it('give the model exactly the schema that was evaluated (shared v1 schema + required + nullable)', async () => {
    const { POINTER_V2, SHARED_POINTER_SCHEMAS } = await import('./pointer-config');
    for (const doc of ['paystub', 'lease'] as const) {
      const v2 = toModelSchema(POINTER_V2.schemas[doc] as unknown as Record<string, unknown>, POINTER_V2.schemaOptions);
      const evaluated = toModelSchema(SHARED_POINTER_SCHEMAS[doc] as unknown as Record<string, unknown>, { requiredNullable: true, dialect: 'openapi' });
      expect(JSON.stringify(v2)).toBe(JSON.stringify(evaluated));
    }
  });
});
