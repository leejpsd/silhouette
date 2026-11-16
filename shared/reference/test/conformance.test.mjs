import test from 'node:test';
import assert from 'node:assert/strict';
import { build, buildSampleAnswers } from '../generate.mjs';
import * as s from '../silhouette.mjs';
import { read, readJson, allowlist, introducers, skeletonCases, verdictCases } from '../cases.mjs';

test('fixtures on disk match the reference implementation', () => {
  for (const [name, content] of Object.entries(build())) {
    assert.deepEqual(readJson(`../fixtures/conformance/${name}`), JSON.parse(JSON.stringify(content)), name);
  }
});

test('sample answer keys on disk match the reference cases', () => {
  assert.deepEqual(readJson('../samples/answers.json'), JSON.parse(JSON.stringify(buildSampleAnswers())));
});

test('a skeleton never contains a digit or a non-allowlisted word', () => {
  for (const k of skeletonCases) {
    const allow = allowlist(k.locale);
    const { skeleton } = s.skeletonize(k.text, allow, introducers(k.locale), new Set(k.hide ?? []));
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
    const { skeleton, map } = s.skeletonize(k.text, allowlist(k.locale), introducers(k.locale), new Set(k.hide ?? []));
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

test('a definite criterion state from the silhouette agrees with the state from exact answers', () => {
  const bands = readJson('../bands/zz-test.json');
  const pack = readJson('../rulepacks/zz-test/pack.json');
  let compared = 0;
  for (const k of verdictCases) {
    const a = k.answers;
    if (typeof a.annualIncome !== 'number' || a.annualIncome < 0) continue;
    let exact, full;
    try {
      full = s.verdicts(pack, bands, a);
      exact = { jurisdiction: 'zz-test', annualIncome: a.annualIncome };
      if (Number.isInteger(a.householdSize) && a.householdSize >= 1) exact.householdSize = a.householdSize;
      if (typeof a.housing === 'string') exact.housing = a.housing;
      exact = s.generalize(exact, bands);
    } catch { continue; }
    const fromSilhouette = s.silhouetteVerdicts(pack, bands, exact);
    for (const program of fromSilhouette) {
      const onScreen = full.find((v) => v.programId === program.programId);
      for (const criterion of program.criteria) {
        if (criterion.state !== 'pass' && criterion.state !== 'fail') continue;
        const other = onScreen.criteria.find((c) => c.id === criterion.id).state;
        assert.equal(other, criterion.state, `${k.id} ${program.programId} ${criterion.id}`);
        compared++;
      }
    }
  }
  assert.ok(compared > 20, `only ${compared} states compared`);
});

test('the California draft pack passes the linter and reproduces its hand-worked cases', async () => {
  const { lintPack } = await import('../lint.mjs');
  const pack = readJson('../rulepacks/us-ca/pack.json');
  const bands = readJson('../bands/us-ca.json');
  assert.deepEqual(lintPack(pack, bands), []);
  const file = readJson('../rulepacks/us-ca/cases.json');
  let checked = 0;
  for (const k of file.cases) {
    const out = s.verdicts(pack, bands, { ...(file.base ?? {}), ...k.answers });
    for (const [programId, want] of Object.entries(k.expected)) {
      const got = out.find((v) => v.programId === programId);
      assert.equal(got.verdict, want.verdict, `${k.id} ${programId}`);
      if (want.estimatedAmount !== undefined) assert.equal(got.estimatedAmount, want.estimatedAmount, `${k.id} ${programId} amount`);
      checked++;
    }
  }
  assert.equal(checked, 189);
  for (const locale of ['en', 'es', 'ko']) {
    const copy = readJson(`../rulepacks/us-ca/copy/${locale}.json`);
    for (const program of pack.programs) {
      for (const field of ['name', 'summary', 'apply', 'documents', 'office']) {
        assert.ok(typeof copy[`program.${program.id}.${field}`] === 'string', `${locale} program.${program.id}.${field}`);
      }
      assert.ok(program.sources.length > 0 && typeof program.applyUrl === 'string', program.id);
    }
  }
});
