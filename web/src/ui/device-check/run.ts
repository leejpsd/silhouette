// The device check: a fixed set of synthetic cases run through Firebase AI Logic and the app's own task
// functions, recording where each one actually ran. It produces a run file (JSON) that can be kept as
// evidence and replayed by a browser without the on-device model. Synthetic inputs only.

import { Raw, asPublic } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { buildReview, type ReviewField } from '../../core/review';
import { tidyNamePointers } from '../../core/tidy';
import { criterionReasons, verdicts } from '../../core/rules';
import { askChip, explainProgram, extractPointers, planAskChip, planExplain, POINTER_SCHEMAS, type TaskResult } from '../../ai/tasks';
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
export const RUN_FILE_VERSION = 1;

export type Ran = 'ON_DEVICE' | 'IN_CLOUD' | 'not-run';

export interface CaseResult {
  readonly id: string;
  readonly task: string;
  /** The inference mode the app asked for (routing.json). */
  readonly mode: 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_ON_DEVICE';
  /** Where it actually ran, from the response; `not-run` when it failed or was skipped. */
  readonly ran: Ran;
  readonly latencyMs: number | null;
  /** For model text: whether the check on model text passed (null when there was no text to check). */
  readonly outputCheck: 'passed' | 'blocked' | null;
  /** For pointer extraction: fields equal to the gold answers. */
  readonly fields?: { readonly correct: number; readonly total: number } | undefined;
  readonly error?: string | undefined;
  readonly note?: string | undefined;
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

async function extraction(c: (typeof EXTRACTION_CASES)[number]): Promise<CaseResult> {
  const started = performance.now();
  const base = { id: c.id, task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE' as const };
  try {
    const { skeleton, map } = skeletonize(Raw.of(c.text), allowlistFor('en'), introducersFor('en'));
    const result = await extractPointers(skeleton, 'paystub', 'en');
    const pointers = tidyNamePointers(POINTER_SCHEMAS.paystub, result.value, map, introducersFor('en'));
    const review = buildReview(POINTER_SCHEMAS.paystub, pointers, skeleton, map);
    return { ...base, ran: result.inferenceSource, latencyMs: elapsed(started), outputCheck: null, fields: scoreFields(review, c.gold()), note: result.reason };
  } catch (error) {
    return { ...base, ran: 'not-run', latencyMs: elapsed(started), ...failed(error) };
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

export interface Summary {
  readonly onDevice: number;
  readonly inCloud: number;
  readonly notRun: number;
  readonly total: number;
  readonly fieldsCorrect: number;
  readonly fieldsTotal: number;
}

/** Cloud runs are counted as cloud runs, never as on-device ones. */
export function summarize(cases: readonly CaseResult[]): Summary {
  const fields = cases.flatMap((c) => (c.fields ? [c.fields] : []));
  return {
    onDevice: cases.filter((c) => c.ran === 'ON_DEVICE').length,
    inCloud: cases.filter((c) => c.ran === 'IN_CLOUD').length,
    notRun: cases.filter((c) => c.ran === 'not-run').length,
    total: cases.length,
    fieldsCorrect: fields.reduce((a, f) => a + f.correct, 0),
    fieldsTotal: fields.reduce((a, f) => a + f.total, 0),
  };
}

/** Whether a parsed JSON value is a run file this page can show. */
export function isRunFile(value: unknown): value is RunFile {
  const v = value as Partial<RunFile> | null;
  return v !== null && typeof v === 'object' && v.kind === RUN_FILE_KIND && Array.isArray(v.cases) && typeof v.date === 'string';
}
