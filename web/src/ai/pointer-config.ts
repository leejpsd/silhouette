// Configurations of the document.pointer.extract task. A configuration fixes everything that
// shapes the model call: prompt, pointer schemas, schema options, skeleton presentation, model.
// The app picks one by the Remote Config value prompt_pointer_extract_v (activePointerConfig() in
// src/ai/tasks.ts); eval/ compares variants on a test set.
// Every variant keeps the pointer principle: output is placeholder ids and closed enums only.

import paystubV2 from '../../../shared/schemas/pointer.paystub.json';
import leaseV2 from '../../../shared/schemas/pointer.lease.json';
import type { PointerSchema } from '../core/skeleton';
import { POINTER_EXTRACT, POINTER_EXTRACT_DEVICE_V1, POINTER_EXTRACT_V3, POINTER_EXTRACT_V4, POINTER_EXTRACT_V5, type DeviceParts, type PromptTemplate } from './prompts';
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
  /**
   * Sampling options for the on-device session (Prompt API create options), when a configuration
   * sets them. None of the bundled configurations does: some Chrome versions accept them only in
   * extensions.
   */
  readonly device?: { readonly temperature?: number; readonly topK?: number } | undefined;
  /**
   * When set, a document with a list field (a paystub's deductions) is read on the device in two
   * parts, each with its own strict constraint and this added wording: the core fields, then the
   * list. The cloud reading stays a single pass with the shared prompt only.
   */
  readonly deviceParts?: DeviceParts | undefined;
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

/**
 * shared/prompts/pointer-extract.v3.md: v2 plus "gross pay is the total of all earnings for the
 * period, never a single earnings line". Same schemas and settings.
 */
export const POINTER_V3: PointerConfig = { ...POINTER_V2, id: 'v3', prompt: POINTER_EXTRACT_V3 };

/**
 * shared/prompts/pointer-extract.v4.md: v3 plus "hours worked and hourly rate are those of the
 * Regular (base pay) line". Same schemas and settings. One request per page, on the device and in the
 * cloud alike.
 */
export const POINTER_V4: PointerConfig = { ...POINTER_V2, id: 'v4', prompt: POINTER_EXTRACT_V4 };

/**
 * shared/prompts/pointer-extract.v5.md (v4's text, word for word) with
 * shared/prompts/pointer-extract-device.v1.md: on a device whose model is available a paystub is read
 * in parts (validation/DEVICE_READING.md); the cloud request is one page with v5 alone.
 */
export const POINTER_V5: PointerConfig = { ...POINTER_V2, id: 'v5', prompt: POINTER_EXTRACT_V5, deviceParts: POINTER_EXTRACT_DEVICE_V1 };

/** Bundled prompt versions, by the number in shared/prompts/pointer-extract.v{n}.md. */
export const POINTER_CONFIGS: ReadonlyMap<number, PointerConfig> = new Map([
  [2, POINTER_V2],
  [3, POINTER_V3],
  [4, POINTER_V4],
  [5, POINTER_V5],
]);

/** The bundled configuration for a prompt version; an unknown version gets the newest bundled one. */
export function pointerConfigFor(version: number): PointerConfig {
  const exact = POINTER_CONFIGS.get(version);
  if (exact) return exact;
  const newest = Math.max(...POINTER_CONFIGS.keys());
  return POINTER_CONFIGS.get(newest) as PointerConfig;
}
