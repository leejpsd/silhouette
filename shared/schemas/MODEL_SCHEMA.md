# Model schema derivation (v1)

A pointer schema (`schemas/pointer.*.json`) annotates fields with `x-kind` and uses `$ref`, `$defs`, `oneOf`, `pattern` and `additionalProperties`. Model APIs accept a smaller schema language. The **model schema** is derived from the pointer schema deterministically.

Every platform derives the identical object for its cloud model and for its on-device model. Where a platform's on-device API has no schema parameter (Android's on-device request takes text and images only), the on-device schema object is serialized as JSON and appended to the prompt text after the line `Answer with JSON that matches this schema:`. The reply is untrusted either way and goes through the same validation and rehydration (`skeleton/SPEC.md` section 5).

Where a schema parameter exists, the object is passed as:

- Firebase AI Logic: `generationConfig.responseJsonSchema` or `responseSchema`;
- Chrome: `promptOptions.responseConstraint`;
- Android and iOS: the platform equivalents.

The Rehydrator keeps validating every pointer against the pointer schema, so nothing dropped here weakens safety.

The derivation applies these steps:

1. **Resolve references.** Every `$ref` of the form `#/...` is replaced by the referenced node. Sibling keys of the `$ref` are kept and override keys of the referenced node. The result is resolved again, so reference chains are followed. Any other `$ref`, a reference that does not resolve, or nesting deeper than 32 levels is an error.
2. **Drop keywords.** These keywords are removed at every level: `$id`, `$schema`, `$comment`, `$defs`, `x-kind`, `additionalProperties` and `pattern`.
3. **Rename.** `oneOf` is renamed to `anyOf`.
4. **Type enums.** A node with `enum` and no `type` gets `type: "string"`, added after its existing keys.
5. **Keep everything else.** Key order is preserved.

**Required and nullable.** This is optional and applies to the top-level `properties` only. Every top-level property becomes required: `required` is set to the property names in order, added after the existing keys. Each top-level property also becomes nullable, so the model must state "not in the document" as `null` instead of leaving a field out. The nullable form depends on the dialect:

| Dialect | Plain node | Node with `anyOf` | Node with `enum` |
|---|---|---|---|
| `openapi` | `nullable: true` added | `nullable: true` added | `nullable: true` added |
| `jsonschema` | `type` becomes `[type, "null"]` | `{ "type": "null" }` appended to `anyOf` | `type` becomes `[type, "null"]` and `null` appended to `enum` |

Use the `jsonschema` dialect where the same object must also serve as a JSON Schema constraint (Chrome's Prompt API).

Fixture: `model-schema.json` (input schema, options → expected model schema). Compare outputs by JSON serialization, key order included.
