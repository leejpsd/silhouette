// On-device pointer extraction. On a device with a ready model a paystub is read in two parts: the
// core fields, then the deductions. Only a core that fails its check is a failed on-device attempt
// (routing.json onDeviceFailure: one retry, ONLY_IN_CLOUD, reason on-device-failed); deductions that
// do not hold up are left out and marked not read. When the person keeps everything on the device
// there is no retry. Also the strict per-document response constraint.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Raw } from '../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile } from '../core/skeleton';
import { corePointerProblems, deductionsProblems, pointerProblems } from '../core/pointer-check';
import { setModelProviderForTests } from './model-port';
import { setDeviceModelForTests } from './device-fake';
import { POINTER_SCHEMAS, extractPointers, pointerModelParams, type PointerStage } from './tasks';
import { deviceResponseConstraint, placeholderIds } from './device-schema';
import { activePointerConfig } from './tasks';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const en = JSON.parse(shared('skeleton/allowlist/en.json')) as AllowlistFile;
const doc = skeletonize(Raw.of(shared('samples/paystub-en-01.txt')), buildAllowlist([en]), buildIntroducers([en]));
const answers = JSON.parse(shared('samples/answers.json')) as { samples: Record<string, { pointers: Record<string, unknown> }> };
const KEY = answers.samples['paystub-en-01.txt']!.pointers;
const { deductions: KEY_DEDUCTIONS, ...KEY_CORE } = KEY;
const schema = POINTER_SCHEMAS.paystub;
const validate = (p: Record<string, unknown>) => pointerProblems(schema, p, doc.skeleton, doc.map, 'us-ca');
const checkParts = {
  core: (p: Record<string, unknown>) => corePointerProblems(schema, p, doc.map, 'us-ca'),
  deductions: (p: Record<string, unknown>) => deductionsProblems(schema, p, doc.map, 'us-ca'),
};
const json = (v: unknown) => JSON.stringify(v);

type Part = 'whole' | 'core' | 'deductions';
interface Params {
  mode: string;
  onDeviceParams?: { promptOptions?: { responseConstraint?: { properties?: Record<string, unknown> } }; createOptions?: { initialPrompts?: { content: string }[] } };
}
const partOf = (params: Params): Part => {
  const keys = Object.keys(params.onDeviceParams?.promptOptions?.responseConstraint?.properties ?? {});
  if (keys.length === 1 && keys[0] === 'deductions') return 'deductions';
  return keys.includes('deductions') ? 'whole' : 'core';
};

/**
 * Single-pass fake (no ready model reported, as on a device whose SDK still answers on the device):
 * the device answers `device`; the cloud answers the correct key. Records the modes asked for.
 */
function models(device: string) {
  const modes: string[] = [];
  setModelProviderForTests(async (params) => ({
    async generateContent() {
      modes.push(params.mode);
      if (params.mode === 'only_in_cloud') return { response: { text: () => json(KEY), inferenceSource: 'in_cloud' } };
      return { response: { text: () => device, inferenceSource: 'on_device' } };
    },
  }));
  return modes;
}

/** A device with a ready model that answers each part with the given text; the cloud answers the key. */
function device(text: { core: string; deductions?: string }) {
  setDeviceModelForTests('available');
  const calls: string[] = [];
  const systems: string[] = [];
  setModelProviderForTests(async (params) => ({
    async generateContent() {
      const p = params as unknown as Params;
      if (p.mode === 'only_in_cloud') {
        calls.push('cloud');
        return { response: { text: () => json(KEY), inferenceSource: 'in_cloud' } };
      }
      const part = partOf(p);
      calls.push(`${p.mode}:${part}`);
      systems.push(p.onDeviceParams?.createOptions?.initialPrompts?.[0]?.content ?? '');
      const answer = part === 'deductions' ? (text.deductions ?? json({ deductions: KEY_DEDUCTIONS })) : text.core;
      return { response: { text: () => answer, inferenceSource: 'on_device' } };
    },
  }));
  return { calls, systems };
}

afterEach(() => {
  setModelProviderForTests(null);
  setDeviceModelForTests('absent');
});

describe('the deterministic check of a pointer answer', () => {
  it('passes the sample\'s correct answer, as a whole and in parts', () => {
    expect(validate(KEY)).toEqual([]);
    expect(checkParts.core(KEY_CORE)).toEqual([]);
    expect(checkParts.deductions(KEY)).toEqual([]);
  });

  it('catches wrong placeholders that break the paystub\'s arithmetic, wrong kinds, unknown ids and a missing gross pay', () => {
    expect(validate({ ...KEY, netPay: KEY['grossPay'] })).toContain('check:net-sum');
    expect(validate({ ...KEY, grossPay: 'D1' })).toContain('grossPay:bad-reference');
    expect(validate({ ...KEY, grossPay: 'N999' })).toContain('grossPay:bad-reference');
    const { grossPay, ...noGross } = KEY;
    void grossPay;
    expect(validate(noGross)).toContain('grossPay:missing');
    expect(validate({ ...KEY, payFrequency: 'fortnightly' })).toContain('payFrequency:not-an-option');
  });

  it('core: names only W, dates only D, every problem reported, year to date below gross always a problem', () => {
    expect(checkParts.core({ ...KEY_CORE, employerName: ['N1'] })).toEqual(['employerName:bad-reference']);
    expect(checkParts.core({ ...KEY_CORE, payDate: 'N3' })).toContain('payDate:bad-reference');
    const several = checkParts.core({ ...KEY_CORE, employerName: ['N1'], payFrequency: 'fortnightly', ytdGross: KEY['netPay'] });
    expect(several).toEqual(expect.arrayContaining(['employerName:bad-reference', 'payFrequency:not-an-option', 'check:ytd-gross']));
    expect(checkParts.core({ ...KEY_CORE, netPay: KEY['ytdGross'] })).toContain('netPay:above-gross');
  });

  it('core ignores the deductions; the deductions check needs net pay to equal gross minus them', () => {
    expect(checkParts.core({ ...KEY_CORE, deductions: [] })).toEqual([]);
    expect(checkParts.deductions({ ...KEY_CORE, deductions: [] })).toEqual(['check:net-sum']);
    expect(checkParts.deductions({ ...KEY_CORE, deductions: [{ amount: 'W1', kind: 'other' }] })).toContain('deductions:bad-reference');
    expect(checkParts.deductions(KEY_CORE)).toEqual(['deductions:missing']);
  });
});

describe('reading a paystub on the device in two parts', () => {
  it('core right and deductions right: answered on this device, both parts, nothing sent', async () => {
    const { calls, systems } = device({ core: json(KEY_CORE) });
    const stages: PointerStage[] = [];
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, onProgress: (s) => stages.push(s) });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions']);
    expect(stages).toEqual(['device-reading', 'checking', 'device-deductions', 'checking']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'document-silhouette-only', value: KEY, deductionsNotRead: false });
    expect(result.deviceAttempt?.passes?.map((p) => [p.part, p.parsed, p.problems])).toEqual([
      ['core', true, []],
      ['deductions', true, []],
    ]);
    // Each part adds its own wording to the shared system instruction.
    expect(systems[0]).toContain(activePointerConfig().prompt.system);
    expect(systems[0]).toContain('answer only the fields in the schema');
    expect(systems[1]).toContain('answer only the deductions');
  });

  it('core right and deductions empty: the core is used, deductions marked not read', async () => {
    const { calls } = device({ core: json(KEY_CORE), deductions: json({ deductions: [] }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY_CORE, deductionsNotRead: true });
    expect(result.value).not.toHaveProperty('deductions');
    expect(result.deviceAttempt?.passes?.[1]?.problems).toEqual(['check:net-sum']);
  });

  it('core right and deductions that fail net pay = gross − deductions: the core is used, deductions not read', async () => {
    device({ core: json(KEY_CORE), deductions: json({ deductions: [(KEY_DEDUCTIONS as unknown[])[0]] }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'document-silhouette-only', value: KEY_CORE, deductionsNotRead: true });
    expect(result.deviceAttempt?.passes?.[1]).toMatchObject({ parsed: true, problems: ['check:net-sum'] });
  });

  it('a core of the wrong kind is a failed on-device attempt: no deductions part, one cloud retry', async () => {
    const { calls } = device({ core: json({ ...KEY_CORE, grossPay: 'D1' }) });
    const stages: PointerStage[] = [];
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, onProgress: (s) => stages.push(s) });
    expect(calls).toEqual(['only_on_device:core', 'cloud']);
    expect(stages).toEqual(['device-reading', 'checking', 'sending-after-device']);
    expect(result).toMatchObject({ inferenceSource: 'IN_CLOUD', reason: 'on-device-failed', value: KEY });
    expect(result.deviceAttempt).toMatchObject({ parsed: true, problems: ['grossPay:bad-reference', 'grossPay:missing'] });
  });

  it('year to date below gross is a failed core; kept on the device it is a plain "could not read it reliably"', async () => {
    const core = json({ ...KEY_CORE, ytdGross: KEY['netPay'] });
    const first = device({ core });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(first.calls).toEqual(['only_on_device:core', 'cloud']);
    expect(result.deviceAttempt?.problems).toContain('check:ytd-gross');
    const kept = device({ core });
    await expect(extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, deviceOnly: true })).rejects.toMatchObject({
      kind: 'on-device-unreliable',
      deviceAttempt: { problems: expect.arrayContaining(['check:ytd-gross']) },
    });
    expect(kept.calls).toEqual(['only_on_device:core']);
  });

  it('extra keys are ignored and recorded; missing keys are recorded', async () => {
    const { employeeName, ...noEmployee } = KEY_CORE;
    void employeeName;
    device({ core: json({ ...noEmployee, netPayPay: 'N1', required: ['grossPay'] }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result.inferenceSource).toBe('ON_DEVICE');
    expect(result.value).not.toHaveProperty('netPayPay');
    expect(result.value).not.toHaveProperty('required');
    expect(result.deviceAttempt?.passes?.[0]).toMatchObject({ extraKeys: ['netPayPay', 'required'], missingKeys: ['employeeName'] });
  });

  it('an unparseable deductions part leaves the deductions unread; an unparseable core goes to the cloud', async () => {
    device({ core: json(KEY_CORE), deductions: '{"deductions": [N14' });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY_CORE, deductionsNotRead: true });
    expect(result.deviceAttempt?.passes?.[1]).toMatchObject({ parsed: false, problems: ['not-json'], rawText: '{"deductions": [N14' });

    const { calls } = device({ core: '{"grossPay": N12' });
    const retried = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toEqual(['only_on_device:core', 'cloud']);
    expect(retried).toMatchObject({ reason: 'on-device-failed', deviceAttempt: { parsed: false, problems: ['not-json'] } });
  });

  it('records the latency of each part', async () => {
    device({ core: json(KEY_CORE) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    for (const pass of result.deviceAttempt?.passes ?? []) expect(pass.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe('a failed on-device answer read in one pass (no ready model reported)', () => {
  it('a wrong answer that fails the checks is repeated once in the cloud, reason on-device-failed', async () => {
    const modes = models(json({ ...KEY, netPay: KEY['grossPay'] }));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate });
    expect(modes).toEqual(['prefer_on_device', 'only_in_cloud']);
    expect(result).toMatchObject({ inferenceSource: 'IN_CLOUD', reason: 'on-device-failed', value: KEY });
    expect(result.deviceAttempt).toMatchObject({ parsed: true, problems: ['check:net-sum'] });
  });

  it('an unparseable answer is repeated in the cloud too, with the device\'s text kept for diagnosis', async () => {
    models('{"grossPay": N12');
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate });
    expect(result.reason).toBe('on-device-failed');
    expect(result.deviceAttempt).toMatchObject({ parsed: false, rawText: '{"grossPay": N12' });
  });

  it('an answer that passes is used, and its first attempt is recorded', async () => {
    const modes = models(json(KEY));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate });
    expect(modes).toEqual(['prefer_on_device']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', deviceAttempt: { parsed: true, problems: [] } });
  });

  it('kept on the device without a ready model: nothing is built or sent', async () => {
    setDeviceModelForTests('downloadable');
    const modes = models(json(KEY));
    await expect(extractPointers(doc.skeleton, 'paystub', 'en', { validate, deviceOnly: true })).rejects.toMatchObject({ kind: 'on-device-unavailable' });
    expect(modes).toEqual([]);
  });

  it('the cloud call is one pass with the shared prompt and schema, whatever the device does', async () => {
    const modes = models(json(KEY));
    await extractPointers(doc.skeleton, 'paystub', 'en', { validate, forceCloud: true });
    expect(modes).toEqual(['only_in_cloud']);
    const params = pointerModelParams('paystub', 'en', { skeleton: doc.skeleton, forceCloud: true }) as unknown as { inCloudParams: { systemInstruction: string } };
    expect(params.inCloudParams.systemInstruction).toBe(activePointerConfig().prompt.system);
  });
});

describe('the strict on-device response constraint', () => {
  type C = { properties: Record<string, Record<string, unknown> & { enum?: unknown[]; items?: Record<string, unknown> & { enum?: unknown[] } }>; required: string[]; additionalProperties: boolean };
  const ids = placeholderIds(doc.skeleton);
  const constraint = (part: 'whole' | 'core' | 'deductions') => deviceResponseConstraint(schema, activePointerConfig().schemaOptions, doc.skeleton, part) as unknown as C;

  it('core: no other keys, every key required, names W only, dates D only, amounts N only, of this silhouette', () => {
    const c = constraint('core');
    expect(c.additionalProperties).toBe(false);
    expect(c.required).toEqual(Object.keys(c.properties));
    expect(Object.keys(c.properties)).not.toContain('deductions');
    expect(c.required).toHaveLength(11);
    expect(c.properties['employerName']?.items?.enum).toEqual(ids.W);
    expect(c.properties['payDate']?.enum).toEqual([...ids.D, null]);
    expect(c.properties['grossPay']?.enum).toEqual([...ids.N, null]);
    expect(c.properties['payFrequency']?.enum).toEqual(['weekly', 'biweekly', 'semimonthly', 'monthly', null]);
    expect(JSON.stringify(c)).not.toContain('"N999"');
  });

  it('deductions: only the list; each item exactly an N placeholder and one of the fixed kinds', () => {
    const c = constraint('deductions');
    expect(c).toMatchObject({ required: ['deductions'], additionalProperties: false });
    expect(c.properties['deductions']?.items).toEqual({
      type: 'object',
      properties: { amount: { type: 'string', enum: ids.N }, kind: { type: 'string', enum: ['federal_tax', 'state_tax', 'social_security', 'medicare', 'retirement', 'health', 'other'] } },
      required: ['amount', 'kind'],
      additionalProperties: false,
    });
  });

  it('is passed to the device as promptOptions.responseConstraint, per part, with English and the document language as expected inputs', () => {
    type P = { mode: string; onDeviceParams: { createOptions: { expectedInputs: { languages: string[] }[] }; promptOptions: { responseConstraint: C } } };
    const whole = pointerModelParams('paystub', 'es', { skeleton: doc.skeleton }) as unknown as P;
    expect(whole.onDeviceParams.createOptions.expectedInputs[0]?.languages).toEqual(['en', 'es']);
    expect(whole.onDeviceParams.promptOptions.responseConstraint.properties['netPay']?.enum).toContain('N22');
    const core = pointerModelParams('paystub', 'en', { skeleton: doc.skeleton, part: 'core' }) as unknown as P;
    expect(core.mode).toBe('only_on_device');
    expect(core.onDeviceParams.promptOptions.responseConstraint).toEqual(constraint('core'));
    const deductions = pointerModelParams('paystub', 'en', { skeleton: doc.skeleton, part: 'deductions' }) as unknown as P;
    expect(deductions.onDeviceParams.promptOptions.responseConstraint).toEqual(constraint('deductions'));
  });

  it('a lease (no list) is read in one pass with the strict whole constraint', async () => {
    const c = deviceResponseConstraint(POINTER_SCHEMAS.lease, activePointerConfig().schemaOptions, doc.skeleton, 'whole') as unknown as C;
    expect(c.additionalProperties).toBe(false);
    expect(c.required).toEqual(Object.keys(POINTER_SCHEMAS.lease.properties));
  });
});
