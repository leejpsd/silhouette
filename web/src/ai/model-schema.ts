// Turns a shared pointer schema (JSON Schema with $ref/$defs, oneOf and x-kind annotations,
// shared/schemas/pointer.*.json) into the schema subset that both Firebase AI Logic
// (`responseSchema`) and Chrome's Prompt API (`responseConstraint`) accept. Deterministic:
// $ref inlined, oneOf → anyOf, enum-only fields typed as string, and the keywords that are
// only meaningful to our own Rehydrator ($id, $defs, x-kind, additionalProperties, pattern)
// removed. The Rehydrator re-validates everything, so dropping `pattern` costs no safety.

type JsonObject = { readonly [key: string]: unknown };

const DROP = new Set(['$id', '$schema', '$comment', '$defs', 'x-kind', 'additionalProperties', 'pattern']);

function resolve(root: JsonObject, ref: string): JsonObject {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    node = node !== null && typeof node === 'object' ? (node as JsonObject)[part] : undefined;
  }
  if (node === null || typeof node !== 'object') throw new Error(`Unresolved $ref: ${ref}`);
  return node as JsonObject;
}

function convert(node: unknown, root: JsonObject, depth: number): unknown {
  if (depth > 32) throw new Error('Schema too deep or recursive');
  if (Array.isArray(node)) return node.map((n) => convert(n, root, depth + 1));
  if (node === null || typeof node !== 'object') return node;
  const obj = node as JsonObject;
  if (typeof obj['$ref'] === 'string') {
    const { $ref: _ref, ...rest } = obj;
    void _ref;
    return convert({ ...resolve(root, obj['$ref']), ...rest }, root, depth + 1);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DROP.has(key)) continue;
    const target = key === 'oneOf' ? 'anyOf' : key;
    out[target] = key === 'properties'
      ? Object.fromEntries(Object.entries(value as JsonObject).map(([k, v]) => [k, convert(v, root, depth + 1)]))
      : convert(value, root, depth + 1);
  }
  if (Array.isArray(out['enum']) && out['type'] === undefined) out['type'] = 'string';
  return out;
}

export interface ModelSchemaOptions {
  /**
   * Every top-level property becomes required and nullable, so the model must answer each field
   * (null when the document does not have it) instead of silently leaving fields out.
   */
  readonly requiredNullable?: boolean;
  /** How "nullable" is written: OpenAPI (`nullable: true`) or JSON Schema (`type: [t, "null"]`). */
  readonly dialect?: 'openapi' | 'jsonschema';
}

function nullableJsonSchema(prop: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(prop['anyOf'])) return { ...prop, anyOf: [...(prop['anyOf'] as unknown[]), { type: 'null' }] };
  const out: Record<string, unknown> = { ...prop, type: [prop['type'], 'null'] };
  if (Array.isArray(prop['enum'])) out['enum'] = [...(prop['enum'] as unknown[]), null];
  return out;
}

export function toModelSchema(schema: JsonObject, options: ModelSchemaOptions = {}): Record<string, unknown> {
  const out = convert(schema, schema, 0) as Record<string, unknown>;
  if (!options.requiredNullable) return out;
  const props = out['properties'] as Record<string, Record<string, unknown>>;
  const dialect = options.dialect ?? 'openapi';
  out['properties'] = Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, dialect === 'openapi' ? { ...v, nullable: true } : nullableJsonSchema(v)]),
  );
  out['required'] = Object.keys(props);
  return out;
}
