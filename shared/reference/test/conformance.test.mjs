import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../generate.mjs';
import * as s from '../silhouette.mjs';
import { read, readJson, allowlist, introducers, skeletonCases } from '../cases.mjs';

test('fixtures on disk match the reference implementation', () => {
  for (const [name, content] of Object.entries(build())) {
    assert.deepEqual(readJson(`../fixtures/conformance/${name}`), JSON.parse(JSON.stringify(content)), name);
  }
});

test('a skeleton never contains a digit or a non-allowlisted word', () => {
  for (const k of skeletonCases) {
    const allow = allowlist(k.locale);
    const { skeleton } = s.skeletonize(k.text, allow, introducers(k.locale));
    const stripped = skeleton.replace(/⟦[DNW][0-9]+⟧/g, '');
    assert.doesNotMatch(stripped, /[0-9]/, `${k.id}: digit survived`);
    // Whatever survives is either an explicitly safe character or part of an allowlisted word.
    const safe = new RegExp(`[${s.SAFE_CLASS}]`, 'u');
    for (const word of stripped.split(new RegExp(`[${s.SAFE_CLASS}]+`, 'u')).filter(Boolean)) {
      assert.ok(allow.has(word.toLowerCase()), `${k.id}: "${word}" survived but is not allowlisted`);
    }
    for (const ch of stripped) assert.ok(safe.test(ch) || /[\p{L}\p{M}]/u.test(ch), `${k.id}: U+${ch.codePointAt(0).toString(16)} survived`);
  }
});

test('skeleton + map reconstruct the normalized input exactly', () => {
  for (const k of skeletonCases) {
    const { skeleton, map } = s.skeletonize(k.text, allowlist(k.locale), introducers(k.locale));
    assert.equal(skeleton.replace(/⟦([DNW][0-9]+)⟧/g, (_, id) => map[id]), s.normalize(k.text), k.id);
  }
});

test('canary strings never appear in the skeleton', () => {
  const canary = readJson('../fixtures/canary/paystub-canary-01.json');
  const { skeleton } = s.skeletonize(read(`../fixtures/canary/${canary.document}`), allowlist(canary.locale), introducers(canary.locale));
  for (const value of canary.canaries) assert.ok(!skeleton.includes(value), `leaked: ${value}`);
});

test('the generalized profile carries no exact value', () => {
  const bands = readJson('../bands/zz-test.json');
  const exact = { jurisdiction: 'zz-test', annualIncome: 30524.9, householdSize: 3, childAges: [4, 9], county: 'testshire', housing: 'renter' };
  const payload = s.canonical(s.generalize(exact, bands));
  assert.ok(!payload.includes('30524'));
  assert.deepEqual(Object.keys(JSON.parse(payload)), ['jurisdiction', 'incomeBand', 'householdSize', 'childAgeBands', 'county', 'housing']);
});

test('allowlists pass the linter', async () => {
  const { lintAllowlist } = await import('../lint.mjs');
  for (const locale of ['en', 'es', 'ko']) assert.deepEqual(lintAllowlist(readJson(`../skeleton/allowlist/${locale}.json`)), [], locale);
  assert.match(lintAllowlist({ words: ['Gross'] }).join(), /not lowercase/);
  assert.match(lintAllowlist({ words: ['stra\u00DFe'] }).join(), /case mapping/);
  assert.match(lintAllowlist({ words: ['401k'] }).join(), /other than letters/);
});

test('the synthetic pack passes the linter and bad packs are caught', async () => {
  const { lintPack } = await import('../lint.mjs');
  const bands = readJson('../bands/zz-test.json');
  const pack = readJson('../rulepacks/zz-test/pack.json');
  assert.deepEqual(lintPack(pack, bands), []);
  const broken = (edit) => { const copy = structuredClone(pack); edit(copy); return lintPack(copy, bands).join('\n'); };
  assert.match(broken((p) => { p.programs[0].criteria[1].requires = ['annualIncome']; }), /reads "numChildren" but does not list it/);
  assert.match(broken((p) => { p.programs[1].criteria[0].requires = ['annualIncome']; }), /reads householdSizeCapped/);
  assert.match(broken((p) => { p.programs[0].criteria[0].logic = { between: [1, 2] }; }), /unsupported operator/);
  assert.match(broken((p) => { p.programs[0].criteria[0].logic = { '+': [{ var: 'annualIncome' }, 1] }; }), /does not return a boolean/);
  assert.match(broken((p) => { p.questions.push({ id: 'constructor', type: 'int', sensitive: false }); }), /malformed or reserved/);
  assert.match(broken((p) => { delete p.constants; }), /constants must be an object/);
  assert.match(broken((p) => { p.programs[0].criteria[0] = { id: 'has-earnings', requires: ['annualIncome'], logic: { '>': [{ var: 'annualIncome' }, 0] } }; }), /compares annualIncome with 0/);
  assert.match(broken((p) => { p.questionOrder = ['householdSize']; }), /questionOrder must list/);
  assert.match(broken((p) => { delete p.questions[0].min; }), /need integer min and max/);
  const gap = structuredClone(bands); gap.annualIncome[1].min = 16000;
  assert.match(lintPack(pack, gap).join('\n'), /does not start right after/);
});
