// Static routing check (shared/DATA_TYPES.md). Run by `npm run typecheck`.
//
// TypeScript's type system blocks Raw from cloud-capable calls, but an explicit cast or an
// unwrap could launder a value. This AST check forbids, in every file under src/:
//   1. casts (`x as T`, `<T>x`) whose target type mentions Skeleton, Generalized, Public or
//      CloudSafe, except in src/core/types.ts where the brands are defined;
//   2. any reference to `reveal` or `mapRaw` (identifier, import, property or string key)
//      outside src/core/ and src/ai/on-device.ts;
//   3. any reference to `brandSkeleton` outside src/core/{types,skeleton}.ts and to
//      `brandGeneralized` outside src/core/{types,generalize}.ts;
//   4. in src/ai/on-device.ts (the one ai/ file that may unwrap Raw), any inference mode other
//      than ONLY_ON_DEVICE, as an `InferenceMode.X` member or as its string value;
//   5. importing `firebase/ai` outside src/ai/.
// Test files (*.test.ts, *.test-d.ts) never ship and are exempt from rules 2 and 3, so they can
// assert on Raw outputs; rules 1, 4 and 5 still apply to them.
//
// Parser: oxc via rolldown/parseAst (typescript-eslint does not support TypeScript 7).
//
// Known gap: this is a syntactic check, so a cast to a
// type alias of a branded type (`type S = Skeleton; x as S`) is not caught. Code review must
// reject such aliases; the TypeScript types still block Raw from reaching cloud-capable calls.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

const BRANDED_TYPES = new Set(['Skeleton', 'Generalized', 'Public', 'CloudSafe']);
const ON_DEVICE_FILE = 'src/ai/on-device.ts';
const OTHER_MODES = new Set(['PREFER_ON_DEVICE', 'PREFER_IN_CLOUD', 'ONLY_IN_CLOUD', 'prefer_on_device', 'prefer_in_cloud', 'only_in_cloud']);
const RESTRICTED = {
  reveal: (file) => file.startsWith('src/core/') || file === ON_DEVICE_FILE,
  mapRaw: (file) => file.startsWith('src/core/'),
  brandSkeleton: (file) => file === 'src/core/types.ts' || file === 'src/core/skeleton.ts',
  brandGeneralized: (file) => file === 'src/core/types.ts' || file === 'src/core/generalize.ts',
};

function mentionsBrandedType(node) {
  let found = false;
  visit(node, (n) => {
    if (n.type === 'TSTypeReference') {
      const name = n.typeName?.type === 'Identifier' ? n.typeName.name : n.typeName?.right?.name;
      if (BRANDED_TYPES.has(name)) found = true;
    }
  });
  return found;
}

function visit(node, fn) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, fn);
    return;
  }
  if (typeof node.type === 'string') fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'start' && key !== 'end' && value !== null && typeof value === 'object') visit(value, fn);
  }
}

function position(source, offset) {
  const before = source.slice(0, offset).split('\n');
  return `${before.length}:${(before.at(-1)?.length ?? 0) + 1}`;
}

/**
 * @param {string} source File content
 * @param {string} file Path relative to web/, with forward slashes (e.g. "src/ui/App.tsx")
 * @returns {string[]} Violations as "file:line:col message"
 */
export function scan(source, file) {
  const lang = file.endsWith('.tsx') ? 'tsx' : 'ts';
  const ast = parseAst(source, { lang, sourceType: 'module' }, file);
  const typeTest = file.endsWith('.test-d.ts') || file.endsWith('.test.ts');
  const out = [];
  const report = (node, message) => out.push(`${file}:${position(source, node.start)} ${message}`);
  visit(ast, (node) => {
    if ((node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') && file !== 'src/core/types.ts') {
      if (mentionsBrandedType(node.typeAnnotation)) {
        report(node, 'cast to a cloud-safe type (Skeleton/Generalized/Public/CloudSafe); only skeletonize() and generalize() may create them');
      }
    }
    if (node.type === 'ImportDeclaration' && node.source?.value === 'firebase/ai' && !file.startsWith('src/ai/')) {
      report(node, 'firebase/ai may only be imported under src/ai/');
    }
    if (file === ON_DEVICE_FILE) {
      const modeName =
        node.type === 'MemberExpression' && node.property?.type === 'Identifier' ? node.property.name
        : node.type === 'Literal' && typeof node.value === 'string' ? node.value
        : undefined;
      if (modeName !== undefined && OTHER_MODES.has(modeName)) {
        report(node, `${ON_DEVICE_FILE} unwraps Raw, so it may only use InferenceMode.ONLY_ON_DEVICE`);
      }
    }
    if (typeTest) return;
    const name =
      node.type === 'Identifier' ? node.name : node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
    if (name !== undefined && Object.hasOwn(RESTRICTED, name) && !RESTRICTED[name](file)) {
      report(node, `"${name}" may not be used here (Raw must stay wrapped outside src/core/)`);
    }
  });
  return [...new Set(out)];
}

function listSources(dir) {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => join(dir, f));
}

export function scanTree(root) {
  const violations = [];
  for (const path of listSources(join(root, 'src'))) {
    const file = relative(root, path).split(sep).join('/');
    violations.push(...scan(readFileSync(path, 'utf8'), file));
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const violations = scanTree(root);
  if (violations.length) {
    console.error(`check-routing: ${violations.length} violation(s)\n${violations.join('\n')}`);
    process.exit(1);
  }
  console.log('check-routing: ok');
}
