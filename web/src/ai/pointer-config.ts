// Configurations of the document.pointer.extract task. A configuration fixes everything that
// shapes the model call: prompt, pointer schemas, schema options, skeleton presentation, model.
// The app uses ACTIVE_POINTER_CONFIG (src/ai/tasks.ts); eval/ compares variants on a test set.
// Every variant keeps the pointer principle: output is placeholder ids and closed enums only.

import paystubV2 from '../../../shared/schemas/pointer.paystub.json';
import leaseV2 from '../../../shared/schemas/pointer.lease.json';
import type { PointerSchema } from '../core/skeleton';
import { POINTER_EXTRACT, type PromptTemplate } from './prompts';
import type { ModelSchemaOptions } from './model-schema';

export type DocType = 'paystub' | 'lease';

export interface PointerConfig {
  readonly id: string;
  readonly prompt: PromptTemplate;
  /** x-kind annotated pointer schemas (rehydration reads x-kind; the model sees the converted form). */
  readonly schemas: Readonly<Record<DocType, PointerSchema>>;
  /**
   * Model schema options. The dialect applies to the cloud schema; the on-device constraint is
   * always written as JSON Schema (Chrome's Prompt API), derived with the same options.
   */
  readonly schemaOptions: ModelSchemaOptions;
  /** Cloud API field that carries the schema. */
  readonly schemaField: 'responseSchema' | 'responseJsonSchema';
  /** Prefix skeleton lines with L01:, L02: … in the prompt. */
  readonly lineNumbers: boolean;
  /** Optional worked example appended to the system instruction, per document type. */
  readonly example?: Readonly<Partial<Record<DocType, string>>> | undefined;
  readonly cloudModel: string;
  /** Thinking level for the cloud model; undefined = the model's default. */
  readonly thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high' | undefined;
  readonly maxOutputTokens: number;
  /** Sampling temperature; undefined = the model's default (Gemini 3 models loop at low values). */
  readonly temperature?: number | undefined;
}

export const SHARED_POINTER_SCHEMAS: Readonly<Record<DocType, PointerSchema>> = {
  paystub: paystubV2 as unknown as PointerSchema,
  lease: leaseV2 as unknown as PointerSchema,
};

/**
 * shared/prompts/pointer-extract.v2.md with shared/schemas/pointer.*.json (v2): every field
 * required and nullable, "use null when the field is not in the document".
 * Measured on eval/dataset/: see eval/results/summary.md.
 */
export const POINTER_V2: PointerConfig = {
  id: 'v2',
  prompt: POINTER_EXTRACT,
  schemas: SHARED_POINTER_SCHEMAS,
  schemaOptions: { requiredNullable: true, dialect: 'openapi' },
  schemaField: 'responseSchema',
  lineNumbers: false,
  cloudModel: 'gemini-3.5-flash-lite',
  maxOutputTokens: 1024,
};
