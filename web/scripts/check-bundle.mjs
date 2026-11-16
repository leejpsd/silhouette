// Checks a production build (default: dist/) before it is hosted:
// - no App Check debug-token code path of this app (the module that sets the debug token, the name of
//   its variable);
// - no value from any local environment file (.env.local, .env.*.local) anywhere in the output.
// Prints only file names and which rule failed, never a value.
//   node scripts/check-bundle.mjs [dist]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = resolve(ROOT, process.argv[2] ?? 'dist');

const FORBIDDEN = ['VITE_APPCHECK_DEBUG_TOKEN', 'enableAppCheckDebugToken', 'appcheck-debug'];

/** Values of every local env file (KEY=value lines), at least 8 characters long. */
function localValues() {
  const values = [];
  for (const name of readdirSync(ROOT)) {
    if (!/^\.env(\..+)?\.local$/.test(name)) continue;
    for (const line of readFileSync(join(ROOT, name), 'utf8').split('\n')) {
      const m = /^\s*[A-Z0-9_]+\s*=\s*(.*?)\s*$/.exec(line);
      const value = m?.[1]?.replace(/^["']|["']$/g, '');
      // The reCAPTCHA site key is public by design and is meant to be in the bundle.
      if (value && value.length >= 8 && !/^\s*VITE_RECAPTCHA_SITE_KEY\s*=/.test(line)) values.push(value);
    }
  }
  return values;
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

export function checkBundle(out = OUT) {
  if (!existsSync(out)) return [`${out} does not exist: build first`];
  const problems = [];
  const secrets = localValues();
  for (const file of files(out)) {
    const text = readFileSync(file, 'latin1');
    for (const word of FORBIDDEN) if (text.includes(word)) problems.push(`${file.slice(out.length + 1)}: contains the debug-token code path (${word})`);
    if (secrets.some((v) => text.includes(v))) problems.push(`${file.slice(out.length + 1)}: contains a value from a local env file`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkBundle();
  if (problems.length > 0) {
    console.error(`check-bundle: ${problems.length} problem(s)\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('check-bundle: ok');
}
