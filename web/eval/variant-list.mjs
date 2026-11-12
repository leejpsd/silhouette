// The evaluated variants. Each entry is a VariantSpec (eval/variants.ts) without its id.
const FLASH_LITE = 'gemini-3.5-flash-lite';
export const VARIANTS = {
  't0': { schemas: 'shared', nullable: false, example: false, lineNumbers: false, model: FLASH_LITE, temperature: 0 },
  v0: { schemas: 'shared', nullable: false, example: false, lineNumbers: false, model: FLASH_LITE },
  v1: { schemas: 'described', nullable: false, example: false, lineNumbers: false, model: FLASH_LITE },
  v2: { schemas: 'shared', nullable: true, example: false, lineNumbers: false, model: FLASH_LITE },
  v3: { schemas: 'described', nullable: true, example: false, lineNumbers: false, model: FLASH_LITE },
  // Same as v2/v3, with the schema written as JSON Schema (type: [t, "null"]) and sent as
  // responseJsonSchema, so one schema object also works as Chrome's responseConstraint.
  v2j: { schemas: 'shared', nullable: true, dialect: 'jsonschema', example: false, lineNumbers: false, model: FLASH_LITE },
  v3j: { schemas: 'described', nullable: true, dialect: 'jsonschema', example: false, lineNumbers: false, model: FLASH_LITE },
  v2jr: { schemas: 'shared', nullable: true, dialect: 'jsonschema', example: false, lineNumbers: false, model: FLASH_LITE },
  v2r: { schemas: 'shared', nullable: true, example: false, lineNumbers: false, model: FLASH_LITE },
  v4: { schemas: 'shared', nullable: true, example: true, lineNumbers: false, model: FLASH_LITE },
  v2t: { schemas: 'shared', nullable: true, example: false, lineNumbers: false, model: FLASH_LITE, thinkingLevel: 'low' },
  v2f: { schemas: 'shared', nullable: true, example: false, lineNumbers: false, model: 'gemini-3.8-flash' },
  // Grammar and lease words that carry no personal data, so the model can see sentence structure.
  v2a: {
    schemas: 'shared', nullable: true, example: false, lineNumbers: false, model: FLASH_LITE,
    extraAllowlist: ['is', 'are', 'be', 'been', 'has', 'have', 'made', 'between', 'shall', 'will', 'with', 'each', 'not', 'than',
      'more', 'persons', 'person', 'pays', 'take', 'home', 'schedule', 'covers', 'through', 'week', 'paid', 'per', 'parties', 'term'],
  },
};
