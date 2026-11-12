// Reference: derive the model schema from a pointer schema (schemas/pointer.*.json).
// Zero dependencies. See MODEL_SCHEMA.md. Every platform must produce the same object (compare
// with JSON serialization, key order included).

const DROP = new Set(['$id', '$schema', '$comment', '$defs', 'x-kind', 'additionalProperties', 'pattern']);

function resolve(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  let node = root;
  for (const part of ref.slice(2).split('/')) node = node !== null && typeof node === 'object' ? node[part] : undefined;
  if (node === null || typeof node !== 'object') throw new Error(`Unresolved $ref: ${ref}`);
  return node;
}

function convert(node, root, depth) {
  if (depth > 32) throw new Error('Schema too deep or recursive');
  if (Array.isArray(node)) return node.map((n) => convert(n, root, depth + 1));
  if (node === null || typeof node !== 'object') return node;
  if (typeof node.$ref === 'string') {
    const { $ref, ...rest } = node;
    return convert({ ...resolve(root, $ref), ...rest }, root, depth + 1);
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROP.has(key)) continue;
    const target = key === 'oneOf' ? 'anyOf' : key;
    out[target] =
      key === 'properties'
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v, root, depth + 1)]))
        : convert(value, root, depth + 1);
  }
  if (Array.isArray(out.enum) && out.type === undefined) out.type = 'string';
  return out;
}

function nullableJsonSchema(prop) {
  if (Array.isArray(prop.anyOf)) return { ...prop, anyOf: [...prop.anyOf, { type: 'null' }] };
  const out = { ...prop, type: [prop.type, 'null'] };
  if (Array.isArray(prop.enum)) out.enum = [...prop.enum, null];
  return out;
}

/**
 * @param {object} schema pointer schema
 * @param {{requiredNullable?: boolean, dialect?: 'openapi'|'jsonschema'}} [options]
 */
export function toModelSchema(schema, options = {}) {
  const out = convert(schema, schema, 0);
  if (!options.requiredNullable) return out;
  const dialect = options.dialect ?? 'openapi';
  const props = out.properties;
  out.properties = Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, dialect === 'openapi' ? { ...v, nullable: true } : nullableJsonSchema(v)]),
  );
  out.required = Object.keys(props);
  return out;
}
