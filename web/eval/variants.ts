// Builds pointer-extraction configurations for the evaluation runner: the shared v2
// configuration (POINTER_V2) with optional changes, so variants can be compared on the same data.
import { POINTER_V2, type PointerConfig } from '../src/ai/pointer-config';
import { parsePrompt } from '../src/ai/prompts';
import pointerExtractV3 from './prompts/pointer-extract.v3.md?raw';

/** Candidate prompts evaluated against shared/prompts/pointer-extract.v2.md. */
const PROMPTS = { v3: parsePrompt('pointer-extract.v3', pointerExtractV3) } as const;

export interface VariantSpec {
  readonly id: string;
  /** How the nullable schema is written for the cloud model. */
  readonly dialect?: 'openapi' | 'jsonschema';
  readonly model?: string;
  readonly thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  readonly temperature?: number;
  /** Extra words added to the skeleton allowlist for this run (tests an allowlist extension). */
  readonly extraAllowlist?: readonly string[];
  /** Apply the app's on-device name clean-up (src/core/tidy.ts) before rehydration. */
  readonly tidy?: boolean;
  /** Label for the summary table: which contract's Skeletonizer produced the skeletons. */
  readonly skeletons?: string;
  /** A candidate prompt from eval/prompts/ instead of the shared one. */
  readonly prompt?: keyof typeof PROMPTS;
}

export function buildConfig(spec: VariantSpec): PointerConfig {
  const dialect = spec.dialect ?? 'openapi';
  return {
    ...POINTER_V2,
    id: spec.id,
    prompt: spec.prompt ? PROMPTS[spec.prompt] : POINTER_V2.prompt,
    schemaOptions: { requiredNullable: true, dialect },
    schemaField: dialect === 'jsonschema' ? 'responseJsonSchema' : 'responseSchema',
    cloudModel: spec.model ?? POINTER_V2.cloudModel,
    thinkingLevel: spec.thinkingLevel,
    temperature: spec.temperature,
  };
}
