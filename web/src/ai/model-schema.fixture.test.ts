// Runs the model schema fixture against src/ai/model-schema.ts.
// Default location: shared/fixtures/conformance/model-schema.json. SILHOUETTE_MODEL_SCHEMA_DIR may
// point at a directory holding model-schema.json instead. Skipped when neither is present.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toModelSchema, type ModelSchemaOptions } from './model-schema';

const dir = process.env['SILHOUETTE_MODEL_SCHEMA_DIR'];
const path = dir ? join(dir, 'model-schema.json') : fileURLToPath(new URL('../../../shared/fixtures/conformance/model-schema.json', import.meta.url));
const present = existsSync(path);

interface Fixture {
  cases: { id: string; schema: Record<string, unknown>; options: ModelSchemaOptions; expected?: unknown; expectedError?: boolean }[];
}

describe.skipIf(!present)('model schema fixture', () => {
  const fixture: Fixture = present ? (JSON.parse(readFileSync(path, 'utf8')) as Fixture) : { cases: [] };
  for (const c of fixture.cases) {
    it(c.id, () => {
      if (c.expectedError) expect(() => toModelSchema(c.schema, c.options)).toThrow();
      else expect(JSON.stringify(toModelSchema(c.schema, c.options))).toBe(JSON.stringify(c.expected));
    });
  }
});
