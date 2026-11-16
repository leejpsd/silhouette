// On-device pointer extraction: a wrong, unparseable or invalid on-device answer is a failed on-device
// attempt (routing.json onDeviceFailure: one retry, ONLY_IN_CLOUD, reason on-device-failed); when the
// person keeps everything on the device there is no retry. Also the per-document response constraint.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Raw } from '../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile } from '../core/skeleton';
import { pointerProblems } from '../core/pointer-check';
import { setModelProviderForTests } from './model-port';
import { setDeviceModelForTests } from './device-fake';
import { POINTER_SCHEMAS, extractPointers, pointerModelParams } from './tasks';
import { deviceResponseConstraint, placeholderIds } from './device-schema';
import { activePointerConfig } from './tasks';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const en = JSON.parse(shared('skeleton/allowlist/en.json')) as AllowlistFile;
const doc = skeletonize(Raw.of(shared('samples/paystub-en-01.txt')), buildAllowlist([en]), buildIntroducers([en]));
const answers = JSON.parse(shared('samples/answers.json')) as { samples: Record<string, { pointers: Record<string, unknown> }> };
const KEY = answers.samples['paystub-en-01.txt']!.pointers;
const validate = (p: Record<string, unknown>) => pointerProblems(POINTER_SCHEMAS.paystub, p, doc.skeleton, doc.map, 'us-ca');

/** The device answers `device`; the cloud answers the correct key. Records the modes asked for. */
function models(device: string) {
  const modes: string[] = [];
  setModelProviderForTests(async (params) => ({
    async generateContent() {
      modes.push(params.mode);
      if (params.mode === 'only_in_cloud') return { response: { text: () => JSON.stringify(KEY), inferenceSource: 'in_cloud' } };
      return { response: { text: () => device, inferenceSource: 'on_device' } };
    },
  }));
  return modes;
}

afterEach(() => {
  setModelProviderForTests(null);
  setDeviceModelForTests('absent');
});

describe('the deterministic check of a pointer answer', () => {
  it('passes the sample\'s correct answer', () => expect(validate(KEY)).toEqual([]));

  it('catches wrong placeholders that break the paystub\'s arithmetic, wrong kinds, unknown ids and a missing gross pay', () => {
    expect(validate({ ...KEY, netPay: KEY['grossPay'] })).toContain('check:net-sum');
    expect(validate({ ...KEY, grossPay: 'D1' })).toContain('grossPay:bad-reference');
    expect(validate({ ...KEY, grossPay: 'N999' })).toContain('grossPay:bad-reference');
    const { grossPay, ...noGross } = KEY;
    void grossPay;
    expect(validate(noGross)).toContain('grossPay:missing');
    expect(validate({ ...KEY, payFrequency: 'fortnightly' })).toContain('payFrequency:not-an-option');
  });
});

describe('a failed on-device answer', () => {
  it('a wrong answer that fails the checks is repeated once in the cloud, reason on-device-failed', async () => {
    const modes = models(JSON.stringify({ ...KEY, netPay: KEY['grossPay'] }));
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
    const modes = models(JSON.stringify(KEY));
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate });
    expect(modes).toEqual(['prefer_on_device']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', deviceAttempt: { parsed: true, problems: [] } });
  });

  it('kept on the device: no retry anywhere, a plain "could not read it reliably" error', async () => {
    setDeviceModelForTests('available');
    const modes = models(JSON.stringify({ ...KEY, netPay: KEY['grossPay'] }));
    await expect(extractPointers(doc.skeleton, 'paystub', 'en', { validate, deviceOnly: true })).rejects.toMatchObject({ kind: 'on-device-unreliable' });
    expect(modes).toEqual(['only_on_device']);
  });

  it('kept on the device without a ready model: nothing is built or sent', async () => {
    setDeviceModelForTests('downloadable');
    const modes = models(JSON.stringify(KEY));
    await expect(extractPointers(doc.skeleton, 'paystub', 'en', { validate, deviceOnly: true })).rejects.toMatchObject({ kind: 'on-device-unavailable' });
    expect(modes).toEqual([]);
  });
});

describe('the on-device response constraint', () => {
  it('limits every reference to the placeholders of this silhouette, numbers to N ids', () => {
    const ids = placeholderIds(doc.skeleton);
    const constraint = deviceResponseConstraint(POINTER_SCHEMAS.paystub, activePointerConfig().schemaOptions, doc.skeleton) as { properties: Record<string, { enum?: unknown[]; items?: { enum?: unknown[] } }> };
    expect(constraint.properties['grossPay']?.enum).toEqual([...ids.N, null]);
    expect(constraint.properties['employerName']?.items?.enum).toEqual(expect.arrayContaining(['W1', 'N1']));
    expect(JSON.stringify(constraint)).not.toContain('"N999"');
  });

  it('is passed to the device with English and the document language as expected inputs', () => {
    const params = pointerModelParams('paystub', 'es', { skeleton: doc.skeleton }) as unknown as {
      onDeviceParams: { createOptions: { expectedInputs: { languages: string[] }[] }; promptOptions: { responseConstraint: { properties: Record<string, { enum?: unknown[] }> } } };
    };
    expect(params.onDeviceParams.createOptions.expectedInputs[0]?.languages).toEqual(['en', 'es']);
    expect(params.onDeviceParams.promptOptions.responseConstraint.properties['netPay']?.enum).toContain('N22');
  });
});
