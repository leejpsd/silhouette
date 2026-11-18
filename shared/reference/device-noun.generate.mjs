// Writes fixtures/copy/device-noun.json: every copy string that iOS or Android shows differently
// from the plain text, by the rule in copy/PLATFORM_VARIANTS.md ("The device noun").
import fs from 'node:fs';
import { forPlatform } from './device-noun.mjs';

const OTHER = { ios: /\.(web|android)$/, android: /\.(web|ios)$/ };

export function build() {
  const out = { version: 1, cases: [] };
  for (const language of ['en', 'es']) {
    const copy = JSON.parse(fs.readFileSync(new URL(`../copy/${language}.json`, import.meta.url), 'utf8'));
    for (const platform of ['ios', 'android']) {
      for (const [key, text] of Object.entries(copy)) {
        if (typeof text !== 'string' || OTHER[platform].test(key)) continue;
        const shown = forPlatform(text, language, platform);
        if (shown !== text) out.cases.push({ language, platform, key, text, shown });
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = new URL('../fixtures/copy/device-noun.json', import.meta.url);
  fs.writeFileSync(target, `${JSON.stringify(build(), null, 2)}\n`);
  console.log(`device-noun: ${build().cases.length} cases`);
}
