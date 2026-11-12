// The only folder that imports firebase/ai. One function per task id in shared/routing.json.
// Every cloud-capable task (PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD) accepts CloudSafe
// input only, so a Raw value does not type-check (shared/DATA_TYPES.md). ONLY_ON_DEVICE tasks that
// take Raw input live in ./on-device.ts, the single ai/ file the routing check lets unwrap Raw.

import { InferenceMode, type HybridParams } from 'firebase/ai';
import type { Generalized, Public, Skeleton } from '../core/types';
import type { GeneralizedProfile } from '../core/generalize';
import type { PointerSchema } from '../core/skeleton';
import routing from '../../../shared/routing.json';
import { classifyError, TaskError, type TaskErrorKind } from './errors';
import { modelFor, sourceOf, type InferenceSource, type UsageMetadata } from './model-port';
import { POINTER_V2, type DocType, type PointerConfig } from './pointer-config';
import { toModelSchema } from './model-schema';
import { fill } from './prompts';

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
}

/** Languages of Chrome's on-device model. Other languages fall back to the cloud. */
export const ON_DEVICE_LANGUAGES: ReadonlySet<string> = new Set(['en', 'es', 'ja', 'de', 'fr']);

/** The pointer configuration the app uses. */
export const ACTIVE_POINTER_CONFIG: PointerConfig = POINTER_V2;

/** Pointer schemas of the active configuration (x-kind annotated, for rehydration). */
export const POINTER_SCHEMAS: Readonly<Record<DocType, PointerSchema>> = ACTIVE_POINTER_CONFIG.schemas;
export const CLOUD_MODEL = ACTIVE_POINTER_CONFIG.cloudModel;

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
  const config = options.config ?? ACTIVE_POINTER_CONFIG;
  const pointerSchema = config.schemas[docType] as unknown as Record<string, unknown>;
  const cloudSchema = toModelSchema(pointerSchema, config.schemaOptions);
  const deviceSchema = toModelSchema(pointerSchema, { ...config.schemaOptions, dialect: 'jsonschema' });
  const system = systemText(config, docType);
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
  const config = options.config ?? ACTIVE_POINTER_CONFIG;
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
  const config = options.config ?? ACTIVE_POINTER_CONFIG;
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

/** Program text shipped with the rule pack. */
export type ProgramText = { readonly programId: string; readonly name: string; readonly ruleText: string };

/**
 * Task `explain.short`: PREFER_ON_DEVICE, input Generalized + Public, reason `short-text`.
 * Not available yet.
 */
export function explainShort(
  profile: Generalized<GeneralizedProfile>,
  program: Public<ProgramText>,
): Promise<TaskResult<string>> {
  void profile;
  void program;
  return Promise.reject(new Error('explain.short is not available yet'));
}
