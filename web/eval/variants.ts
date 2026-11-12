// Builds pointer-extraction configurations from a small spec, so the runner can compare variants.
import type { PointerSchema } from '../src/core/skeleton';
import { POINTER_V1, SHARED_POINTER_SCHEMAS, type PointerConfig } from '../src/ai/pointer-config';
import { POINTER_EXTRACT, parsePrompt } from '../src/ai/prompts';
import nullPromptText from './variants/prompts/pointer-extract.null.md?raw';
import paystubDescribed from './variants/schemas/pointer.paystub.described.json';
import leaseDescribed from './variants/schemas/pointer.lease.described.json';
import paystubExample from './variants/examples/paystub.md?raw';
import leaseExample from './variants/examples/lease.md?raw';

export interface VariantSpec {
  readonly id: string;
  /** shared: shared/schemas as they are; described: one-line description on every property. */
  readonly schemas: 'shared' | 'described';
  /** Every property required and nullable, with the "use null" prompt. */
  readonly nullable: boolean;
  readonly dialect?: 'openapi' | 'jsonschema';
  readonly example: boolean;
  readonly lineNumbers: boolean;
  readonly model: string;
  readonly thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  readonly temperature?: number;
  /** Extra words added to the skeleton allowlist for this run (tests an allowlist extension). */
  readonly extraAllowlist?: readonly string[];
}

const DESCRIBED = {
  paystub: paystubDescribed as unknown as PointerSchema,
  lease: leaseDescribed as unknown as PointerSchema,
};
const NULL_PROMPT = parsePrompt('pointer-extract.null', nullPromptText);

export function buildConfig(spec: VariantSpec): PointerConfig {
  const dialect = spec.dialect ?? 'openapi';
  return {
    ...POINTER_V1,
    id: spec.id,
    prompt: spec.nullable ? NULL_PROMPT : POINTER_EXTRACT,
    schemas: spec.schemas === 'described' ? DESCRIBED : SHARED_POINTER_SCHEMAS,
    schemaOptions: spec.nullable ? { requiredNullable: true, dialect } : {},
    schemaField: dialect === 'jsonschema' ? 'responseJsonSchema' : 'responseSchema',
    lineNumbers: spec.lineNumbers,
    example: spec.example ? { paystub: paystubExample.trim(), lease: leaseExample.trim() } : undefined,
    cloudModel: spec.model,
    thinkingLevel: spec.thinkingLevel,
    temperature: spec.temperature,
  };
}
