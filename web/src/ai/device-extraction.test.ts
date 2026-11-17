// On-device pointer extraction. On a device with a ready model a paystub is read in two parts: the
// core fields, then the deductions. Only a core that fails its check is a failed on-device attempt
// (routing.json onDeviceFailure: one retry, ONLY_IN_CLOUD, reason on-device-failed); deductions that
// do not hold up are left out and marked not read. When the person keeps everything on the device
// there is no retry. Also the strict per-document response constraint.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Raw } from '../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile } from '../core/skeleton';
import { corePointerProblems, deductionsProblems, notReadFields, pointerProblems, unconfirmedFields, ytdMissingWithCandidate } from '../core/pointer-check';
import { setModelProviderForTests } from './model-port';
import { setDeviceModelForTests } from './device-fake';
import { POINTER_SCHEMAS, cancelPreparedReading, dropPreparedReadings, extractPointers, pointerModelParams, prepareDeviceReading, type PointerStage } from './tasks';
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
  core: (p: Record<string, unknown>) => corePointerProblems(schema, p, doc.map, 'us-ca', doc.skeleton),
  deductions: (p: Record<string, unknown>) => deductionsProblems(schema, p, doc.map, 'us-ca'),
  notRead: (p: Record<string, unknown>) => notReadFields(p, doc.skeleton),
  ytdMissing: (p: Record<string, unknown>) => ytdMissingWithCandidate(schema, p, doc.skeleton, doc.map, 'us-ca'),
};
const json = (v: unknown) => JSON.stringify(v);

type Part = 'whole' | 'core' | 'deductions' | 'deductions-again' | 'gross';
interface Params {
  mode: string;
  onDeviceParams?: { promptOptions?: { responseConstraint?: { properties?: Record<string, unknown> } }; createOptions?: { initialPrompts?: { content: string }[] } };
}
const partOf = (params: Params): Part => {
  const keys = Object.keys(params.onDeviceParams?.promptOptions?.responseConstraint?.properties ?? {});
  if (keys.length === 1 && keys[0] === 'deductions') return 'deductions';
  if (keys.join(',') === 'grossPay,ytdGross') return 'gross';
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

/**
 * A device with a ready model that answers each part with the given text (the gross part repeats the
 * core's answer unless given; the deductions asked again repeat the first deductions unless given),
 * taking `delayMs` per request; the cloud answers the key.
 */
function device(text: { core: string; deductions?: string; deductionsAgain?: string; gross?: string }, delayMs = 0) {
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
      const system = p.onDeviceParams?.createOptions?.initialPrompts?.[0]?.content ?? '';
      const part: Part = partOf(p) === 'deductions' && system.includes('did not add up') ? 'deductions-again' : partOf(p);
      calls.push(`${p.mode}:${part}`);
      systems.push(system);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const deductions = text.deductions ?? json({ deductions: KEY_DEDUCTIONS });
      const answer =
        part === 'deductions' ? deductions : part === 'deductions-again' ? (text.deductionsAgain ?? deductions) : part === 'gross' ? (text.gross ?? text.core) : text.core;
      return { response: { text: () => answer, inferenceSource: 'on_device' } };
    },
  }));
  return { calls, systems };
}

afterEach(() => {
  dropPreparedReadings();
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

  it('core with the silhouette: year to date must be the gross line\'s (same-line and larger-amount rules)', () => {
    expect(checkParts.core({ ...KEY_CORE, ytdGross: 'N7' })).toEqual(['ytdGross:not-on-gross-line', 'ytdGross:ambiguous']);
    expect(checkParts.core(KEY_CORE)).toEqual([]);
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
    // Asked once more (the list did not add up), then left out.
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions', 'only_on_device:deductions-again']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY_CORE, deductionsNotRead: true });
    expect(result.value).not.toHaveProperty('deductions');
    expect(result.deviceAttempt?.passes?.map((p) => [p.part, p.problems])).toEqual([
      ['core', []],
      ['deductions', ['check:net-sum']],
      ['deductions-again', ['check:net-sum']],
    ]);
  });

  it('core right and deductions that fail net pay = gross − deductions: the core is used, deductions not read', async () => {
    device({ core: json(KEY_CORE), deductions: json({ deductions: [(KEY_DEDUCTIONS as unknown[])[0]] }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'document-silhouette-only', value: KEY_CORE, deductionsNotRead: true });
    expect(result.deviceAttempt?.passes?.[1]).toMatchObject({ parsed: true, problems: ['check:net-sum'] });
  });

  it('a core of the wrong kind is a failed on-device attempt: no deductions part, one cloud retry', async () => {
    const { calls } = device({ core: json({ ...KEY_CORE, payFrequency: 'fortnightly' }) });
    const stages: PointerStage[] = [];
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, onProgress: (s) => stages.push(s) });
    expect(calls).toEqual(['only_on_device:core', 'cloud']);
    expect(stages).toEqual(['device-reading', 'checking', 'sending-after-device']);
    expect(result).toMatchObject({ inferenceSource: 'IN_CLOUD', reason: 'on-device-failed', value: KEY });
    expect(result.deviceAttempt).toMatchObject({ parsed: true, problems: ['payFrequency:not-an-option'] });
  });

  it('year to date from the Regular line: the gross part is asked; its right answer keeps the reading on this device', async () => {
    const { calls } = device({ core: json({ ...KEY_CORE, ytdGross: 'N7' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }) }, 20);
    const stages: PointerStage[] = [];
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, onProgress: (s) => stages.push(s) });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:gross', 'only_on_device:deductions']);
    expect(stages).toEqual(['device-reading', 'checking', 'device-gross', 'checking', 'device-deductions', 'checking']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY, deductionsNotRead: false });
    const passes = result.deviceAttempt?.passes ?? [];
    expect(passes.map((p) => [p.part, p.problems])).toEqual([
      ['core', ['ytdGross:not-on-gross-line', 'ytdGross:ambiguous']],
      ['gross', []],
      ['deductions', []],
    ]);
    // Each part's time is recorded: the gross part is the extra cost of this path.
    for (const p of passes) expect(p.latencyMs).toBeGreaterThanOrEqual(15);
  });

  it('year to date from the Regular line twice: one cloud retry, both parts kept for diagnosis', async () => {
    const { calls } = device({ core: json({ ...KEY_CORE, ytdGross: 'N7' }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:gross', 'cloud']);
    expect(result).toMatchObject({ inferenceSource: 'IN_CLOUD', reason: 'on-device-failed', value: KEY });
    expect(result.deviceAttempt?.passes?.map((p) => p.part)).toEqual(['core', 'gross']);
    expect(result.deviceAttempt?.problems).toContain('ytdGross:not-on-gross-line');
  });

  it('names that share a placeholder are left out as not read; the reading stays on this device', async () => {
    device({ core: json({ ...KEY_CORE, employeeName: ['W4', 'W5', 'W3'] }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'document-silhouette-only', notRead: ['employerName', 'employeeName'] });
    expect(result.value).not.toHaveProperty('employerName');
    expect(result.value).not.toHaveProperty('employeeName');
    expect(result.value).toMatchObject({ grossPay: 'N12', ytdGross: 'N13', deductions: KEY_DEDUCTIONS });
    // W3 also leaves the employee name cut short on the employer's line.
    expect(result.deviceAttempt?.passes?.[0]?.marked).toEqual(['names:shared-placeholder', 'employeeName:incomplete']);
  });

  it('a name cut short (the next word on its line left out) is left out as not read; the reading stays on this device', async () => {
    device({ core: json({ ...KEY_CORE, employerName: ['W1'], employeeName: ['W4'] }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', notRead: ['employerName', 'employeeName'] });
    expect(result.value).not.toHaveProperty('employerName');
    expect(result.value).not.toHaveProperty('employeeName');
    expect(result.deviceAttempt?.passes?.[0]?.marked).toEqual(['employerName:incomplete', 'employeeName:incomplete']);
  });

  it('hours or rate on the placeholder of an amount: that field is left out as not read, the reading kept', async () => {
    device({ core: json({ ...KEY_CORE, hoursWorked: 'N12' }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', notRead: ['hoursWorked'] });
    expect(result.value).not.toHaveProperty('hoursWorked');
    expect(result.value).toMatchObject({ hourlyRate: 'N4', grossPay: 'N12' });
    expect(result.deviceAttempt?.passes?.[0]?.marked).toEqual(['hoursWorked:shares-placeholder']);
  });

  it('year to date left out although the gross line holds one: the gross part is asked, its answer used when the core passes', async () => {
    const { ytdGross, ...noYtd } = KEY_CORE;
    void ytdGross;
    const { calls } = device({ core: json({ ...noYtd, ytdGross: null }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:gross', 'only_on_device:deductions']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY });
  });

  it('year to date still left out by the gross part: kept on this device as "not found", nothing filled in', async () => {
    const { ytdGross, ...noYtd } = KEY_CORE;
    void ytdGross;
    const { calls } = device({ core: json({ ...noYtd, ytdGross: null }), gross: json({ grossPay: 'N12', ytdGross: null }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:gross', 'only_on_device:deductions']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'document-silhouette-only' });
    expect(result.value).not.toHaveProperty('ytdGross');
    expect(result.deviceAttempt?.passes?.[1]).toMatchObject({ part: 'gross', problems: ['ytdGross:still-missing'] });
  });

  it('a wrong year to date from the gross part is not used: still "not found", on this device', async () => {
    const { ytdGross, ...noYtd } = KEY_CORE;
    void ytdGross;
    device({ core: json({ ...noYtd, ytdGross: null }), gross: json({ grossPay: 'N12', ytdGross: 'N7' }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(result.inferenceSource).toBe('ON_DEVICE');
    expect(result.value).not.toHaveProperty('ytdGross');
    expect(result.deviceAttempt?.passes?.[1]?.problems).toContain('ytdGross:not-on-gross-line');
  });

  it('deductions that leave out the last line are asked once more; a right second answer is used, both times recorded', async () => {
    const short = json({ deductions: (KEY_DEDUCTIONS as unknown[]).slice(0, 3) });
    const { calls, systems } = device({ core: json(KEY_CORE), deductions: short, deductionsAgain: json({ deductions: KEY_DEDUCTIONS }) }, 15);
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions', 'only_on_device:deductions-again']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY, deductionsNotRead: false, notRead: [] });
    const passes = result.deviceAttempt?.passes ?? [];
    expect(passes.map((p) => [p.part, p.problems])).toEqual([
      ['core', []],
      ['deductions', ['check:net-sum']],
      ['deductions-again', []],
    ]);
    for (const p of passes) expect(p.latencyMs).toBeGreaterThanOrEqual(10);
    // The added sentence carries no value: only the fixed wording.
    expect(systems[2]).toContain('including the last one');
    expect(systems[2]).not.toMatch(/\d+\.\d{2}/);
  });

  it('year to date below gross is a failed core; kept on the device it is a plain "could not read it reliably"', async () => {
    const core = json({ ...KEY_CORE, ytdGross: KEY['netPay'] });
    const first = device({ core });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(first.calls).toEqual(['only_on_device:core', 'only_on_device:gross', 'cloud']);
    expect(result.deviceAttempt?.problems).toContain('check:ytd-gross');
    const kept = device({ core });
    await expect(extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, deviceOnly: true })).rejects.toMatchObject({
      kind: 'on-device-unreliable',
      deviceAttempt: { problems: expect.arrayContaining(['check:ytd-gross']) },
    });
    expect(kept.calls).toEqual(['only_on_device:core', 'only_on_device:gross']);
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

describe('shown only when confirmed', () => {
  const confirmed = { ...checkParts, confirm: (p: Record<string, unknown>) => unconfirmedFields(schema, p, doc.skeleton, doc.map, 'us-ca', 'en') };
  const read = async (core: Record<string, unknown>, deductions?: string) => {
    device({ core: json(core), ...(deductions ? { deductions, deductionsAgain: deductions } : {}) });
    return extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts: confirmed });
  };

  it('a right reading keeps every value: rate × hours is the Regular line, net pay adds up', async () => {
    const result = await read(KEY_CORE);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY, notRead: [] });
  });

  it('hours and rate that do not multiply to an earnings amount are both left out (consecutive placeholders, as on the iPhone)', async () => {
    const result = await read({ ...KEY_CORE, hoursWorked: 'N1', hourlyRate: 'N2' });
    expect(result.notRead).toEqual(['hoursWorked', 'hourlyRate']);
    expect(result.value).not.toHaveProperty('hoursWorked');
    expect(result.value).not.toHaveProperty('hourlyRate');
    expect(result.deviceAttempt?.passes?.[0]?.marked).toEqual(['hoursWorked:unconfirmed', 'hourlyRate:unconfirmed']);
    // A right rate alone is not shown either: only together.
    const alone = await read({ ...KEY_CORE, hoursWorked: 'N9' });
    expect(alone.notRead).toEqual(['hoursWorked', 'hourlyRate']);
  });

  it('net pay: kept when the deductions add up, or on a "Net Pay" line when they were not read; otherwise left out', async () => {
    const shortList = json({ deductions: (KEY_DEDUCTIONS as unknown[]).slice(0, 3) });
    const onNetLine = await read(KEY_CORE, shortList);
    expect(onNetLine).toMatchObject({ value: KEY_CORE, notRead: ['deductions'] });
    // A wrong net pay (another line's amount) with the deductions not read: left out.
    const wrong = await read({ ...KEY_CORE, netPay: 'N10' }, shortList);
    expect(wrong.notRead).toEqual(['deductions', 'netPay']);
    expect(wrong.value).not.toHaveProperty('netPay');
  });

  it('a pay date on the period start (D1) contradicts the period: left out, the period end is used', async () => {
    const result = await read({ ...KEY_CORE, payDate: 'D1' });
    expect(result.notRead).toEqual(['payDate']);
    expect(result.deviceAttempt?.passes?.[0]?.marked).toEqual(['payDate:before-period-end']);
  });

  it('after the gross part repaired gross pay and year to date, the rest of the first answer still needs its confirmation', async () => {
    device({ core: json({ ...KEY_CORE, ytdGross: 'N7', hoursWorked: 'N8', hourlyRate: 'N9' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }) });
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts: confirmed });
    expect(result.deviceAttempt?.passes?.map((p) => p.part)).toEqual(['core', 'gross', 'deductions']);
    expect(result.value).toMatchObject({ grossPay: 'N12', ytdGross: 'N13' });
    // N8 × N9 (27.75 × 4.50 = 124.88) is the Overtime line's amount and not above gross: shown, the model's choice.
    expect(result.notRead).toEqual([]);
    device({ core: json({ ...KEY_CORE, ytdGross: 'N7', hoursWorked: 'N7', hourlyRate: 'N4' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }) });
    const confused = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts: confirmed });
    expect(confused.notRead).toEqual(['hoursWorked', 'hourlyRate']);
  });
});

describe('reading ahead while the preview is open', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('the whole reading runs on this device before Send, and Send uses it once without asking again', async () => {
    const { calls } = device({ core: json(KEY_CORE) });
    expect(await prepareDeviceReading(doc.skeleton, 'paystub', 'en', { checkParts })).toBe(true);
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions']);
    const stages: PointerStage[] = [];
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, onProgress: (s) => stages.push(s) });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY });
    // Already done: the status line shows the last step it reached.
    expect(stages).toEqual(['checking']);
    // Used once: a second reading asks the device again.
    await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls.filter((c) => c.endsWith(':core'))).toHaveLength(2);
  });

  it('every part is read ahead: the gross part and the deductions asked again too', async () => {
    const short = json({ deductions: (KEY_DEDUCTIONS as unknown[]).slice(0, 3) });
    const { calls } = device({ core: json({ ...KEY_CORE, ytdGross: 'N7' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: short, deductionsAgain: json({ deductions: KEY_DEDUCTIONS }) });
    await prepareDeviceReading(doc.skeleton, 'paystub', 'en', { checkParts });
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:gross', 'only_on_device:deductions', 'only_on_device:deductions-again']);
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toHaveLength(4);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY });
    expect(result.deviceAttempt?.passes?.map((p) => p.part)).toEqual(['core', 'gross', 'deductions', 'deductions-again']);
  });

  it('Send while it is still running continues from where it is, and the status line follows the real step', async () => {
    const { calls } = device({ core: json(KEY_CORE) }, 30);
    const ahead = prepareDeviceReading(doc.skeleton, 'paystub', 'en', { checkParts });
    await expect.poll(() => calls.length).toBe(1);
    const stages: PointerStage[] = [];
    const result = await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts, onProgress: (s) => stages.push(s) });
    await ahead;
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:deductions']);
    expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', value: KEY });
    // Joined during the core part: core, then checking, the deductions, checking.
    expect(stages).toEqual(['device-reading', 'checking', 'device-deductions', 'checking']);
  });

  it('a word hidden in the middle: the old reading stops after its current part, the new silhouette is read', async () => {
    const { calls } = device({ core: json(KEY_CORE) }, 20);
    const changed = `${doc.skeleton}\n` as never;
    const first = prepareDeviceReading(doc.skeleton, 'paystub', 'en', { checkParts });
    await expect.poll(() => calls.length).toBe(1);
    // The silhouette changes while the core part of the first one is running.
    cancelPreparedReading();
    expect(await first).toBe(false);
    expect(await prepareDeviceReading(changed, 'paystub', 'en', { checkParts })).toBe(true);
    // The first reading asked for nothing after its core part.
    expect(calls).toEqual(['only_on_device:core', 'only_on_device:core', 'only_on_device:deductions']);
    await extractPointers(changed, 'paystub', 'en', { validate, checkParts });
    expect(calls).toHaveLength(3);
    // The old silhouette was dropped: it is read again from the start.
    await extractPointers(doc.skeleton, 'paystub', 'en', { validate, checkParts });
    expect(calls).toHaveLength(5);
  });

  it('leaving the screen cancels it; without a ready model nothing starts', async () => {
    const { calls } = device({ core: json(KEY_CORE) }, 20);
    const ahead = prepareDeviceReading(doc.skeleton, 'paystub', 'en', { checkParts });
    await expect.poll(() => calls.length).toBe(1);
    cancelPreparedReading();
    expect(await ahead).toBe(false);
    await settle();
    expect(calls).toEqual(['only_on_device:core']);
    dropPreparedReadings();
    setDeviceModelForTests('downloadable');
    const modes = models(json(KEY));
    expect(await prepareDeviceReading(doc.skeleton, 'paystub', 'en', { checkParts })).toBe(false);
    expect(modes).toEqual([]);
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
