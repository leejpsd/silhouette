// ONLY_ON_DEVICE tasks. This is the only file under src/ai/ that may unwrap Raw values, and the
// routing check (scripts/check-routing.mjs) rejects any other inference mode in this file, so Raw
// input can only ever reach Chrome's on-device model through Firebase AI Logic.

import { InferenceMode } from 'firebase/ai';
import { Raw, reveal } from '../core/types';
import routing from '../../../shared/routing.json';
import { classifyError, TaskError } from './errors';
import { deviceAvailability, modelFor, sourceOf } from './model-port';
import { ASK_CREATE_OPTIONS, PHOTO_CREATE_OPTIONS } from './device-model';
import { ASK_PERSONAL_V1, EXPLAIN_PERSONAL_V1, PHOTO_READ, fill, type PromptTemplate } from './prompts';
import { checked, languageName, type DocType, type RoutingReason, type TaskResult } from './tasks';
import { ASK_WORDS } from '../core/explain';
import type { ShownVerdict } from '../core/output-check';
import { recordAnsweredOnDevice } from '../data/outbound';

const PHOTO_TASK = routing.tasks['document.photo.read'];
const FREE_TEXT_TASK = routing.tasks['ask.freeText'];
const PERSONAL_TASK = routing.tasks['explain.personal'];
const PHOTO_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * The hard guard of every ONLY_ON_DEVICE task, before any SDK call. Firebase AI Logic 3.1 creates no
 * on-device adapter when the browser has no `LanguageModel` global, and then sends the request to the
 * cloud whatever the inference mode, ONLY_ON_DEVICE included. So without the Prompt API, or with a
 * model that is not ready, these tasks stop here and nothing is built or sent.
 */
async function requireDeviceModel(createOptions: unknown, task: string): Promise<void> {
  if (typeof (globalThis as { LanguageModel?: unknown }).LanguageModel === 'undefined') {
    throw new TaskError('on-device-unavailable', `${task}: this browser has no on-device model`);
  }
  const status = await deviceAvailability(createOptions);
  if (status !== 'available') throw new TaskError('on-device-unavailable', `${task}: the on-device model is ${status}`);
}

/**
 * Task `document.photo.read`: ONLY_ON_DEVICE, input Raw (photo), reason `photo-never-leaves`.
 * Transcribes the photo on device; the text stays Raw and goes through the Skeletonizer next.
 * Throws TaskError('on-device-unavailable') when the on-device model cannot run.
 */
export async function readPhoto(photo: Raw<Blob>, docType: DocType, language: string): Promise<TaskResult<Raw<string>>> {
  if (PHOTO_TASK.mode !== 'ONLY_ON_DEVICE') throw new Error('routing.json changed: document.photo.read mode');
  const image = reveal(photo);
  if (!PHOTO_TYPES.has(image.type)) throw new TaskError('on-device-unavailable', 'only JPEG and PNG photos can be read on device');
  await requireDeviceModel(PHOTO_CREATE_OPTIONS(language), 'document.photo.read');
  try {
    const model = await modelFor(`document.photo.read:${language}`, () => ({
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: { ...PHOTO_CREATE_OPTIONS(language), initialPrompts: [{ role: 'system', content: PHOTO_READ.system }] } as never,
      },
    }));
    const { response } = await model.generateContent([
      fill(PHOTO_READ.user, { docType }),
      { inlineData: { data: await base64(image), mimeType: image.type } },
    ]);
    const source = sourceOf(response, 'ON_DEVICE');
    if (source !== 'ON_DEVICE') throw new TaskError('on-device-unavailable', 'photo task did not run on device');
    recordAnsweredOnDevice('photo');
    return { value: Raw.of(response.text()), inferenceSource: source, reason: PHOTO_TASK.reason as RoutingReason };
  } catch (error) {
    throw classifyError(error);
  }
}

/**
 * The person's own result, for the on-device explanation and typed questions
 * (shared/prompts/explain-personal.v1.md, ask-personal.v1.md): the verdict on screen, each criterion
 * with its state and, where it compares a value with a limit, the limit and the person's value. It
 * holds exact values and answers to sensitive questions, so it is Raw and only ever reaches
 * ONLY_ON_DEVICE calls in this file.
 */
export interface PersonalResult {
  readonly locale: string;
  readonly programName: string;
  readonly facts: string;
  readonly verdictLabel: string;
  /** The verdict on screen: a hedge that contradicts it is blocked (OUTPUT_CHECKS.md, scope personal). */
  readonly verdict: ShownVerdict;
  /** `- {label}: {state}` lines, with ` (limit {limit}, yours {value})` where the rules compare with a limit. */
  readonly criteriaLines: string;
}

/** Words the on-device answer may use; on-device output is short (explain-personal.v1.md). */
export const PERSONAL_WORDS = 80;

async function runPersonal(
  taskKey: string,
  prompt: PromptTemplate,
  values: Record<string, string>,
  locale: string,
  verdict: ShownVerdict,
  reason: RoutingReason,
  signal: AbortSignal | undefined,
): Promise<TaskResult<string>> {
  await requireDeviceModel(ASK_CREATE_OPTIONS(locale), taskKey);
  const system = fill(prompt.system, { locale: languageName(locale) });
  const once = async (): Promise<TaskResult<string>> => {
    try {
      const model = await modelFor(`${taskKey}:${locale}`, () => ({
        mode: InferenceMode.ONLY_ON_DEVICE,
        onDeviceParams: { createOptions: { ...ASK_CREATE_OPTIONS(locale), initialPrompts: [{ role: 'system', content: system }] } as never },
      }));
      const { response } = await model.generateContent(fill(prompt.user, values));
      if (signal?.aborted) throw new TaskError('cancelled', 'cancelled by the person');
      const source = sourceOf(response, 'ON_DEVICE');
      if (source !== 'ON_DEVICE') throw new TaskError('on-device-unavailable', `${taskKey} did not run on device`);
      return { value: response.text().trim(), inferenceSource: source, reason };
    } catch (error) {
      throw classifyError(error);
    }
  };
  const result = await checked(once, 'personal', locale, (r) => r.value, verdict);
  recordAnsweredOnDevice(taskKey === 'ask.freeText' ? 'own-question' : 'why');
  return result;
}

function personalValues(result: PersonalResult): Record<string, string> {
  return {
    programName: result.programName,
    programSummaryFromRulePack: result.facts,
    verdictLabel: result.verdictLabel,
    criteriaLines: result.criteriaLines,
    maxWords: String(PERSONAL_WORDS),
  };
}

/**
 * Task `explain.personal`: ONLY_ON_DEVICE, input Raw (the person's result and values) + Public,
 * reason `your-result-stays-on-device`. Never falls back to the cloud: without a device model the
 * app shows the rule engine's reasons as plain lines and offers the general explanation.
 */
export async function explainPersonal(result: Raw<PersonalResult>, options: { signal?: AbortSignal } = {}): Promise<TaskResult<string>> {
  if (PERSONAL_TASK.mode !== 'ONLY_ON_DEVICE') throw new Error('routing.json changed: explain.personal mode');
  const r = reveal(result);
  return runPersonal('explain.personal', EXPLAIN_PERSONAL_V1, personalValues(r), r.locale, r.verdict, PERSONAL_TASK.reason as RoutingReason, options.signal);
}

/**
 * Task `ask.freeText`: ONLY_ON_DEVICE, input Raw (what the person typed may be personal, and the answer
 * may use their result), reason `typed-text-may-be-personal`. Never falls back to the cloud: without
 * the on-device model the UI offers the prepared questions only (routing.json fallback `chips-only`).
 * The answer is a plain string, so it can never be passed to a cloud task such as readAloud().
 */
export async function askFreeText(question: Raw<string>, result: Raw<PersonalResult>, options: { signal?: AbortSignal } = {}): Promise<TaskResult<string>> {
  if (FREE_TEXT_TASK.mode !== 'ONLY_ON_DEVICE') throw new Error('routing.json changed: ask.freeText mode');
  const r = reveal(result);
  const values = { ...personalValues(r), question: reveal(question).trim().slice(0, 500), maxWords: String(Math.min(ASK_WORDS, PERSONAL_WORDS)) };
  return runPersonal('ask.freeText', ASK_PERSONAL_V1, values, r.locale, r.verdict, FREE_TEXT_TASK.reason as RoutingReason, options.signal);
}
