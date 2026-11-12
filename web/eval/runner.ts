// Evaluation page (dev server only). Runs the app's own pipeline on one document:
// skeletonize (document language ∪ en) → document.pointer.extract (forced to the cloud) → rehydrate.
import { Raw, reveal } from '../src/core/types';
import { rehydrate, skeletonize } from '../src/core/skeleton';
import { allowlistFor } from '../src/ui/doc/allowlists';
import { extractPointers, presentSkeleton, TaskError, type DocType } from '../src/ai/tasks';
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
  const { skeleton, map } = skeletonize(Raw.of(input.text), allow);
  const started = performance.now();
  try {
    const result = await extractPointers(skeleton, input.docType, input.language, { config, forceCloud: true });
    const rehydrated = reveal(rehydrate(config.schemas[input.docType], result.value, map));
    return {
      ok: true,
      pointers: result.value,
      rehydrated,
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
