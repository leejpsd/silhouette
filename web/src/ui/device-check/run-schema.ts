// The run-file schema of the on-device check (shared/schemas/device-check-run.v3.json) and a small
// validator for the part of JSON Schema it uses: type, const, enum, required, properties,
// additionalProperties, items, minimum and $ref to #/$defs. A file that does not validate is not shown.
import runSchema from '../../../../shared/schemas/device-check-run.v3.json';

type Schema = {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly additionalProperties?: boolean | Schema;
  readonly items?: Schema;
  readonly $defs?: Readonly<Record<string, Schema>>;
};

const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

/** Problems of `value` against `schema` (empty: it validates). Paths only, never values. */
export function validateAgainst(schema: Schema, value: unknown, root: Schema = schema, path = '$'): string[] {
  if (schema.$ref) return validateAgainst(root.$defs?.[schema.$ref.replace('#/$defs/', '')] ?? {}, value, root, path);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return [`${path}: expected ${types.join(' or ')}`];
  }
  const problems: string[] = [];
  if ('const' in schema && value !== schema.const) problems.push(`${path}: not ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path}: not one of the allowed values`);
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) problems.push(`${path}: below ${schema.minimum}`);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in object)) problems.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(object)) {
      const sub = schema.properties?.[key];
      if (sub) problems.push(...validateAgainst(sub, v, root, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}: unexpected ${key}`);
      else if (typeof schema.additionalProperties === 'object') problems.push(...validateAgainst(schema.additionalProperties, v, root, `${path}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => problems.push(...validateAgainst(schema.items as Schema, v, root, `${path}[${i}]`)));
  return problems;
}

/** Problems of a run file against shared/schemas/device-check-run.v3.json. */
export const runFileProblems = (value: unknown): string[] => validateAgainst(runSchema as unknown as Schema, value);
