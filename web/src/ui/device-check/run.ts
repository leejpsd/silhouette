// The device check: a fixed set of synthetic cases run through Firebase AI Logic and the app's own task
// functions, recording where each one actually ran. It produces a run file (JSON) that can be kept as
// evidence and replayed by a browser without the on-device model. Synthetic inputs only.

import { Raw, asPublic } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { buildReview, type ReviewField } from '../../core/review';
import { tidyNamePointers } from '../../core/tidy';
import { criterionReasons, verdicts } from '../../core/rules';
import { askChip, explainProgram, extractPointers, planAskChip, planExplain, POINTER_SCHEMAS, type DeviceAttempt, type TaskResult } from '../../ai/tasks';
import { corePointerProblems, deductionsProblems, goldPlaceholderIds, notReadFields, pointerProblems, ytdMissingWithCandidate } from '../../core/pointer-check';
import { askFreeText, explainPersonal, readPhoto } from '../../ai/on-device';
import { askDeviceStatus, photoDeviceStatus, pointerDeviceStatus } from '../../ai/device-model';
import { classifyError } from '../../ai/errors';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { explainInput } from '../answers/silhouette';
import { programFacts } from '../answers/facts';
import { personalResult } from '../answers/personal';
import { translator, type Locale } from '../i18n';
import { BANDS, PACK } from '../pack';
import { buildSteps, toEngineAnswers } from '../quickcheck';
import { preparedHousehold } from '../judges/household';
import answers from '../../../../shared/samples/answers.json';
import sampleText from '../../../../shared/samples/paystub-en-01.txt?raw';
import docA from '../../../eval/dataset/en-l01-1.txt?raw';
import goldA from '../../../eval/dataset/en-l01-1.gold.json';
import docB from '../../../eval/dataset/en-l04-2.txt?raw';
import goldB from '../../../eval/dataset/en-l04-2.gold.json';
import docC from '../../../eval/dataset/en-l07-3.txt?raw';
import goldC from '../../../eval/dataset/en-l07-3.gold.json';
import docD from '../../../eval/dataset/en-l10-1.txt?raw';
import goldD from '../../../eval/dataset/en-l10-1.gold.json';

export const RUN_FILE_KIND = 'silhouette-device-check';
/**
 * Version 2 adds the per-field diagnosis of extraction and the result after checks and any retry.
 * Version 3 makes `ran` where each case was finally answered (in versions 1 and 2 it is where the first
 * attempt ran), keeps the first attempt under `first`, and records the two parts of an on-device reading.
 */
export const RUN_FILE_VERSION = 3;

export type Ran = 'ON_DEVICE' | 'IN_CLOUD' | 'not-run';

export interface CaseResult {
  readonly id: string;
  readonly task: string;
  /** The inference mode the app asked for (routing.json). */
  readonly mode: 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_ON_DEVICE';
  /**
   * Version 3: where the case was finally answered, from the response (for extraction, after the
   * checks and any retry); `not-run` when it failed or was skipped. Versions 1 and 2: where the first
   * attempt ran. Read it with finalRan() and firstRan(), which handle every version.
   */
  readonly ran: Ran;
  readonly latencyMs: number | null;
  /** For model text: whether the check on model text passed (null when there was no text to check). */
  readonly outputCheck: 'passed' | 'blocked' | null;
  /**
   * For pointer extraction: fields equal to the gold answers in the first answer (the device's, when
   * the device answered). Version 1 files hold only this.
   */
  readonly fields?: { readonly correct: number; readonly total: number } | undefined;
  /** Version 2, extraction: what the person ends up with, after the checks and any retry. */
  readonly final?:
    | {
        readonly ran: Ran;
        readonly fields: { readonly correct: number; readonly total: number };
        readonly retried: boolean;
        /** Version 3: answered on this device without the deductions, which it could not read reliably. */
        readonly deductionsNotRead?: boolean | undefined;
        /** Version 3: every field left out as not read on this device (deductions, names). */
        readonly notRead?: readonly string[] | undefined;
        /**
         * Version 3: the inputs of the yearly income (gross pay, year to date, pay frequency, period
         * start, period end, pay date) are all right, or absent where the document has none.
         */
        readonly incomeInputsCorrect?: boolean | undefined;
        /** Version 3: the yearly-income inputs that are right (or rightly absent), not found, or wrong. */
        readonly incomeInputs?: IncomeInputs | undefined;
        /** Version 3: every field whose value reached the person wrong (a value where the document has another, or none). */
        readonly wrongFields?: readonly string[] | undefined;
      }
    | undefined;
  /** Version 3, extraction: the first attempt (the device's, when it answered) and where it ran. */
  readonly first?: { readonly ran: Ran; readonly fields: { readonly correct: number; readonly total: number } } | undefined;
  /** Version 2, extraction: the device's answer, field by field (placeholder ids and field names only). */
  readonly device?: DeviceDiagnosis | undefined;
  readonly error?: string | undefined;
  readonly note?: string | undefined;
  /** Version 3, repeated runs: which repetition of the case this is (1, 2, 3…). */
  readonly repetition?: number | undefined;
}

export interface IncomeInputs {
  readonly right: readonly string[];
  readonly notFound: readonly string[];
  readonly wrong: readonly string[];
}

export type FieldStatus = 'correct' | 'wrong' | 'missing' | 'spurious' | 'absent';

export interface DeviceDiagnosis {
  /**
   * How fields are scored: by value. A field is right when the placeholder answered holds the expected
   * value, whichever placeholder that is; `gold` lists every placeholder holding it (a paystub can
   * write the same amount twice, as an only earnings line and as the gross line).
   */
  readonly scoredBy?: 'value' | undefined;
  /** The model's text, as it answered: placeholder ids and field names only. */
  readonly rawText: string;
  readonly parsed: boolean;
  /** Problems the deterministic check found (empty: the answer passed and was used). */
  readonly problems: readonly string[];
  readonly passed: boolean;
  readonly fields: readonly { readonly field: string; readonly gold: readonly string[]; readonly answered: readonly string[]; readonly status: FieldStatus }[];
  /** Version 3: the device's core fields (all but the deductions) right, against the gold answers. */
  readonly core?: { readonly correct: number; readonly total: number } | undefined;
  /** Version 3: the device's deductions against the gold answers; `not-asked` when the core failed first. */
  readonly deductions?: FieldStatus | 'not-asked' | undefined;
  /** Version 3: the deductions were left out and marked "not read on this device". */
  readonly deductionsNotRead?: boolean | undefined;
  /** Version 3: each request to the device, in order (placeholder ids and field names only). */
  readonly passes?: readonly DevicePassRecord[] | undefined;
}

export interface DevicePassRecord {
  readonly part: string;
  readonly rawText: string;
  readonly parsed: boolean;
  /** The parsed answer of this part (placeholder ids and field names only). */
  readonly parsedValue?: Record<string, unknown> | undefined;
  readonly problems: readonly string[];
  /** Problems that only left fields out as not read (names that share a placeholder). */
  readonly marked?: readonly string[] | undefined;
  readonly extraKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly latencyMs: number;
}

export interface RunFile {
  readonly kind: typeof RUN_FILE_KIND;
  readonly version: number;
  readonly date: string;
  readonly browser: string;
  readonly platform: string;
  readonly userAgent: string;
  /** Model availability states seen before the run, per set of create options. */
  readonly availability: Readonly<Record<string, string>>;
  readonly jurisdiction: string;
  /** Version 3: how many times each extraction case was run (1 when absent). */
  readonly repetitions?: number | undefined;
  readonly cases: readonly CaseResult[];
}

/** "Chrome 142.0.7444.59" from the user agent. */
export function browserVersion(ua: string): string {
  for (const [token, name] of [['Edg', 'Edge'], ['OPR', 'Opera'], ['Chrome', 'Chrome'], ['Firefox', 'Firefox'], ['Version', 'Safari']] as const) {
    const m = new RegExp(`${token}/([\\d.]+)`).exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return 'unknown browser';
}

/**
 * "device-check-2026-11-16T1744-chrome157-macos.json": the date and time (UTC, as in the file), browser
 * major version and platform, so two runs on one day or on different machines do not collide.
 */
export function runFileName(file: Pick<RunFile, 'date' | 'browser' | 'platform'>): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const [name = 'browser', version = ''] = file.browser.split(' ');
  const time = /T(\d{2}):(\d{2})/.exec(file.date);
  const stamp = `${file.date.slice(0, 10)}${time ? `T${time[1]}${time[2]}` : ''}`;
  return `device-check-${stamp}-${slug(name)}${version.split('.')[0] ?? ''}-${slug(file.platform)}.json`;
}

export function platformString(): string {
  const data = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return data?.platform || navigator.platform || 'unknown platform';
}

export async function availabilityStates(): Promise<Record<string, string>> {
  const hasApi = typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== 'undefined';
  if (!hasApi) return { languageModel: 'absent' };
  return {
    languageModel: 'present',
    'text en → en (document pointers)': await pointerDeviceStatus('paystub', 'en'),
    'text en (answers)': await askDeviceStatus('en'),
    'text es (answers)': await askDeviceStatus('es'),
    'image + text en (photo)': await photoDeviceStatus('en'),
  };
}

// ---------- Extraction ----------

type Gold = Readonly<Record<string, unknown>>;

const near = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : a === b);

/** Fields with a gold value that the extraction got right (deductions count as one field: exact as a set). */
export function scoreFields(review: readonly ReviewField[], gold: Gold): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  for (const [name, value] of Object.entries(gold)) {
    if (value === null || value === undefined) continue;
    total++;
    const field = review.find((f) => f.name === name);
    if (!field) continue;
    if (name === 'deductions') {
      const want = (value as { amount: number }[]).map((d) => d.amount);
      const got = field.items.map((i) => (i.value as { amount?: unknown }).amount);
      if (want.length === got.length && want.every((w) => got.some((g) => near(g, w)))) correct++;
    } else if (near(field.value, value)) correct++;
  }
  return { correct, total };
}

/** The bundled sample's gold answers: its answer key, read through the same Rehydrator. */
function sampleGold(): Gold {
  const { skeleton, map } = skeletonize(Raw.of(sampleText), allowlistFor('en'), introducersFor('en'));
  const review = buildReview(POINTER_SCHEMAS.paystub, answers.samples['paystub-en-01.txt'].pointers, skeleton, map);
  const out: Record<string, unknown> = {};
  for (const f of review) {
    if (f.kind === 'list') out[f.name] = f.items.map((i) => i.value);
    else if (f.value !== null) out[f.name] = f.value;
  }
  return out;
}

const EXTRACTION_CASES: readonly { id: string; text: string; gold: () => Gold }[] = [
  { id: 'pointers: bundled sample', text: sampleText, gold: sampleGold },
  { id: 'pointers: evaluation paystub L01', text: docA, gold: () => goldA },
  { id: 'pointers: evaluation paystub L04', text: docB, gold: () => goldB },
  { id: 'pointers: evaluation paystub L07', text: docC, gold: () => goldC },
  { id: 'pointers: evaluation paystub L10', text: docD, gold: () => goldD },
];

const elapsed = (started: number) => Math.round(performance.now() - started);

const failed = (error: unknown) => {
  const e = classifyError(error);
  return { outputCheck: e.kind === 'blocked' ? ('blocked' as const) : null, error: `${e.kind}: ${e.detail}`.slice(0, 300) };
};

/** The ids a pointer answer gives for a field (strings found anywhere in it). */
function answeredIds(value: unknown): string[] {
  if (typeof value === 'string') return /^[NDW][0-9]+$/.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(answeredIds);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(answeredIds);
  return [];
}

/** The fields the yearly income is worked out from (src/core/validate.ts, annualization). */
export const INCOME_INPUTS: readonly string[] = ['grossPay', 'ytdGross', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'];

/** Whether every input of the yearly income is right (or absent where the document has none). */
export function incomeInputsCorrect(statuses: Readonly<Record<string, FieldStatus>>): boolean {
  return INCOME_INPUTS.every((f) => statuses[f] === undefined || statuses[f] === 'correct' || statuses[f] === 'absent');
}

/** The yearly-income inputs as right (or rightly absent), not found (left empty), or wrong (a value that is not the document's). */
export function incomeInputs(statuses: Readonly<Record<string, FieldStatus>>): IncomeInputs {
  const of = (want: readonly (FieldStatus | undefined)[]) => INCOME_INPUTS.filter((f) => want.includes(statuses[f]));
  return { right: of(['correct', 'absent', undefined]), notFound: of(['missing']), wrong: of(['wrong', 'spurious']) };
}

/** Fields whose value reaches the person wrong: a value that is not the document's, or one where it has none. */
export function wrongFields(statuses: Readonly<Record<string, FieldStatus>>): string[] {
  return Object.entries(statuses)
    .filter(([, s]) => s === 'wrong' || s === 'spurious')
    .map(([f]) => f);
}

/** Field-by-field outcome of an answer against the gold answers (as the review screen would show it). */
export function fieldStatuses(review: readonly ReviewField[], gold: Gold): Record<string, FieldStatus> {
  const out: Record<string, FieldStatus> = {};
  for (const field of review) {
    const want = gold[field.name];
    const has = field.kind === 'list' ? field.items.length > 0 : field.value !== null;
    if (want === undefined || want === null) {
      out[field.name] = has ? 'spurious' : 'absent';
      continue;
    }
    if (!has) {
      out[field.name] = 'missing';
      continue;
    }
    out[field.name] = scoreFields([field], { [field.name]: want }).correct === 1 ? 'correct' : 'wrong';
  }
  return out;
}

async function extraction(c: (typeof EXTRACTION_CASES)[number], repetition?: number): Promise<CaseResult> {
  const started = performance.now();
  const base = { id: c.id, task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE' as const, ...(repetition !== undefined ? { repetition } : {}) };
  const { skeleton, map } = skeletonize(Raw.of(c.text), allowlistFor('en'), introducersFor('en'));
  const gold = c.gold();
  const goldIds = goldPlaceholderIds(gold, map);
  const reviewOf = (value: unknown) => buildReview(POINTER_SCHEMAS.paystub, tidyNamePointers(POINTER_SCHEMAS.paystub, value, map, introducersFor('en')), skeleton, map);
  const { deductions: goldDeductions, ...goldCore } = gold;
  // Everything the device answered, including deductions that were then left out as not read.
  const deviceAnswer = (attempt: DeviceAttempt): Record<string, unknown> | undefined => {
    if (!attempt.passes) return attempt.value;
    const parts = attempt.passes.filter((p) => p.value !== undefined).map((p) => p.value as Record<string, unknown>);
    return parts.length > 0 ? Object.assign({}, ...parts) : undefined;
  };
  const diagnose = (attempt: DeviceAttempt): DeviceDiagnosis => {
    const answer = deviceAnswer(attempt);
    const statuses = answer ? fieldStatuses(reviewOf(answer), gold) : {};
    const core = answer ? scoreFields(reviewOf(answer), goldCore) : { correct: 0, total: scoreFields([], goldCore).total };
    const deductionsAsked = !attempt.passes || attempt.passes.some((p) => p.part === 'deductions');
    const goldHasDeductions = Array.isArray(goldDeductions) && goldDeductions.length > 0;
    return {
      scoredBy: 'value',
      rawText: attempt.rawText.slice(0, 4000),
      parsed: attempt.parsed,
      problems: attempt.problems,
      passed: attempt.problems.length === 0,
      fields: Object.keys(POINTER_SCHEMAS.paystub.properties).map((field) => ({
        field,
        gold: goldIds[field] ?? [],
        answered: answeredIds(answer?.[field]),
        status: statuses[field] ?? (gold[field] === undefined || gold[field] === null ? 'absent' : 'missing'),
      })),
      core,
      // The deductions the device gave, before any were left out (from the deductions part's own answer).
      deductions: deductionsAsked ? (statuses['deductions'] ?? (goldHasDeductions ? 'missing' : 'absent')) : 'not-asked',
      deductionsNotRead: attempt.deductionsNotRead ?? false,
      passes: attempt.passes?.map((p) => ({
        part: p.part,
        rawText: p.rawText.slice(0, 4000),
        parsed: p.parsed,
        parsedValue: p.value,
        problems: p.problems,
        marked: p.marked,
        extraKeys: p.extraKeys,
        missingKeys: p.missingKeys,
        latencyMs: p.latencyMs,
      })),
    };
  };
  const schema = POINTER_SCHEMAS.paystub;
  try {
    const result = await extractPointers(skeleton, 'paystub', 'en', {
      validate: (p) => pointerProblems(schema, p, skeleton, map, PACK.jurisdiction),
      checkParts: {
        core: (p) => corePointerProblems(schema, p, map, PACK.jurisdiction, skeleton),
        deductions: (p) => deductionsProblems(schema, p, map, PACK.jurisdiction),
        notRead: (p) => notReadFields(p, skeleton),
        ytdMissing: (p) => ytdMissingWithCandidate(schema, p, skeleton, map, PACK.jurisdiction),
      },
    });
    const finalFields = scoreFields(reviewOf(result.value), gold);
    const finalStatuses = fieldStatuses(reviewOf(result.value), gold);
    const attempt = result.deviceAttempt;
    // The first answer: the device's when it answered (used or not), otherwise the cloud's.
    const answer = attempt ? deviceAnswer(attempt) : undefined;
    const firstFields = attempt ? (answer ? scoreFields(reviewOf(answer), gold) : { correct: 0, total: finalFields.total }) : finalFields;
    return {
      ...base,
      ran: result.inferenceSource,
      latencyMs: elapsed(started),
      outputCheck: null,
      first: { ran: attempt ? 'ON_DEVICE' : result.inferenceSource, fields: firstFields },
      final: {
        ran: result.inferenceSource,
        fields: finalFields,
        retried: result.reason === 'on-device-failed',
        deductionsNotRead: result.deductionsNotRead ?? false,
        notRead: result.notRead ?? [],
        incomeInputsCorrect: incomeInputsCorrect(finalStatuses),
        incomeInputs: incomeInputs(finalStatuses),
        wrongFields: wrongFields(finalStatuses),
      },
      device: attempt ? diagnose(attempt) : undefined,
      note: result.reason,
    };
  } catch (error) {
    const attempt = (error as { deviceAttempt?: DeviceAttempt }).deviceAttempt;
    return {
      ...base,
      ran: 'not-run',
      latencyMs: elapsed(started),
      ...failed(error),
      first: attempt ? { ran: 'ON_DEVICE', fields: deviceAnswer(attempt) ? scoreFields(reviewOf(deviceAnswer(attempt)), gold) : { correct: 0, total: scoreFields([], gold).total } } : undefined,
      device: attempt ? diagnose(attempt) : undefined,
    };
  }
}

// ---------- Explanations and questions ----------

const textResult = (base: Omit<CaseResult, 'ran' | 'latencyMs' | 'outputCheck'>, started: number, result: TaskResult<unknown>): CaseResult => ({
  ...base,
  ran: result.inferenceSource,
  latencyMs: elapsed(started),
  outputCheck: 'passed',
  note: result.reason,
});

/** The first program of the pack (read from the pack, never by name). */
const firstProgram = () => {
  const program = PACK.programs[0];
  if (!program) throw new Error('the rule pack has no programs');
  return program;
};

async function explanation(locale: Locale): Promise<CaseResult> {
  const program = firstProgram();
  const plan = planExplain(explainInput(programFacts(translator(locale), locale, program), locale), 'short');
  const base = { id: `explanation (${locale})`, task: plan.taskId, mode: plan.mode as CaseResult['mode'] };
  const started = performance.now();
  try {
    return textResult(base, started, await explainProgram(plan));
  } catch (error) {
    return { ...base, ran: 'not-run', latencyMs: elapsed(started), ...failed(error) };
  }
}

async function question(locale: Locale, chip: 'ask.chip.apply' | 'ask.chip.change'): Promise<CaseResult> {
  const t = translator(locale);
  const program = firstProgram();
  const plan = planAskChip(explainInput(programFacts(t, locale, program), locale), asPublic({ id: chip, question: t(chip) }));
  const base = { id: `${t(chip)} (${locale})`, task: plan.taskId, mode: plan.mode as CaseResult['mode'] };
  const started = performance.now();
  try {
    return textResult(base, started, await askChip(plan));
  } catch (error) {
    return { ...base, ran: 'not-run', latencyMs: elapsed(started), ...failed(error) };
  }
}

/** The prepared synthetic household's own result for the first program (on this device only). */
function syntheticResult(locale: Locale) {
  const steps = buildSteps(PACK, BANDS);
  const engine = Raw.of(toEngineAnswers(steps, preparedHousehold(steps)));
  const program = firstProgram();
  const verdict = verdicts(PACK, BANDS, engine).find((v) => v.programId === program.id)?.verdict ?? 'depends';
  return personalResult(translator(locale), locale, program, verdict, criterionReasons(PACK, BANDS, engine, program.id));
}

async function personal(kind: 'explain' | 'typed'): Promise<CaseResult> {
  const base = { id: kind === 'explain' ? 'your own result (en)' : 'typed question (en)', task: kind === 'explain' ? 'explain.personal' : 'ask.freeText', mode: 'ONLY_ON_DEVICE' as const };
  const started = performance.now();
  try {
    const result = kind === 'explain' ? await explainPersonal(syntheticResult('en')) : await askFreeText(Raw.of('What papers should I bring?'), syntheticResult('en'));
    return textResult(base, started, result);
  } catch (error) {
    return { ...base, ran: 'not-run', latencyMs: elapsed(started), ...failed(error) };
  }
}

/** The bundled sample, drawn as a picture of a page, for the photo task. */
async function renderedSample(): Promise<Blob> {
  const lines = sampleText.split('\n');
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 40 + lines.length * 22;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000000';
  g.font = '16px monospace';
  lines.forEach((line, i) => g.fillText(line, 20, 30 + i * 22));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not draw the sample'))), 'image/png'));
}

async function photo(): Promise<CaseResult> {
  const base = { id: 'photo of the sample (en)', task: 'document.photo.read', mode: 'ONLY_ON_DEVICE' as const };
  if ((await photoDeviceStatus('en')) !== 'available') {
    return { ...base, ran: 'not-run', latencyMs: null, outputCheck: null, note: 'skipped: the on-device model does not accept images here' };
  }
  const started = performance.now();
  try {
    const result = await readPhoto(Raw.of(await renderedSample()), 'paystub', 'en');
    return { ...base, ran: result.inferenceSource, latencyMs: elapsed(started), outputCheck: null, note: result.reason };
  } catch (error) {
    return { ...base, ran: 'not-run', latencyMs: elapsed(started), ...failed(error) };
  }
}

/** Every case, in order. Each one is reported as soon as it finishes. */
/** Every case, with the extraction cases run `repetitions` times (each recorded with its repetition). */
export function casesFor(repetitions: number): readonly (() => Promise<CaseResult>)[] {
  if (repetitions <= 1) return CASES;
  const extractions = Array.from({ length: repetitions }, (_, i) => EXTRACTION_CASES.map((c) => () => extraction(c, i + 1))).flat();
  return [...extractions, ...CASES.slice(EXTRACTION_CASES.length)];
}

export const CASES: readonly (() => Promise<CaseResult>)[] = [
  ...EXTRACTION_CASES.map((c) => () => extraction(c)),
  () => explanation('en'),
  () => explanation('es'),
  () => question('en', 'ask.chip.apply'),
  () => question('en', 'ask.chip.change'),
  () => question('es', 'ask.chip.apply'),
  () => question('es', 'ask.chip.change'),
  () => personal('explain'),
  () => personal('typed'),
  photo,
];

/** Where a case was finally answered, in a file of any version. */
export function finalRan(c: CaseResult, version: number): Ran {
  if (version >= 3) return c.ran;
  // Versions 1 and 2 recorded the first attempt in `ran`; version 2 added the final result.
  return c.final?.ran ?? c.ran;
}

/** Where a case's first attempt ran, in a file of any version. */
export function firstRan(c: CaseResult, version: number): Ran {
  if (version >= 3) return c.first?.ran ?? c.ran;
  return c.ran;
}

/** Fields right in the first answer of an extraction case, in a file of any version. */
export function firstFields(c: CaseResult, version: number): { correct: number; total: number } | undefined {
  return version >= 3 ? c.first?.fields : c.fields;
}

export interface Summary {
  /** Cases finally answered on this device. */
  readonly onDevice: number;
  /** Cases answered in the cloud after a failed on-device attempt. */
  readonly inCloudAfterDevice: number;
  /** Cases answered in the cloud with no on-device attempt (no model for them). */
  readonly inCloud: number;
  readonly notRun: number;
  readonly total: number;
  /** First attempts that ran on this device (whatever happened next). */
  readonly firstOnDevice: number;
  /** Extraction, first answer (the device's when it answered). */
  readonly fieldsCorrect: number;
  readonly fieldsTotal: number;
  /** Extraction, what the person ends up with after the checks and any retry (version 2 files and later). */
  readonly finalCorrect: number | null;
  /** Extraction cases repeated in the cloud after a failed or unreliable on-device answer. */
  readonly retriedInCloud: number;
  /** Extraction cases answered on this device with the deductions marked not read (version 3). */
  readonly deductionsNotRead: number;
  /** Extraction cases whose yearly-income inputs are all right in what the person ends up with (null: not recorded). */
  readonly incomeInputsCorrect: number | null;
  readonly extractionCases: number;
  /** Readings (extraction cases, with repetitions) by their yearly-income inputs; null in files without the split. */
  readonly income: { readonly allRight: number; readonly notFound: number; readonly wrong: number } | null;
  /** Readings in which any value reached the person wrong (not missing); null in files without it. This must be zero. */
  readonly wrongReachedPerson: number | null;
}

/** Cloud runs are counted as cloud runs, never as on-device ones; a case counts where it was finally answered. */
export function summarize(cases: readonly CaseResult[], version: number = RUN_FILE_VERSION): Summary {
  const fields = cases.flatMap((c) => {
    const f = firstFields(c, version);
    return f ? [f] : [];
  });
  const final = cases.map((c) => finalRan(c, version));
  const afterDevice = (c: CaseResult) => c.final?.retried === true && finalRan(c, version) === 'IN_CLOUD';
  return {
    onDevice: final.filter((r) => r === 'ON_DEVICE').length,
    inCloudAfterDevice: cases.filter(afterDevice).length,
    inCloud: cases.filter((c) => finalRan(c, version) === 'IN_CLOUD' && !afterDevice(c)).length,
    notRun: final.filter((r) => r === 'not-run').length,
    total: cases.length,
    firstOnDevice: cases.filter((c) => firstRan(c, version) === 'ON_DEVICE').length,
    fieldsCorrect: fields.reduce((a, f) => a + f.correct, 0),
    fieldsTotal: fields.reduce((a, f) => a + f.total, 0),
    finalCorrect: cases.some((c) => c.final) ? cases.reduce((a, c) => a + (c.final?.fields.correct ?? 0), 0) : null,
    retriedInCloud: cases.filter((c) => c.final?.retried).length,
    deductionsNotRead: cases.filter((c) => c.final?.deductionsNotRead).length,
    incomeInputsCorrect: cases.some((c) => c.final?.incomeInputsCorrect !== undefined) ? cases.filter((c) => c.final?.incomeInputsCorrect).length : null,
    extractionCases: cases.filter((c) => c.task === 'document.pointer.extract').length,
    income: cases.some((c) => c.final?.incomeInputs)
      ? {
          allRight: cases.filter((c) => c.final?.incomeInputs && c.final.incomeInputs.notFound.length === 0 && c.final.incomeInputs.wrong.length === 0).length,
          notFound: cases.filter((c) => c.final?.incomeInputs && c.final.incomeInputs.notFound.length > 0 && c.final.incomeInputs.wrong.length === 0).length,
          wrong: cases.filter((c) => c.final?.incomeInputs && c.final.incomeInputs.wrong.length > 0).length,
        }
      : null,
    wrongReachedPerson: cases.some((c) => c.final?.wrongFields) ? cases.filter((c) => (c.final?.wrongFields?.length ?? 0) > 0).length : null,
  };
}

/** Whether a parsed JSON value is a run file this page can show. */
export function isRunFile(value: unknown): value is RunFile {
  const v = value as Partial<RunFile> | null;
  // Versions 1 to 3 open alike; version 1 has no per-field diagnosis or final result, version 2 no parts.
  return v !== null && typeof v === 'object' && v.kind === RUN_FILE_KIND && Array.isArray(v.cases) && typeof v.date === 'string' && (v.version === 1 || v.version === 2 || v.version === 3);
}
