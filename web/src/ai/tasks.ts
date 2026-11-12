// The only folder that imports firebase/ai. One function per task id in shared/routing.json.
// Every cloud-capable task (PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD) accepts CloudSafe
// input only, so a Raw value does not type-check (shared/DATA_TYPES.md). ONLY_ON_DEVICE tasks that
// take Raw input live in ./on-device.ts, the single ai/ file the routing check lets unwrap Raw.

import { InferenceMode, type HybridParams } from 'firebase/ai';
import type { Generalized, Public, Skeleton } from '../core/types';
import type { GeneralizedProfile, SilhouetteVerdict } from '../core/generalize';
import { ASK_WORDS, EXPLAIN_WORDS, explainRoute, parseListLines, parseStatusLines, safeSources, type ExplainLength, type ExplainRoute, type Source } from '../core/explain';
import type { PointerSchema } from '../core/skeleton';
import routing from '../../../shared/routing.json';
import { classifyError, TaskError, type TaskErrorKind } from './errors';
import { modelFor, sourceOf, type InferenceSource, type UsageMetadata } from './model-port';
import { SHARED_POINTER_SCHEMAS, pointerConfigFor, type DocType, type PointerConfig } from './pointer-config';
import { appConfig } from '../data/remote-config';
import { describeAiModel, describeAiRequests } from '../data/net-monitor';
import { toModelSchema } from './model-schema';
import { ASK_V1, CURRENT_STATUS_V1, DISCOVER_V1, NEARBY_V1, READ_ALOUD_V1, explainPromptFor, fill, type PromptTemplate } from './prompts';
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
  | 'on-device-failed';

/** Every model response carries its provenance: where it ran, and why. */
export interface TaskResult<T> {
  readonly value: T;
  readonly inferenceSource: InferenceSource;
  readonly reason: RoutingReason;
  /** For explanations: the length and language that decided the route (shown in the reason chip). */
  readonly route?: ExplainRoute | undefined;
}

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
}

function systemText(config: PointerConfig, docType: DocType): string {
  const example = config.example?.[docType];
  return example ? `${config.prompt.system}\n\n${example}` : config.prompt.system;
}

/**
 * Hybrid parameters for document.pointer.extract. The document language is declared in
 * expectedInputs, so Chrome reports the on-device model unavailable for languages it does not
 * support (Korean) and the SDK falls back to the cloud with the same silhouette.
 */
export function pointerModelParams(docType: DocType, language: string, options: PointerCallOptions = {}): HybridParams {
  const config = options.config ?? activePointerConfig();
  const pointerSchema = config.schemas[docType] as unknown as Record<string, unknown>;
  const cloudSchema = toModelSchema(pointerSchema, config.schemaOptions);
  const deviceSchema = toModelSchema(pointerSchema, { ...config.schemaOptions, dialect: 'jsonschema' });
  const system = systemText(config, docType);
  describeAiRequests(system, ['document-silhouette']);
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    [config.schemaField]: cloudSchema,
    maxOutputTokens: config.maxOutputTokens,
  };
  if (config.temperature !== undefined) generationConfig['temperature'] = config.temperature;
  if (config.thinkingLevel) generationConfig['thinkingConfig'] = { thinkingLevel: config.thinkingLevel.toUpperCase() };
  return {
    mode: options.forceCloud ? InferenceMode.ONLY_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: { model: config.cloudModel, systemInstruction: system, generationConfig: generationConfig as never },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: [language] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts: [{ role: 'system', content: system }],
      } as never,
      promptOptions: { responseConstraint: deviceSchema },
    },
  };
}

export function pointerModel(docType: DocType, language: string, options: PointerCallOptions = {}) {
  const config = options.config ?? activePointerConfig();
  const key = `document.pointer.extract:${config.id}:${docType}:${language}${options.forceCloud ? ':cloud' : ''}`;
  return modelFor(key, () => pointerModelParams(docType, language, options));
}

/** The skeleton as the model sees it (optionally line-numbered). Still only placeholders. */
export function presentSkeleton(skeleton: Skeleton, config: PointerConfig): string {
  if (!config.lineNumbers) return skeleton;
  const lines = skeleton.split('\n');
  const width = String(lines.length).length < 2 ? 2 : String(lines.length).length;
  return lines.map((line, i) => `L${String(i + 1).padStart(width, '0')}: ${line}`).join('\n');
}

export interface PointerResult extends TaskResult<unknown> {
  readonly usage?: UsageMetadata | undefined;
  /** When the on-device attempt failed and the cloud answered: what the device reported. */
  readonly deviceError?: string | undefined;
}

/** Errors that come from the cloud side; repeating the call in the cloud would not help. */
const CLOUD_FAILURES: ReadonlySet<TaskErrorKind> = new Set(['app-check', 'permission', 'api-not-enabled', 'quota', 'network']);

async function callPointerModel(
  skeleton: Skeleton,
  docType: DocType,
  language: string,
  options: PointerCallOptions,
): Promise<{ value: Record<string, unknown>; source: InferenceSource; usage: UsageMetadata | undefined }> {
  const config = options.config ?? activePointerConfig();
  const model = await pointerModel(docType, language, options);
  const prompt = fill(config.prompt.user, { docType, skeleton: presentSkeleton(skeleton, config) });
  const { response } = await model.generateContent(prompt);
  const source = sourceOf(response, 'IN_CLOUD');
  const text = response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // The output holds placeholder ids only (never document values), so a snippet is safe to keep.
    throw Object.assign(new TaskError('bad-output', `model output is not JSON (${text.length} chars): ${text.slice(0, 160)}`), { source });
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new TaskError('bad-output', 'model output is not a JSON object'), { source });
  }
  const cleaned = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));
  return { value: cleaned, source, usage: response.usageMetadata };
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
  try {
    const r = await callPointerModel(skeleton, docType, language, options);
    return { value: r.value, inferenceSource: r.source, reason, usage: r.usage };
  } catch (error) {
    if (options.forceCloud || !failedOnDevice(error)) throw classifyError(error);
    const deviceError = classifyError(error).detail;
    try {
      const r = await callPointerModel(skeleton, docType, language, { ...options, forceCloud: true });
      return { value: r.value, inferenceSource: r.source, reason: ON_DEVICE_FAILURE.reason as RoutingReason, usage: r.usage, deviceError };
    } catch (cloudError) {
      throw classifyError(cloudError);
    }
  }
}


// ---------- Explanations and questions ----------

/** Program facts from the rule pack and its copy, in the UI language. Static app content. */
export type ProgramFacts = {
  readonly programId: string;
  readonly name: string;
  /** What the program checks, its period and caveats, as sentences. */
  readonly facts: string;
  /** Criterion labels by criterion id. */
  readonly criteria: Readonly<Record<string, string>>;
  /** How each verdict is worded in the UI ("You may qualify", …). */
  readonly verdictWords: Readonly<Record<SilhouetteVerdict['verdict'], string>>;
  /**
   * Notes added to criteria that are not met: "not met", and for criteria the silhouette cannot
   * decide, that the answer was not sent (so a model does not claim the person skipped it).
   */
  readonly stateNotes: { readonly fail: string; readonly unknown: string };
};

/** A prepared question chip. Static app content. */
export type QuestionChip = { readonly id: string; readonly question: string };

/**
 * What explanations and prepared questions are given: the profile silhouette, the verdict the engine
 * reaches from that silhouette alone, and the program's facts. Exact values and answers to
 * sensitive questions are not part of it.
 */
export interface ExplainInput {
  readonly profile: Generalized<GeneralizedProfile>;
  readonly verdict: Generalized<SilhouetteVerdict>;
  readonly program: Public<ProgramFacts>;
  /** UI language code (en, es, ko). */
  readonly locale: string;
}

const answerBrand: unique symbol = Symbol('model-answer');

/**
 * The text of an explanation or a prepared-question answer. Only explainProgram() and askChip()
 * create one, and both take CloudSafe input only, so readAloud() can send it to the cloud. An answer
 * to a typed question (Raw input) is a plain string and cannot be read aloud.
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

/** Placeholder values of explain.v1 and ask.v1. */
export function explainValues(input: ExplainInput, maxWords: number, question?: string): Record<string, string> {
  const { program, verdict } = input;
  const label = (id: string) => program.criteria[id] ?? id;
  const met = verdict.criteria.filter((c) => c.state === 'pass').map((c) => label(c.id));
  const other = verdict.criteria
    .filter((c) => c.state !== 'pass')
    .map((c) => `${label(c.id)} (${c.state === 'fail' ? program.stateNotes.fail : program.stateNotes.unknown})`);
  const values: Record<string, string> = {
    generalizedProfileCanonicalJson: canonicalJson(input.profile),
    programName: program.name,
    programSummaryFromRulePack: program.facts,
    verdict: program.verdictWords[verdict.verdict],
    passedCriteriaLabels: met.length > 0 ? met.join('; ') : '-',
    otherCriteriaLabels: other.length > 0 ? other.join('; ') : '-',
    maxWords: String(maxWords),
  };
  if (question !== undefined) values['question'] = question;
  return values;
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

/** Everything that fixes one text model call: shown in the "Leaving your device" panel before it is made. */
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
  /** What the request carries, for the record of outgoing requests (never values). */
  readonly fields: readonly string[];
}

/** The request body as Firebase AI Logic sends it to the cloud, for display before sending. */
export function requestPreview(call: PlannedCall): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: call.prompt }] }],
    generationConfig: call.generationConfig,
  };
  if (call.systemInstruction !== '') body['systemInstruction'] = { role: 'system', parts: [{ text: call.systemInstruction }] };
  if (call.tools) body['tools'] = call.tools;
  if (call.toolConfig) body['toolConfig'] = call.toolConfig;
  return body;
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
  fields: readonly string[],
  route?: ExplainRoute,
): PlannedCall {
  const { mode, reason } = taskOf(taskId);
  return {
    taskId,
    mode,
    reason,
    model: CLOUD_MODEL,
    systemInstruction: fill(prompt.system, { locale: languageName(locale) }),
    prompt: fill(prompt.user, values),
    // Room for the words asked for, in any of the app's languages.
    generationConfig: { maxOutputTokens: Math.max(256, maxWords * 4) },
    route,
    fields,
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
  return textCall(route.task, prompt, explainValues(input, route.words), input.locale, route.words, ['profile-silhouette', 'program-facts'], route);
}

export function planAskChip(input: ExplainInput, chip: Public<QuestionChip>): PlannedCall {
  return textCall('ask.chip', ASK_V1, explainValues(input, ASK_WORDS, chip.question), input.locale, ASK_WORDS, [
    'profile-silhouette',
    'program-facts',
    'prepared-question',
  ]);
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
  if (!forceCloud && call.mode !== 'ONLY_IN_CLOUD') {
    const locale = call.route?.locale ?? 'en';
    params['onDeviceParams'] = {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en', locale] }],
        expectedOutputs: [{ type: 'text', languages: [locale] }],
        initialPrompts: [{ role: 'system', content: call.systemInstruction }],
      },
    };
  }
  return params as unknown as HybridParams;
}

async function runCall(call: PlannedCall, forceCloud: boolean): Promise<{ response: ModelResponse; source: InferenceSource }> {
  const key = `${call.taskId}:${forceCloud ? 'cloud' : call.mode}:${call.systemInstruction}`;
  const model = await modelFor(key, () => hybridParams(call, forceCloud));
  const { response } = await model.generateContent(call.prompt);
  return { response, source: sourceOf(response, call.mode === 'ONLY_IN_CLOUD' || forceCloud ? 'IN_CLOUD' : 'ON_DEVICE') };
}

/**
 * Runs a planned text call. A PREFER_ON_DEVICE call that fails on the device is repeated once with
 * ONLY_IN_CLOUD (routing.json onDeviceFailure); its input is CloudSafe, so nothing new is sent.
 */
async function runText(call: PlannedCall): Promise<TaskResult<ModelAnswer>> {
  try {
    const { response, source } = await runCall(call, false);
    return { value: modelAnswer(response.text()), inferenceSource: source, reason: call.reason, route: call.route };
  } catch (error) {
    if (call.mode !== ON_DEVICE_FAILURE.appliesTo || !failedOnDevice(error)) throw classifyError(error);
    try {
      const { response, source } = await runCall(call, true);
      return { value: modelAnswer(response.text()), inferenceSource: source, reason: ON_DEVICE_FAILURE.reason as RoutingReason, route: call.route };
    } catch (cloudError) {
      throw classifyError(cloudError);
    }
  }
}

/**
 * Tasks `explain.short` (PREFER_ON_DEVICE, reason `short-text`) and `explain.long` (PREFER_IN_CLOUD,
 * reason `long-or-unsupported-locale`): explains the silhouette verdict in plain language.
 * The route is decided by planExplain(); pass the plan that was shown to the user.
 */
export function explainProgram(call: PlannedCall): Promise<TaskResult<ModelAnswer>> {
  if (call.taskId !== 'explain.short' && call.taskId !== 'explain.long') throw new Error('not an explanation call');
  return runText(call);
}

/** Task `ask.chip`: PREFER_ON_DEVICE, reason `prepared-question`. Pass a plan from planAskChip(). */
export function askChip(call: PlannedCall): Promise<TaskResult<ModelAnswer>> {
  if (call.taskId !== 'ask.chip') throw new Error('not a prepared-question call');
  return runText(call);
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

async function runGrounded(call: PlannedCall): Promise<{ response: ModelResponse; source: InferenceSource }> {
  try {
    return await runCall(call, false);
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
export async function programCurrentStatus(input: StatusInput): Promise<TaskResult<CurrentStatus>> {
  const call = planCurrentStatus(input);
  const { response, source } = await runGrounded(call);
  const statuses = parseStatusLines(response.text(), input.programs.map((p) => p.id));
  return { value: { statuses, grounding: searchGrounding(response) }, inferenceSource: source, reason: call.reason };
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
export async function discoverLeads(input: DiscoverInput): Promise<TaskResult<Leads>> {
  const call = planDiscover(input);
  const { response, source } = await runGrounded(call);
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
export async function nearbyHelp(input: NearbyInput): Promise<TaskResult<NearbyHelp>> {
  const call = planNearby(input);
  const { response, source } = await runGrounded(call);
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
export async function readAloud(answer: ModelAnswer, locale: string): Promise<TaskResult<Speech>> {
  const call = planReadAloud(answer, locale);
  const { response, source } = await runGrounded(call);
  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new TaskError('bad-output', 'the speech model returned no audio');
  return { value: { data: part.inlineData.data, mimeType: part.inlineData.mimeType ?? 'audio/L16;rate=24000' }, inferenceSource: source, reason: call.reason };
}
