// The only folder that imports firebase/ai. One function per task id in shared/routing.json.
// Every cloud-capable task (PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD) accepts CloudSafe
// input only, so a Raw value does not type-check (shared/DATA_TYPES.md). ONLY_ON_DEVICE tasks that
// take Raw input live in ./on-device.ts, the single ai/ file the routing check lets unwrap Raw.

import { InferenceMode, type HybridParams } from 'firebase/ai';
import { asPublic, type Generalized, type Public, type Skeleton } from '../core/types';
import type { GeneralizedProfile } from '../core/generalize';
import { ASK_WORDS, EXPLAIN_WORDS, explainRoute, parseListLines, parseStatusLines, safeSources, type ExplainLength, type ExplainRoute, type Source } from '../core/explain';
import type { PointerSchema } from '../core/skeleton';
import routing from '../../../shared/routing.json';
import { classifyError, TaskError, type TaskErrorKind } from './errors';
import { deviceAvailability, modelFor, sourceOf, type InferenceSource, type UsageMetadata } from './model-port';
import { SHARED_POINTER_SCHEMAS, pointerConfigFor, type DocType, type PointerConfig } from './pointer-config';
import { appConfig } from '../data/remote-config';
import { describeAiModel, describeAiRequests, expectRequestBody, permitCloudRequest } from '../data/net-monitor';
import { recordAnsweredOnDevice } from '../data/outbound';
import outputChecks from '../../../shared/prompts/output-checks.json';
import { modelTextIsBlocked, type OutputChecks, type OutputScope, type ShownVerdict } from '../core/output-check';
import { toModelSchema } from './model-schema';
import { deviceResponseConstraint, partFields, placeholderIds, type DevicePart } from './device-schema';
import { CURRENT_STATUS_V1, DISCOVER_V1, NEARBY_V1, READ_ALOUD_V1, askPromptFor, explainPromptFor, fill, type PromptTemplate } from './prompts';
import type { ModelResponse } from './model-port';

export { TaskError } from './errors';
export type { TaskErrorKind } from './errors';
export type { InferenceSource } from './model-port';
export type { DocType, PointerConfig } from './pointer-config';

/** Routing reason keys from shared/routing.json. */
export type RoutingReason =
  | 'photo-never-leaves'
  | 'document-silhouette-only'
  | 'short-text'
  | 'long-or-unsupported-locale'
  | 'prepared-question'
  | 'typed-text-may-be-personal'
  | 'needs-current-info'
  | 'needs-places'
  | 'speech'
  /** A PREFER_ON_DEVICE call failed on the device and was repeated in the cloud with the same cloud-safe input. */
  | 'on-device-failed'
  | 'your-result-stays-on-device'
  | 'sample-answer-key'
  /** routing.json recordedSample: the bundled sample read from an on-device run recording, nothing sent. */
  | 'recorded-on-device'
  /** routing.json recordedCloud: the bundled sample read from a recorded cloud reading of its silhouette, nothing sent now. */
  | 'recorded-in-cloud';

/** Every model response carries its provenance: where it ran, and why. */
export interface TaskResult<T> {
  readonly value: T;
  readonly inferenceSource: InferenceSource;
  readonly reason: RoutingReason;
  /** For explanations: the length and language that decided the route (shown in the reason chip). */
  readonly route?: ExplainRoute | undefined;
  /** A device-first call ran in the cloud because this device has no model, or has not downloaded it yet (shown in the reason chip). */
  readonly ranInCloudBecause?: CloudBecause | undefined;
}

/** Why a device-first call ran in the cloud: this browser has no on-device model, or has not downloaded it yet. */
export type CloudBecause = 'no-device-model' | 'model-not-downloaded';

/** The reason chip's detail for a device status other than "available". */
export const cloudBecause = (status: string): CloudBecause => (status === 'downloadable' || status === 'downloading' ? 'model-not-downloaded' : 'no-device-model');

/** Languages of Chrome's on-device model. Other languages fall back to the cloud. */
export const ON_DEVICE_LANGUAGES: ReadonlySet<string> = new Set(['en', 'es', 'ja', 'de', 'fr']);

/** The pointer configuration in effect: the bundled prompt version Remote Config names. */
export function activePointerConfig(): PointerConfig {
  return pointerConfigFor(appConfig().promptPointerExtractV);
}

/** Pointer schemas (x-kind annotated, for rehydration). Every bundled prompt version uses these. */
export const POINTER_SCHEMAS: Readonly<Record<DocType, PointerSchema>> = SHARED_POINTER_SCHEMAS;
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

const POINTER_TASK = routing.tasks['document.pointer.extract'];
/** What happens when a PREFER_ON_DEVICE call fails on the device. */
const ON_DEVICE_FAILURE = routing.onDeviceFailure;

export interface PointerCallOptions {
  readonly config?: PointerConfig;
  /**
   * Evaluation only: ONLY_IN_CLOUD instead of PREFER_ON_DEVICE (web/eval/, where no on-device
   * model exists). The input type rule is unchanged: still a Skeleton.
   */
  readonly forceCloud?: boolean;
  /**
   * The person chose to keep everything on this device: the device reads the silhouette and nothing
   * is sent, ever. There is no cloud retry (routing.json `onDeviceFailure` needs the person's
   * agreement to send); a failed or unreliable reading is reported instead.
   */
  readonly deviceOnly?: boolean;
  /**
   * The deterministic check of a pointer answer (core/pointer-check.ts): problems by field and check,
   * never values. An on-device answer with problems is a failed on-device attempt.
   */
  readonly validate?: ((pointers: Record<string, unknown>) => readonly string[]) | undefined;
  /** The silhouette, for the on-device response constraint (placeholder ids of this document only). */
  readonly skeleton?: Skeleton | undefined;
  /**
   * The checks of a two-part on-device reading (core/pointer-check.ts). `core` problems make the
   * attempt a failed on-device attempt; `deductions` problems only leave the deductions unread.
   */
  readonly checkParts?: {
    readonly core: (pointers: Record<string, unknown>) => readonly string[];
    readonly deductions: (pointers: Record<string, unknown>) => readonly string[];
    /**
     * Contradictions in fields that feed no rule (names sharing a placeholder; hours or rate on an
     * amount's placeholder): those fields are left out and marked not read; the reading is kept.
     */
    readonly notRead?: ((pointers: Record<string, unknown>) => { readonly problems: readonly string[]; readonly fields: readonly string[] }) | undefined;
    /** Year to date left out although the document has one place for it: the gross part is asked. */
    readonly ytdMissing?: ((pointers: Record<string, unknown>) => boolean) | undefined;
    /**
     * Values that feed no result and that no check confirms (hours and rate, net pay, a pay date that
     * contradicts the period), on the reading about to be used: they are left out and marked not read.
     */
    readonly confirm?: ((pointers: Record<string, unknown>) => { readonly problems: readonly string[]; readonly fields: readonly string[] }) | undefined;
  } | undefined;
  /** Where the reading is, for the screen that waits for it. */
  readonly onProgress?: ((stage: PointerStage) => void) | undefined;
  /** Internal: one part of a two-part on-device reading. */
  readonly part?: DevicePart | undefined;
  /** Internal: a reading prepared ahead stops before its next part once this returns true. */
  readonly isCancelled?: (() => boolean) | undefined;
}

/**
 * Stages of a pointer reading: reading on this device (one part or the other), checking the reading,
 * and sending the approved silhouette after the device could not read it reliably.
 */
export type PointerStage = 'device-reading' | 'device-gross' | 'device-deductions' | 'checking' | 'sending-after-device';

function systemText(config: PointerConfig, docType: DocType, part: DevicePart = 'whole'): string {
  const example = config.example?.[docType];
  const base = example ? `${config.prompt.system}\n\n${example}` : config.prompt.system;
  const parts = config.deviceParts;
  const added =
    part === 'whole' ? undefined : part === 'deductions-again' ? (parts?.deductionsAgain ? `${parts.deductions}\n${parts.deductionsAgain}` : parts?.deductions) : parts?.[part];
  return added ? `${base}\n\n${added}` : base;
}

/** Whether this document is read on the device in two parts with this configuration. */
function readsInParts(config: PointerConfig, docType: DocType): boolean {
  return config.deviceParts !== undefined && partFields(config.schemas[docType], 'deductions').length > 0;
}

/**
 * Hybrid parameters for document.pointer.extract. The document language is declared in
 * expectedInputs, so Chrome reports the on-device model unavailable for languages it does not
 * support (Korean) and the SDK falls back to the cloud with the same silhouette.
 */
export function pointerModelParams(docType: DocType, language: string, options: PointerCallOptions = {}): HybridParams {
  const config = options.config ?? activePointerConfig();
  const part = options.part ?? 'whole';
  const pointerSchema = config.schemas[docType] as unknown as Record<string, unknown>;
  const cloudSchema = toModelSchema(pointerSchema, config.schemaOptions);
  // On the device, the constraint is strict and references are limited to the placeholder ids this
  // silhouette contains, by kind (Chrome's Prompt API receives it as promptOptions.responseConstraint).
  const deviceSchema = options.skeleton
    ? deviceResponseConstraint(config.schemas[docType], config.schemaOptions, options.skeleton, part)
    : toModelSchema(pointerSchema, { ...config.schemaOptions, dialect: 'jsonschema' });
  const devicePart = part !== 'whole';
  const system = systemText(config, docType, part);
  // A part of a two-part reading runs only on this device; only the cloud-capable form is described.
  if (!devicePart) describeAiRequests(system, ['document-silhouette']);
  const generationConfig = pointerGenerationConfig(config, cloudSchema);
  return {
    mode: options.forceCloud ? InferenceMode.ONLY_IN_CLOUD : options.deviceOnly || devicePart ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: { model: config.cloudModel, systemInstruction: systemText(config, docType), generationConfig: generationConfig as never },
    onDeviceParams: {
      createOptions: {
        // The instructions are English and the document is in its own language.
        expectedInputs: [{ type: 'text', languages: [...new Set(['en', language])] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts: [{ role: 'system', content: system }],
        ...(config.device ?? {}),
      } as never,
      promptOptions: { responseConstraint: deviceSchema },
    },
  };
}

function pointerGenerationConfig(config: PointerConfig, cloudSchema: unknown): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    [config.schemaField]: cloudSchema,
    maxOutputTokens: config.maxOutputTokens,
  };
  if (config.temperature !== undefined) generationConfig['temperature'] = config.temperature;
  if (config.thinkingLevel) generationConfig['thinkingConfig'] = { thinkingLevel: config.thinkingLevel.toUpperCase() };
  return generationConfig;
}

/**
 * The reading request as it goes to the cloud (the body of generateContent, built as `requestBody`
 * builds every other request), shown beside the button that sends it before anything is sent. Its only
 * document content is the silhouette.
 */
export function pointerRequest(skeleton: Skeleton, docType: DocType): { readonly model: string; readonly body: string } {
  const config = activePointerConfig();
  const cloudSchema = toModelSchema(config.schemas[docType] as unknown as Record<string, unknown>, config.schemaOptions);
  return {
    model: config.cloudModel,
    body: requestBody({
      taskId: 'document.pointer.extract',
      mode: POINTER_TASK.mode as RoutingMode,
      reason: POINTER_TASK.reason as RoutingReason,
      model: config.cloudModel,
      systemInstruction: systemText(config, docType),
      prompt: fill(config.prompt.user, { docType, skeleton: presentSkeleton(skeleton, config) }),
      generationConfig: pointerGenerationConfig(config, cloudSchema),
      fields: ['document-silhouette'],
    }),
  };
}

export function pointerModel(docType: DocType, language: string, options: PointerCallOptions = {}) {
  const config = options.config ?? activePointerConfig();
  // One model per set of placeholder ids: the on-device constraint is built from them.
  const ids = options.skeleton && !options.forceCloud ? `:${Object.values(placeholderIds(options.skeleton)).flat().join(',')}` : '';
  const mode = options.forceCloud ? ':cloud' : options.deviceOnly ? ':device' : '';
  const part = options.part && options.part !== 'whole' && !options.forceCloud ? `:part-${options.part}` : '';
  const key = `document.pointer.extract:${config.id}:${docType}:${language}${mode}${part}${ids}`;
  return modelFor(key, () => pointerModelParams(docType, language, options));
}

/** The skeleton as the model sees it (optionally line-numbered). Still only placeholders. */
export function presentSkeleton(skeleton: Skeleton, config: PointerConfig): string {
  if (!config.lineNumbers) return skeleton;
  const lines = skeleton.split('\n');
  const width = String(lines.length).length < 2 ? 2 : String(lines.length).length;
  return lines.map((line, i) => `L${String(i + 1).padStart(width, '0')}: ${line}`).join('\n');
}

/** One request to the device: its text, what parsed, and what the checks found. */
export interface DevicePass {
  readonly part: DevicePart;
  /** The model's text: placeholder ids and field names only. */
  readonly rawText: string;
  readonly parsed: boolean;
  /** The parsed answer of this part (keys of the part only), when it parsed. */
  readonly value?: Record<string, unknown> | undefined;
  /** Problems found by the deterministic check of this part (or the error). */
  readonly problems: readonly string[];
  /** Problems that only left some fields out as not read (names, hours, rate), without failing the part. */
  readonly marked?: readonly string[] | undefined;
  /** Keys the device returned that the part does not have (ignored), and keys of the part it left out. */
  readonly extraKeys: readonly string[];
  readonly missingKeys: readonly string[];
  readonly latencyMs: number;
}

/** What the device answered, when it was asked: for the on-device check and its diagnosis. */
export interface DeviceAttempt {
  /** The model's text (of the core part, in a two-part reading): placeholder ids and field names only. */
  readonly rawText: string;
  readonly parsed: boolean;
  /** The parsed answer (core and deductions together, in a two-part reading), when it parsed. */
  readonly value?: Record<string, unknown> | undefined;
  /** Problems that made the attempt fail (the core's, in a two-part reading); empty when it was used. */
  readonly problems: readonly string[];
  /** A two-part reading: each request in order (the deductions part only when the core passed). */
  readonly passes?: readonly DevicePass[] | undefined;
  /** A two-part reading whose core was used but whose deductions did not hold up: they are left out. */
  readonly deductionsNotRead?: boolean | undefined;
  /** Fields left out of a reading used on this device, marked "not read on this device". */
  readonly notRead?: readonly string[] | undefined;
}

export interface PointerResult extends TaskResult<unknown> {
  readonly usage?: UsageMetadata | undefined;
  /** When the on-device attempt failed and the cloud answered: what the device reported. */
  readonly deviceError?: string | undefined;
  /** The on-device attempt, whether it was used or repeated in the cloud. */
  readonly deviceAttempt?: DeviceAttempt | undefined;
  /** Answered on this device without the deductions, which it could not read reliably. */
  readonly deductionsNotRead?: boolean | undefined;
  /** Fields this device could not read reliably and left out (deductions, names); none feeds a result. */
  readonly notRead?: readonly string[] | undefined;
}

/** Errors that come from the cloud side; repeating the call in the cloud would not help. */
const CLOUD_FAILURES: ReadonlySet<TaskErrorKind> = new Set(['app-check', 'permission', 'api-not-enabled', 'quota', 'quota-daily', 'network', 'server']);

async function callPointerModel(
  skeleton: Skeleton,
  docType: DocType,
  language: string,
  options: PointerCallOptions,
): Promise<{ value: Record<string, unknown>; source: InferenceSource; usage: UsageMetadata | undefined; rawText: string }> {
  const config = options.config ?? activePointerConfig();
  const model = await pointerModel(docType, language, { ...options, skeleton });
  const prompt = fill(config.prompt.user, { docType, skeleton: presentSkeleton(skeleton, config) });
  // The network monitor lets a request to Firebase AI Logic leave only while a cloud-capable task has
  // asked for it: this one, while it waits for its answer. When the person keeps everything on the
  // device, or for a part of a two-part reading (only on this device), nothing is permitted, so the
  // monitor blocks any request the SDK might still make.
  const deviceOnly = options.deviceOnly || (options.part !== undefined && options.part !== 'whole');
  const release = deviceOnly ? () => undefined : permitCloudRequest(systemText(config, docType));
  let response: ModelResponse;
  try {
    ({ response } = await model.generateContent(prompt));
  } finally {
    release();
  }
  const source = sourceOf(response, 'IN_CLOUD');
  const text = response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The output holds placeholder ids only (never document values), so a snippet is safe to keep.
    throw Object.assign(new TaskError('bad-output', `model output is not JSON (${text.length} chars): ${text.slice(0, 160)}`), { source, rawText: text });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new TaskError('bad-output', 'model output is not a JSON object'), { source, rawText: text });
  }
  const cleaned = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
  return { value: cleaned, source, usage: response.usageMetadata, rawText: text };
}

const elapsedSince = (start: number) => Math.round(performance.now() - start);

/** One part of a two-part on-device reading, never thrown: a pass that did not parse has problems. */
async function devicePass(skeleton: Skeleton, docType: DocType, language: string, options: PointerCallOptions, part: Exclude<DevicePart, 'whole'>): Promise<DevicePass> {
  // A reading prepared ahead that was cancelled asks the device for nothing more.
  if (options.isCancelled?.()) throw new ReadingCancelled('the reading prepared ahead was cancelled');
  const config = options.config ?? activePointerConfig();
  const fields = partFields(config.schemas[docType], part);
  const started = performance.now();
  let rawText = '';
  let value: Record<string, unknown> | undefined;
  let problems: string[] = [];
  let returned: string[] = [];
  try {
    const r = await callPointerModel(skeleton, docType, language, { ...options, part, deviceOnly: false, forceCloud: false });
    rawText = r.rawText;
    returned = Object.keys(JSON.parse(r.rawText) as Record<string, unknown>);
    // Keys the part does not have are ignored (and recorded); the constraint should rule them out.
    value = Object.fromEntries(Object.entries(r.value).filter(([k]) => fields.includes(k)));
  } catch (error) {
    rawText = (error as { rawText?: string }).rawText ?? '';
    problems = [rawText ? 'not-json' : `error:${classifyError(error).kind}`];
  }
  return {
    part,
    rawText,
    parsed: value !== undefined,
    value,
    problems,
    extraKeys: returned.filter((k) => !fields.includes(k)),
    missingKeys: value === undefined ? [] : fields.filter((k) => !returned.includes(k)),
    latencyMs: elapsedSince(started),
  };
}

// ---------- Reading ahead on the device ----------
//
// The first request after the page loads makes Chrome load the model into memory, and the whole
// reading takes several requests. Firebase AI Logic has no way to load the model without a prompt, so
// while the person looks at the silhouette the preview screen starts the whole on-device reading
// itself (every part: core, gross when needed, deductions, deductions asked again; ONLY_ON_DEVICE, the
// same task, routing and checks as after "Send" or "Keep everything on this device").
// - Only when the device model is available. Nothing is sent and nothing is stored: the reading is held
//   in memory for this exact silhouette and used once, by the reading that follows.
// - "Send" or "Keep" while it is still running continues from where it is; the status line follows it.
// - A changed silhouette, leaving the screen, choosing to type the numbers or "Delete everything"
//   cancels it: no further part is asked (a part already running on the device finishes and is dropped).
// - It is recorded only as part of the reading that uses it.

type ReadOutcome = Awaited<ReturnType<typeof readInParts>>;

interface PreparedReading {
  readonly key: string;
  /** The step running now, for a reading that joins it. */
  stage: PointerStage | null;
  readonly listeners: Set<(stage: PointerStage) => void>;
  cancelled: boolean;
  readonly result: Promise<ReadOutcome | null>;
}

/** The one reading prepared ahead (the latest silhouette only), until a reading takes it. */
let preparedReading: PreparedReading | null = null;
const preparedKey = (skeleton: Skeleton, docType: DocType, language: string, config: PointerConfig) => `${config.id}|${docType}|${language}|${skeleton}`;

class ReadingCancelled extends Error {}

/**
 * Starts the whole on-device reading of this silhouette ahead of time, when the device model is
 * available and the document is read in parts. `options.checkParts` must be the checks the reading that
 * follows uses. Resolves true when a reading was prepared (or is being prepared); never rejects.
 */
export async function prepareDeviceReading(skeleton: Skeleton, docType: DocType, language: string, options: PointerCallOptions = {}): Promise<boolean> {
  const config = options.config ?? activePointerConfig();
  if (!readsInParts(config, docType)) return false;
  const key = preparedKey(skeleton, docType, language, config);
  if (preparedReading?.key === key) return preparedReading.result.then((r) => r !== null);
  cancelPreparedReading();
  const createOptions = pointerModelParams(docType, language, { ...options, skeleton, part: 'core' }).onDeviceParams?.createOptions;
  if ((await deviceAvailability(createOptions)) !== 'available') return false;
  if (preparedReading?.key === key) return preparedReading.result.then((r) => r !== null);
  cancelPreparedReading();
  const listeners = new Set<(stage: PointerStage) => void>();
  const run: PreparedReading = {
    key,
    stage: null,
    listeners,
    cancelled: false,
    result: Promise.resolve(null),
  };
  const result = readInParts(skeleton, docType, language, {
    ...options,
    skeleton,
    onProgress: (stage) => {
      run.stage = stage;
      for (const l of listeners) l(stage);
    },
    isCancelled: () => run.cancelled,
  }).catch((error: unknown) => {
    if (error instanceof ReadingCancelled) return null;
    throw error;
  });
  (run as { result: Promise<ReadOutcome | null> }).result = result;
  preparedReading = run;
  return result.then(
    (r) => r !== null,
    () => false,
  );
}

/** Cancels the reading prepared ahead, if no reading has taken it: no further part is asked. */
export function cancelPreparedReading(): void {
  if (preparedReading) preparedReading.cancelled = true;
  preparedReading = null;
}

/** The reading prepared ahead for exactly this silhouette, once. */
function takePrepared(key: string): PreparedReading | undefined {
  if (preparedReading?.key !== key || preparedReading.cancelled) return undefined;
  const run = preparedReading;
  preparedReading = null;
  return run;
}

/** Drops anything read ahead (after "Delete everything", or when the document is closed). */
export function dropPreparedReadings(): void {
  cancelPreparedReading();
}

/** Joins a reading prepared ahead: reports its current step and the ones that follow, then its outcome. */
async function joinPrepared(run: PreparedReading, onProgress: ((stage: PointerStage) => void) | undefined): Promise<ReadOutcome | null> {
  const listener = (stage: PointerStage) => onProgress?.(stage);
  if (onProgress) {
    onProgress(run.stage ?? 'device-reading');
    run.listeners.add(listener);
  }
  try {
    return await run.result;
  } catch {
    return null;
  } finally {
    run.listeners.delete(listener);
  }
}

/** Core problems that concern only gross pay and year to date (the gross part may answer them again). */
const isGrossProblem = (p: string) => /^(grossPay|ytdGross):/.test(p) || p === 'check:ytd-gross' || p === 'check:ytd-periods';

/**
 * A paystub on a device with a ready model, read in parts, every answer checked by deterministic code:
 * 1. the core fields. When the core's only problems are with gross pay or year to date, or when it left
 *    year to date out although the document has one place for it, the device is asked again for those
 *    two only (the gross part); its answer is used only if the whole core then passes. A year to date
 *    still missing stays "not found": missing is not a failure, and code never fills it in;
 * 2. contradictions in fields that feed no rule (names sharing a placeholder; hours or rate on an
 *    amount's placeholder) leave those fields out, marked not read;
 * 3. the deductions, checked against the core. When they do not add up, they are asked once more with
 *    one value-free sentence; if they still fail, they are left out, marked not read.
 * Returns the answer, or the failed attempt when the core does not hold up.
 */
async function readInParts(
  skeleton: Skeleton,
  docType: DocType,
  language: string,
  options: PointerCallOptions,
): Promise<{ ok: true; value: Record<string, unknown>; attempt: DeviceAttempt } | { ok: false; attempt: DeviceAttempt }> {
  const config = options.config ?? activePointerConfig();
  const checkCore = (v: Record<string, unknown>) => [...(options.checkParts?.core(v) ?? [])];
  options.onProgress?.('device-reading');
  const core0 = await devicePass(skeleton, docType, language, options, 'core');
  options.onProgress?.('checking');
  let core: DevicePass = core0.value ? { ...core0, problems: checkCore(core0.value) } : core0;
  const passes: DevicePass[] = [core];
  const canAskGross = config.deviceParts?.gross !== undefined;
  const grossFailed = core.value !== undefined && core.problems.length > 0 && core.problems.every(isGrossProblem);
  const ytdMissing = core.value !== undefined && core.problems.length === 0 && (options.checkParts?.ytdMissing?.(core.value) ?? false);
  if (canAskGross && core.value && (grossFailed || ytdMissing)) {
    options.onProgress?.('device-gross');
    const gross0 = await devicePass(skeleton, docType, language, options, 'gross');
    options.onProgress?.('checking');
    // The gross part's answer replaces gross pay and year to date; the whole core is checked again.
    const merged = gross0.value ? { ...core.value, ...gross0.value } : undefined;
    const answered = merged !== undefined && merged['ytdGross'] !== undefined;
    const problems = merged ? checkCore(merged) : gross0.problems;
    const gross: DevicePass = { ...gross0, problems: ytdMissing && !answered && problems.length === 0 ? ['ytdGross:still-missing'] : problems };
    passes.push(gross);
    if (merged && problems.length === 0 && (grossFailed || answered)) core = { ...core, value: merged, problems: [] };
  }
  if (!core.value || core.problems.length > 0) {
    const last = passes[passes.length - 1] as DevicePass;
    return { ok: false, attempt: { rawText: core0.rawText, parsed: core0.parsed, value: core0.value, problems: last.problems, passes } };
  }
  // Contradictions in fields that feed no rule: those fields are left out, the reading is kept.
  const contradictions = options.checkParts?.notRead?.(core.value) ?? { problems: [], fields: [] };
  const notRead: string[] = [...contradictions.fields];
  const coreValue = Object.fromEntries(Object.entries(core.value).filter(([k]) => !notRead.includes(k)));
  if (contradictions.problems.length > 0) passes[0] = { ...(passes[0] as DevicePass), marked: [...contradictions.problems] };

  const readDeductions = async (part: 'deductions' | 'deductions-again') => {
    options.onProgress?.('device-deductions');
    const pass = await devicePass(skeleton, docType, language, options, part);
    options.onProgress?.('checking');
    const merged = pass.value ? { ...coreValue, ...pass.value } : coreValue;
    const checked: DevicePass = pass.value ? { ...pass, problems: [...(options.checkParts?.deductions(merged) ?? [])] } : pass;
    passes.push(checked);
    return { pass: checked, merged };
  };
  let ded = await readDeductions('deductions');
  // A list that does not add up is asked once more, saying so (no values); then it is left out.
  if (ded.pass.value && ded.pass.problems.includes('check:net-sum') && config.deviceParts?.deductionsAgain !== undefined) {
    ded = await readDeductions('deductions-again');
  }
  // Deductions feed no result: when they do not hold up, the core is used and they are marked not read.
  const deductionsNotRead = !ded.pass.value || ded.pass.problems.length > 0;
  if (deductionsNotRead) notRead.push('deductions');
  const read = deductionsNotRead ? coreValue : ded.merged;
  // Shown only when confirmed: values that feed no result and that no check confirms are left out.
  const unconfirmed = options.checkParts?.confirm?.(read) ?? { problems: [], fields: [] };
  const value = Object.fromEntries(Object.entries(read).filter(([k]) => !unconfirmed.fields.includes(k)));
  notRead.push(...unconfirmed.fields);
  if (unconfirmed.problems.length > 0) {
    const first = passes[0] as DevicePass;
    passes[0] = { ...first, marked: [...(first.marked ?? []), ...unconfirmed.problems] };
  }
  return { ok: true, value, attempt: { rawText: core0.rawText, parsed: true, value, problems: [], passes, deductionsNotRead, notRead } };
}

/** True when a failed PREFER_ON_DEVICE call failed on the device, not in the cloud. */
function failedOnDevice(error: unknown): boolean {
  if ((error as { source?: unknown }).source === 'ON_DEVICE') return true;
  if ((error as { source?: unknown }).source === 'IN_CLOUD') return false;
  const e = classifyError(error);
  return e.status === undefined && !CLOUD_FAILURES.has(e.kind);
}

/**
 * Task `document.pointer.extract`: PREFER_ON_DEVICE, input Skeleton, reason
 * `document-silhouette-only`. Returns the model's pointer JSON (untrusted) for rehydrate().
 * Null values ("not in the document") are removed before returning.
 *
 * When the call fails on the device (for example "The input is too large"), it is repeated as
 * routing.json `onDeviceFailure` says (once, ONLY_IN_CLOUD) and the result carries its reason. This is safe only because
 * the input is a Skeleton; tasks with Raw input never fall back to the cloud.
 */
export async function extractPointers(
  skeleton: Skeleton,
  docType: DocType,
  language: string,
  options: PointerCallOptions = {},
): Promise<PointerResult> {
  if (POINTER_TASK.mode !== 'PREFER_ON_DEVICE') throw new Error('routing.json changed: document.pointer.extract mode');
  if (
    ON_DEVICE_FAILURE.appliesTo !== POINTER_TASK.mode ||
    ON_DEVICE_FAILURE.retry !== 'ONLY_IN_CLOUD' ||
    ON_DEVICE_FAILURE.times !== 1
  ) {
    throw new Error('routing.json changed: onDeviceFailure');
  }
  const reason = POINTER_TASK.reason as RoutingReason;
  const config = options.config ?? activePointerConfig();
  const createOptions = pointerModelParams(docType, language, options).onDeviceParams?.createOptions;
  const deviceState = options.forceCloud ? 'unavailable' : await deviceAvailability(createOptions);
  const available = deviceState === 'available';
  if (options.deviceOnly && !available) throw new TaskError('on-device-unavailable', 'the on-device model is not available');
  // On a device with a ready model, a paystub is read in two parts (core, then deductions). Only a
  // core that fails its check is a failed on-device attempt; the cloud retry stays one single pass.
  if (available && readsInParts(config, docType)) {
    // A reading prepared ahead for this exact silhouette continues from where it is.
    const ahead = takePrepared(preparedKey(skeleton, docType, language, config));
    const joined = ahead ? await joinPrepared(ahead, options.onProgress) : null;
    const read = joined ?? (await readInParts(skeleton, docType, language, { ...options, skeleton }));
    if (read.ok) {
      recordAnsweredOnDevice('document');
      return { value: read.value, inferenceSource: 'ON_DEVICE', reason, deviceAttempt: read.attempt, deductionsNotRead: read.attempt.deductionsNotRead, notRead: read.attempt.notRead };
    }
    const deviceAttempt = read.attempt;
    if (options.deviceOnly) {
      throw Object.assign(new TaskError('on-device-unreliable', `the device could not read the silhouette reliably: ${deviceAttempt.problems.join(', ')}`), { deviceAttempt });
    }
    options.onProgress?.('sending-after-device');
    try {
      const r = await callPointerModel(skeleton, docType, language, { ...options, forceCloud: true });
      return { value: r.value, inferenceSource: r.source, reason: ON_DEVICE_FAILURE.reason as RoutingReason, usage: r.usage, deviceError: deviceAttempt.problems.join(', '), deviceAttempt };
    } catch (cloudError) {
      throw Object.assign(classifyError(cloudError), { deviceAttempt });
    }
  }
  if (available) options.onProgress?.('device-reading');
  try {
    const r = await callPointerModel(skeleton, docType, language, options);
    // An on-device answer that fails the deterministic check is a failed on-device attempt.
    const problems = r.source === 'ON_DEVICE' && options.validate ? options.validate(r.value) : [];
    if (problems.length > 0) {
      throw Object.assign(new TaskError('bad-output', `the on-device answer failed the checks: ${problems.join(', ')}`), {
        source: 'ON_DEVICE',
        rawText: r.rawText,
        parsedValue: r.value,
        problems,
      });
    }
    // Device-first, but answered in the cloud because this device has no model: the chip says so.
    const noModel = !options.forceCloud && r.source === 'IN_CLOUD' && !available;
    // Answered on this device: recorded as kept, never as sent.
    if (r.source === 'ON_DEVICE') recordAnsweredOnDevice('document');
    return {
      value: r.value,
      inferenceSource: r.source,
      reason,
      usage: r.usage,
      ranInCloudBecause: noModel ? cloudBecause(deviceState) : undefined,
      deviceAttempt: r.source === 'ON_DEVICE' ? { rawText: r.rawText, parsed: true, value: r.value, problems: [] } : undefined,
    };
  } catch (error) {
    if (options.forceCloud || !failedOnDevice(error)) throw classifyError(error);
    const e = error as { rawText?: string; parsedValue?: Record<string, unknown>; problems?: string[] };
    const deviceAttempt: DeviceAttempt = {
      rawText: e.rawText ?? '',
      parsed: e.parsedValue !== undefined,
      value: e.parsedValue,
      problems: e.problems ?? [classifyError(error).detail],
    };
    // Kept on the device by the person's choice: no retry anywhere; the app says it could not read it reliably.
    if (options.deviceOnly) {
      throw Object.assign(new TaskError('on-device-unreliable', `the device could not read the silhouette reliably: ${deviceAttempt.problems.join(', ')}`), { deviceAttempt });
    }
    const deviceError = classifyError(error).detail;
    options.onProgress?.('sending-after-device');
    try {
      const r = await callPointerModel(skeleton, docType, language, { ...options, forceCloud: true });
      return { value: r.value, inferenceSource: r.source, reason: ON_DEVICE_FAILURE.reason as RoutingReason, usage: r.usage, deviceError, deviceAttempt };
    } catch (cloudError) {
      throw Object.assign(classifyError(cloudError), { deviceAttempt });
    }
  }
}


// ---------- Explanations and questions ----------

/** A program's public information from the rule pack and its copy, in the answer language. */
export type ProgramFacts = {
  readonly programId: string;
  readonly name: string;
  /** `{programFacts}`, built as shared/rulepacks/SPEC.md section 2.1 says: one item per line. */
  readonly facts: string;
};

/** A prepared question chip. Static app content. */
export type QuestionChip = { readonly id: string; readonly question: string };

/**
 * What the general explanation and prepared questions are given (shared/prompts/explain.v5.md,
 * ask.v4.md): the program's public information and the answer language. Nothing about the person:
 * routing.json types these tasks as `Public` only, so a `Generalized` profile or verdict (or anything
 * Raw) does not type-check here.
 */
export type ExplainInput = Public<{
  readonly program: ProgramFacts;
  /** Answer language code (en, es, ko). */
  readonly locale: string;
}>;

const answerBrand: unique symbol = Symbol('model-answer');

/**
 * The text of a general explanation or a prepared-question answer. Only explainProgram() and
 * askChip() create one, and both take CloudSafe input only, so readAloud() can send it to the cloud.
 * Answers about the person's own result (on-device tasks) are plain strings and cannot be read aloud.
 */
export type ModelAnswer = { readonly text: string; readonly [answerBrand]: true };

const modelAnswer = (text: string): ModelAnswer => ({ text: text.trim(), [answerBrand]: true });

const LANGUAGE_NAMES: Readonly<Record<string, string>> = { en: 'English', es: 'Spanish', ko: 'Korean', ja: 'Japanese', de: 'German', fr: 'French' };
export const languageName = (locale: string): string => LANGUAGE_NAMES[locale] ?? 'English';

const MODES = {
  ONLY_ON_DEVICE: InferenceMode.ONLY_ON_DEVICE,
  PREFER_ON_DEVICE: InferenceMode.PREFER_ON_DEVICE,
  PREFER_IN_CLOUD: InferenceMode.PREFER_IN_CLOUD,
  ONLY_IN_CLOUD: InferenceMode.ONLY_IN_CLOUD,
} as const;
type RoutingMode = keyof typeof MODES;

/** Placeholder values of explain.v5 and ask.v4: the program's name and information, the question. */
export function explainValues(input: ExplainInput, maxWords: number, question?: Public<string>): Record<string, string> {
  const values: Record<string, string> = {
    programName: input.program.name,
    programFacts: input.program.facts,
    maxWords: String(maxWords),
  };
  if (question !== undefined) values['question'] = question;
  return values;
}

/** Everything that fixes one model call: shown in the "Leaving your device" step before it is made. */
export interface PlannedCall {
  readonly taskId: string;
  readonly mode: RoutingMode;
  readonly reason: RoutingReason;
  readonly model: string;
  readonly systemInstruction: string;
  readonly prompt: string;
  readonly generationConfig: Readonly<Record<string, unknown>>;
  readonly tools?: readonly Record<string, unknown>[] | undefined;
  readonly toolConfig?: Readonly<Record<string, unknown>> | undefined;
  readonly route?: ExplainRoute | undefined;
  /** The answer language: it selects the list of the check on model text (OUTPUT_CHECKS.md). */
  readonly locale?: string | undefined;
  /** What the request carries, for the record of outgoing requests (never values). */
  readonly fields: readonly string[];
  /** Model output checks (shared/prompts/OUTPUT_CHECKS.md) for tasks that show text about a program. */
  readonly checks?: OutputScope | undefined;
  /** The on-device createOptions, for the availability check that explains where a call ran. */
  readonly deviceOptions?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The request body exactly as Firebase AI Logic serializes it for the cloud (generateContent:
 * generationConfig, safetySettings, tools, toolConfig, systemInstruction, contents, in that order).
 * This string is shown before sending, registered with the network monitor, and is the body sent.
 */
export function requestBody(call: PlannedCall): string {
  const body: Record<string, unknown> = { generationConfig: call.generationConfig, safetySettings: [] };
  if (call.tools) body['tools'] = call.tools;
  if (call.toolConfig) body['toolConfig'] = call.toolConfig;
  if (call.systemInstruction !== '') body['systemInstruction'] = { role: 'system', parts: [{ text: call.systemInstruction }] };
  body['contents'] = [{ role: 'user', parts: [{ text: call.prompt }] }];
  return JSON.stringify(body);
}

function taskOf(taskId: keyof typeof routing.tasks): { mode: RoutingMode; reason: RoutingReason } {
  const task = routing.tasks[taskId] as { mode: string; reason?: string };
  if (!(task.mode in MODES) || task.reason === undefined) throw new Error(`routing.json: ${taskId} has no model mode`);
  return { mode: task.mode as RoutingMode, reason: task.reason as RoutingReason };
}

function textCall(
  taskId: 'explain.short' | 'explain.long' | 'ask.chip',
  prompt: PromptTemplate,
  values: Record<string, string>,
  locale: string,
  maxWords: number,
  route?: ExplainRoute,
): PlannedCall {
  const { mode, reason } = taskOf(taskId);
  const systemInstruction = fill(prompt.system, { locale: languageName(locale) });
  return {
    taskId,
    mode,
    reason,
    model: CLOUD_MODEL,
    systemInstruction,
    prompt: fill(prompt.user, values),
    // Room for the words asked for, in any of the app's languages.
    generationConfig: { maxOutputTokens: Math.max(256, maxWords * 4) },
    route,
    locale,
    fields: taskId === 'ask.chip' ? ['program-facts', 'prepared-question'] : ['program-facts'],
    checks: 'general',
    deviceOptions: {
      expectedInputs: [{ type: 'text', languages: ['en', locale] }],
      expectedOutputs: [{ type: 'text', languages: [locale] }],
    },
  };
}

/** explain.short or explain.long, by the requested length and the language (Remote Config values). */
export function planExplain(input: ExplainInput, length: ExplainLength): PlannedCall {
  const config = appConfig();
  const route = explainRoute({
    words: EXPLAIN_WORDS[length],
    locale: input.locale,
    maxShortWords: config.routeShortTextMaxWords,
    onDeviceLocales: config.onDeviceLocales,
  });
  const prompt = explainPromptFor(config.promptExplainV);
  return textCall(route.task, prompt, explainValues(input, route.words), input.locale, route.words, route);
}

export function planAskChip(input: ExplainInput, chip: Public<QuestionChip>): PlannedCall {
  const prompt = askPromptFor(appConfig().promptAskV);
  return textCall('ask.chip', prompt, explainValues(input, ASK_WORDS, asPublic(chip.question)), input.locale, ASK_WORDS);
}

function hybridParams(call: PlannedCall, forceCloud: boolean): HybridParams {
  if (call.systemInstruction !== '') describeAiRequests(call.systemInstruction, call.fields);
  else describeAiModel(call.model, call.fields);
  const mode = forceCloud ? InferenceMode.ONLY_IN_CLOUD : MODES[call.mode];
  const inCloudParams: Record<string, unknown> = { model: call.model, generationConfig: call.generationConfig };
  if (call.systemInstruction !== '') inCloudParams['systemInstruction'] = call.systemInstruction;
  if (call.tools) inCloudParams['tools'] = call.tools;
  if (call.toolConfig) inCloudParams['toolConfig'] = call.toolConfig;
  const params: Record<string, unknown> = { mode, inCloudParams };
  if (!forceCloud && call.mode !== 'ONLY_IN_CLOUD' && call.deviceOptions) {
    params['onDeviceParams'] = {
      createOptions: { ...call.deviceOptions, initialPrompts: [{ role: 'system', content: call.systemInstruction }] },
    };
  }
  return params as unknown as HybridParams;
}

/** Options of one run: an abort signal for "Cancel". */
export interface RunOptions {
  readonly signal?: AbortSignal | undefined;
}

/** Thrown when a request was cancelled; the late reply, if any, is never shown. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new TaskError('cancelled', 'cancelled by the person');
}

async function runCall(call: PlannedCall, forceCloud: boolean, options: RunOptions): Promise<{ response: ModelResponse; source: InferenceSource }> {
  const key = `${call.taskId}:${forceCloud ? 'cloud' : call.mode}:${call.systemInstruction}`;
  const model = await modelFor(key, () => hybridParams(call, forceCloud));
  throwIfAborted(options.signal);
  // What is shown is what is sent: the network monitor sends exactly these bytes for this request.
  const release = expectRequestBody(requestBody(call));
  try {
    const { response } = await model.generateContent(call.prompt, options.signal ? { signal: options.signal } : undefined);
    throwIfAborted(options.signal);
    return { response, source: sourceOf(response, call.mode === 'ONLY_IN_CLOUD' || forceCloud ? 'IN_CLOUD' : 'ON_DEVICE') };
  } catch (error) {
    throwIfAborted(options.signal);
    throw error;
  } finally {
    release();
  }
}

const OUTPUT_CHECKS = outputChecks as unknown as OutputChecks;

/** Why a device-first call ran in the cloud when the device had no model to try. */
async function noDeviceModel(call: PlannedCall, source: InferenceSource): Promise<CloudBecause | undefined> {
  if (source !== 'IN_CLOUD' || call.mode !== 'PREFER_ON_DEVICE' || !call.deviceOptions) return undefined;
  const status = await deviceAvailability(call.deviceOptions);
  return status === 'available' ? undefined : cloudBecause(status);
}

/**
 * Runs a planned text call. A PREFER_ON_DEVICE call that fails on the device is repeated once with
 * ONLY_IN_CLOUD (routing.json onDeviceFailure); its input is CloudSafe, so nothing new is sent.
 * A reply that states a result is asked for once more, then refused (OUTPUT_CHECKS.md).
 */
async function runText(call: PlannedCall, options: RunOptions): Promise<TaskResult<ModelAnswer>> {
  const once = async (): Promise<TaskResult<ModelAnswer>> => {
    try {
      const { response, source } = await runCall(call, false, options);
      const detail = await noDeviceModel(call, source);
      return { value: modelAnswer(response.text()), inferenceSource: source, reason: call.reason, route: call.route, ranInCloudBecause: detail };
    } catch (error) {
      if (error instanceof TaskError && error.kind === 'cancelled') throw error;
      if (call.mode !== ON_DEVICE_FAILURE.appliesTo || !failedOnDevice(error)) throw classifyError(error);
      try {
        const { response, source } = await runCall(call, true, options);
        return { value: modelAnswer(response.text()), inferenceSource: source, reason: ON_DEVICE_FAILURE.reason as RoutingReason, route: call.route };
      } catch (cloudError) {
        throw classifyError(cloudError);
      }
    }
  };
  const result = await checked(once, call.checks ?? 'general', call.locale ?? 'en', (r) => r.value.text);
  // Answered on this device: recorded as kept, never as sent.
  if (result.inferenceSource === 'ON_DEVICE') recordAnsweredOnDevice(call.taskId === 'ask.chip' ? 'ask' : 'about');
  return result;
}

/** Shows a model's text only when it passes the checks: one retry, then TaskError('blocked'). */
export async function checked<T>(run: () => Promise<T>, scope: OutputScope, locale: string, text: (result: T) => string, verdict?: ShownVerdict): Promise<T> {
  const first = await run();
  if (!modelTextIsBlocked(text(first), locale, scope, OUTPUT_CHECKS, verdict)) return first;
  const second = await run();
  if (!modelTextIsBlocked(text(second), locale, scope, OUTPUT_CHECKS, verdict)) return second;
  throw new TaskError('blocked', 'the reply stated a result twice');
}

/**
 * Tasks `explain.short` (PREFER_ON_DEVICE, reason `short-text`) and `explain.long` (PREFER_IN_CLOUD,
 * reason `long-or-unsupported-locale`): explains the program in general, never the person's result.
 * Pass the plan that was shown to the person.
 */
export function explainProgram(call: PlannedCall, options: RunOptions = {}): Promise<TaskResult<ModelAnswer>> {
  if (call.taskId !== 'explain.short' && call.taskId !== 'explain.long') throw new Error('not an explanation call');
  return runText(call, options);
}

/** Task `ask.chip`: PREFER_ON_DEVICE, reason `prepared-question`. Pass a plan from planAskChip(). */
export function askChip(call: PlannedCall, options: RunOptions = {}): Promise<TaskResult<ModelAnswer>> {
  if (call.taskId !== 'ask.chip') throw new Error('not a prepared-question call');
  return runText(call, options);
}

// ---------- Grounded tasks (cloud only, behind Remote Config flags) ----------

export interface SearchGrounding {
  readonly sources: readonly Source[];
  /** Google Search Suggestions, to be shown exactly as given. */
  readonly searchEntryPoint?: string | undefined;
}

function searchGrounding(response: ModelResponse): SearchGrounding {
  const meta = response.candidates?.[0]?.groundingMetadata;
  const sources = safeSources((meta?.groundingChunks ?? []).flatMap((c) => (c.web ? [c.web] : [])));
  const html = meta?.searchEntryPoint?.renderedContent;
  return { sources, searchEntryPoint: typeof html === 'string' && html.trim() !== '' ? html : undefined };
}

async function runGrounded(call: PlannedCall, options: RunOptions): Promise<{ response: ModelResponse; source: InferenceSource }> {
  try {
    return await runCall(call, false, options);
  } catch (error) {
    throw classifyError(error);
  }
}

/** A program of the rule pack as sent to the status search: id and name only. */
export type ProgramName = { readonly id: string; readonly name: string };

export interface StatusInput {
  /** Every program of the pack, always all of them, so the request says nothing about the person. */
  readonly programs: Public<readonly ProgramName[]>;
  readonly jurisdiction: Public<string>;
  readonly year: Public<number>;
  /** When the rules were last checked (pack verifiedOn), or "the start of {year}". */
  readonly checkedOn: Public<string>;
  readonly locale: string;
}

export function planCurrentStatus(input: StatusInput): PlannedCall {
  const { mode, reason } = taskOf('program.currentStatus');
  return {
    taskId: 'program.currentStatus',
    mode,
    reason,
    model: CLOUD_MODEL,
    systemInstruction: fill(CURRENT_STATUS_V1.system, { locale: languageName(input.locale), checkedOn: input.checkedOn }),
    prompt: fill(CURRENT_STATUS_V1.user, {
      jurisdiction: input.jurisdiction,
      year: String(input.year),
      programList: input.programs.map((p) => `[${p.id}] ${p.name}`).join('\n'),
    }),
    generationConfig: { maxOutputTokens: 1024 },
    tools: [{ googleSearch: {} }],
    fields: ['program-names'],
  };
}

export interface CurrentStatus {
  /** One line per program id that the answer covered. */
  readonly statuses: ReadonlyMap<string, string>;
  readonly grounding: SearchGrounding;
}

/**
 * Task `program.currentStatus`: ONLY_IN_CLOUD with Google Search, reason `needs-current-info`.
 * One request for every program of the pack (never only the ones the person may qualify for).
 */
export async function programCurrentStatus(input: StatusInput, options: RunOptions = {}): Promise<TaskResult<CurrentStatus>> {
  const call = planCurrentStatus(input);
  // Grounded text is checked like an explanation (scope general): it must not state a result.
  const { response, source } = await checked(() => runGrounded(call, options), 'general', input.locale, (r) => r.response.text());
  const statuses = parseStatusLines(response.text(), input.programs.map((p) => p.id));
  return { value: { statuses, grounding: searchGrounding(response) }, inferenceSource: source, reason: call.reason };
}

function canonicalJson(profile: Generalized<GeneralizedProfile>): string {
  // Same key order and form as core/generalize.ts canonical(); repeated here because ai/ must not
  // depend on more of core than the types it receives.
  return JSON.stringify({
    jurisdiction: profile.jurisdiction,
    incomeBand: profile.incomeBand,
    householdSize: profile.householdSize,
    childAgeBands: profile.childAgeBands === null ? null : [...profile.childAgeBands],
    county: profile.county,
    housing: profile.housing,
  });
}

export interface DiscoverInput {
  readonly profile: Generalized<GeneralizedProfile>;
  /** Names of the programs the app already shows, so they are not repeated. */
  readonly known: Public<readonly string[]>;
  readonly locale: string;
}

export function planDiscover(input: DiscoverInput): PlannedCall {
  const { mode, reason } = taskOf('discover.leads');
  return {
    taskId: 'discover.leads',
    mode,
    reason,
    model: CLOUD_MODEL,
    systemInstruction: fill(DISCOVER_V1.system, { locale: languageName(input.locale) }),
    prompt: fill(DISCOVER_V1.user, { generalizedProfileCanonicalJson: canonicalJson(input.profile), programNames: input.known.join('; ') }),
    generationConfig: { maxOutputTokens: 1024 },
    tools: [{ googleSearch: {} }],
    fields: ['profile-silhouette', 'program-names'],
  };
}

export interface Leads {
  readonly leads: readonly string[];
  readonly grounding: SearchGrounding;
}

/** Task `discover.leads`: ONLY_IN_CLOUD with Google Search, reason `needs-current-info`. Never verified. */
export async function discoverLeads(input: DiscoverInput, options: RunOptions = {}): Promise<TaskResult<Leads>> {
  const call = planDiscover(input);
  const { response, source } = await checked(() => runGrounded(call, options), 'general', input.locale, (r) => r.response.text());
  return { value: { leads: parseListLines(response.text(), 5), grounding: searchGrounding(response) }, inferenceSource: source, reason: call.reason };
}

export interface NearbyInput {
  readonly profile: Generalized<GeneralizedProfile>;
  /** The county's centroid from the app's county table, never the device position. */
  readonly centroid: Public<{ readonly latitude: number; readonly longitude: number }>;
  /** County name as shown in the app. */
  readonly countyName: Public<string>;
  readonly locale: string;
}

export function planNearby(input: NearbyInput): PlannedCall {
  const { mode, reason } = taskOf('nearby.help');
  if (input.profile.county === null) throw new Error('nearby.help needs a county');
  return {
    taskId: 'nearby.help',
    mode,
    reason,
    model: CLOUD_MODEL,
    systemInstruction: fill(NEARBY_V1.system, { locale: languageName(input.locale) }),
    prompt: fill(NEARBY_V1.user, { county: input.countyName, jurisdiction: input.profile.jurisdiction }),
    generationConfig: { maxOutputTokens: 1024 },
    tools: [{ googleMaps: {} }],
    toolConfig: { retrievalConfig: { latLng: { latitude: input.centroid.latitude, longitude: input.centroid.longitude }, languageCode: input.locale } },
    fields: ['county-area'],
  };
}

export interface Place {
  readonly title: string;
  readonly uri: string;
  readonly text?: string | undefined;
}

export interface NearbyHelp {
  readonly lines: readonly string[];
  /** Places from Google Maps grounding, linked to Google Maps. */
  readonly places: readonly Place[];
}

/** Task `nearby.help`: ONLY_IN_CLOUD with Google Maps at the county centroid, reason `needs-places`. */
export async function nearbyHelp(input: NearbyInput, options: RunOptions = {}): Promise<TaskResult<NearbyHelp>> {
  const call = planNearby(input);
  const { response, source } = await runGrounded(call, options);
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const maps = chunks.flatMap((c) => (c.maps ? [c.maps] : []));
  const links = safeSources(maps);
  const places = links.map((l) => ({ title: l.title, uri: l.uri, text: maps.find((m) => m.uri === l.uri)?.text }));
  return { value: { lines: parseListLines(response.text(), 5), places }, inferenceSource: source, reason: call.reason };
}

export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

export function planReadAloud(answer: ModelAnswer, locale: string): PlannedCall {
  const { mode, reason } = taskOf('readAloud');
  return {
    taskId: 'readAloud',
    mode,
    reason,
    model: TTS_MODEL,
    // Speech models take the whole instruction in the user turn.
    systemInstruction: '',
    prompt: `${READ_ALOUD_V1.system}\n\n${fill(READ_ALOUD_V1.user, { text: answer.text })}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { languageCode: locale, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
    fields: ['answer-text'],
  };
}

export interface Speech {
  /** Base64 audio from the speech model. */
  readonly data: string;
  readonly mimeType: string;
}

/** Task `readAloud`: ONLY_IN_CLOUD speech model, reason `speech`. Only explanation and chip answers. */
export async function readAloud(answer: ModelAnswer, locale: string, options: RunOptions = {}): Promise<TaskResult<Speech>> {
  const call = planReadAloud(answer, locale);
  const { response, source } = await runGrounded(call, options);
  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new TaskError('bad-output', 'the speech model returned no audio');
  return { value: { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'audio/L16;rate=24000' }, inferenceSource: source, reason: call.reason };
}
