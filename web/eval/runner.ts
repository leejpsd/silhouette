// Evaluation page (dev server only). Runs the app's own pipeline on one document:
// skeletonize (document language ∪ en) → document.pointer.extract (forced to the cloud) → rehydrate.
import { Raw, reveal } from '../src/core/types';
import { rehydrate, skeletonize } from '../src/core/skeleton';
import { allowlistFor, introducersFor } from '../src/ui/doc/allowlists';
import { tidyNamePointers } from '../src/core/tidy';
import { extractPointers, presentSkeleton, TaskError, type DocType } from '../src/ai/tasks';
import { asPublic } from '../src/core/types';
import type { ExactProfile } from '../src/core/generalize';
import { askChip, explainProgram, planAskChip, planExplain, type ExplainInput } from '../src/ai/tasks';
import { translator, type Locale } from '../src/ui/i18n';
import { PACK } from '../src/ui/pack';
import { programFacts } from '../src/ui/answers/facts';
import { buildConfig, type VariantSpec } from './variants';

export interface EvalInput {
  readonly text: string;
  readonly docType: DocType;
  readonly language: 'en' | 'es' | 'ko';
  readonly spec: VariantSpec;
}

export type EvalOutput =
  | {
      ok: true;
      pointers: unknown;
      rehydrated: unknown;
      rehydratedRaw: unknown;
      rehydratedTidy: unknown;
      usage: unknown;
      latencyMs: number;
      inferenceSource: string;
      skeletonChars: number;
      promptPreview: string;
    }
  | { ok: false; kind: string; detail: string; status?: number | undefined; latencyMs: number };

async function evalExtract(input: EvalInput): Promise<EvalOutput> {
  const config = buildConfig(input.spec);
  const allow = new Set([...allowlistFor(input.language), ...(input.spec.extraAllowlist ?? [])]);
  const introducers = introducersFor(input.language);
  const { skeleton, map } = skeletonize(Raw.of(input.text), allow, introducers);
  const started = performance.now();
  try {
    const result = await extractPointers(skeleton, input.docType, input.language, { config, forceCloud: true });
    const schema = config.schemas[input.docType];
    // Both readings of the same answer: as the model returned it, and after the on-device clean-up.
    const tidied = tidyNamePointers(schema, result.value, map, introducers);
    const pointers = input.spec.tidy ? tidied : result.value;
    const rehydrated = reveal(rehydrate(schema, pointers, map));
    const rehydratedRaw = reveal(rehydrate(schema, result.value, map));
    const rehydratedTidy = reveal(rehydrate(schema, tidied, map));
    return {
      ok: true,
      pointers,
      rehydrated,
      rehydratedRaw,
      rehydratedTidy,
      usage: result.usage ?? null,
      latencyMs: Math.round(performance.now() - started),
      inferenceSource: result.inferenceSource,
      skeletonChars: skeleton.length,
      promptPreview: presentSkeleton(skeleton, config).slice(0, 120),
    };
  } catch (error) {
    const e = error instanceof TaskError ? error : new TaskError('unknown', String(error));
    return { ok: false, kind: e.kind, detail: e.detail, status: e.status, latencyMs: Math.round(performance.now() - started) };
  }
}

(window as unknown as { evalExtract: typeof evalExtract }).evalExtract = evalExtract;
document.body.dataset['ready'] = 'true';

// ---------- Explanations and prepared questions (eval/answers.mjs) ----------


export interface AnswerInput {
  readonly profile: ExactProfile;
  readonly programId: string;
  readonly locale: Locale;
  readonly kind: 'short' | 'long' | 'chip';
  readonly question?: string;
}

async function evalAnswer(input: AnswerInput) {
  // Since explain.v5 / ask.v4 the request carries nothing about the person: the profile is not used.
  const program = PACK.programs.find((p) => p.id === input.programId);
  if (!program) throw new Error('unknown program');
  const explain = asPublic({ program: programFacts(translator(input.locale), input.locale, program), locale: input.locale }) as ExplainInput;
  const plan = input.kind === 'chip' ? planAskChip(explain, asPublic({ id: 'q', question: input.question ?? '' })) : planExplain(explain, input.kind);
  const started = performance.now();
  try {
    const result = input.kind === 'chip' ? await askChip(plan) : await explainProgram(plan);
    return {
      ok: true as const,
      taskId: plan.taskId,
      reason: result.reason,
      inferenceSource: result.inferenceSource,
      prompt: plan.prompt,
      text: result.value.text,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    const e = error instanceof TaskError ? error : new TaskError('unknown', String(error));
    return { ok: false as const, taskId: plan.taskId, kind: e.kind, detail: e.detail, latencyMs: Math.round(performance.now() - started) };
  }
}

(window as unknown as { evalAnswer: typeof evalAnswer }).evalAnswer = evalAnswer;
