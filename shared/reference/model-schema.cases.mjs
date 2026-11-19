// Cases for the model schema derivation. generate.mjs writes model-schema.json (input → expected).
import { readFileSync } from 'node:fs';

const shared = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));
const paystub = shared('schemas/pointer.paystub.json');
const lease = shared('schemas/pointer.lease.json');
const w2 = shared('schemas/pointer.w2.json');

export const cases = [
  { id: 'paystub-default', schema: paystub, options: {} },
  { id: 'paystub-required-nullable-openapi', schema: paystub, options: { requiredNullable: true, dialect: 'openapi' } },
  { id: 'paystub-required-nullable-jsonschema', schema: paystub, options: { requiredNullable: true, dialect: 'jsonschema' } },
  { id: 'lease-default', schema: lease, options: {} },
  { id: 'lease-required-nullable-jsonschema', schema: lease, options: { requiredNullable: true, dialect: 'jsonschema' } },
  { id: 'w2-required-nullable-openapi', schema: w2, options: { requiredNullable: true, dialect: 'openapi' } },
  { id: 'w2-required-nullable-jsonschema', schema: w2, options: { requiredNullable: true, dialect: 'jsonschema' } },
  {
    id: 'ref-chain-and-sibling-keys',
    schema: {
      type: 'object',
      properties: { a: { $ref: '#/$defs/outer', description: 'sibling key kept' } },
      $defs: { outer: { $ref: '#/$defs/inner' }, inner: { type: 'string', pattern: '^N[0-9]+$' } },
    },
    options: {},
  },
  { id: 'enum-only-gets-string-type', schema: { type: 'object', properties: { f: { 'x-kind': 'enum', enum: ['a', 'b'] } } }, options: {} },
  {
    id: 'one-of-becomes-any-of',
    schema: { type: 'object', properties: { d: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } } },
    options: { requiredNullable: true, dialect: 'jsonschema' },
  },
  { id: 'enum-nullable-jsonschema', schema: { type: 'object', properties: { f: { enum: ['x'] } } }, options: { requiredNullable: true, dialect: 'jsonschema' } },
  {
    id: 'nested-list-items-keep-their-required',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { list: { 'x-kind': 'list', type: 'array', items: { type: 'object', additionalProperties: false, properties: { amount: { type: 'string' } }, required: ['amount'] } } },
    },
    options: { requiredNullable: true, dialect: 'openapi' },
  },
];

export const errorCases = [
  { id: 'external-ref-rejected', schema: { properties: { a: { $ref: 'other.json#/x' } } } },
  { id: 'unresolved-ref-rejected', schema: { properties: { a: { $ref: '#/$defs/missing' } } } },
];
