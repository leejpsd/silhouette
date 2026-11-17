// The on-device check (validation/DEVICE_CHECK.md) and the judges' prepared household: the fixtures
// are reproduced by the reference implementation (conformance.test.mjs); these tests state the
// properties a platform relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../cases.mjs';
import * as d from '../device-check.mjs';

const fixture = readJson('../fixtures/conformance/device-check.json');
const runSchema = readJson('../schemas/device-check-run.v3.json');
const header = { kind: 'silhouette-device-check', date: '2026-11-17T10:00:00.000Z', browser: 'Silhouette 1.0', platform: 'iOS 26.5', userAgent: 'Silhouette/1.0', availability: {}, jurisdiction: 'us-ca' };

test('recorded run files and the made-up runs validate against the run-file schema', () => {
  for (const path of fixture.validRuns) assert.deepEqual(d.validate(runSchema, readJson(`../${path}`)), [], path);
  for (const run of fixture.runs) assert.deepEqual(d.validate(runSchema, { ...header, version: run.version, cases: run.cases }), [], run.id);
  // A phone's run with the optional device block.
  const phone = { ...header, version: 3, device: { platform: 'ios', os: 'iOS', osVersion: '26.5', model: 'iPhone18,1', onDeviceModel: 'Apple Foundation Models', sdk: 'Firebase AI Logic 12.19.3', appVersion: '1.0' }, cases: [] };
  assert.deepEqual(d.validate(runSchema, phone), []);
});

test('the schema refuses what is not a run file', () => {
  assert.ok(d.validate(runSchema, { ...header, version: 4, cases: [] }).length > 0);
  assert.ok(d.validate(runSchema, { ...header, kind: 'other', version: 3, cases: [] }).length > 0);
  assert.ok(d.validate(runSchema, { ...header, version: 3, cases: [{ id: 'a', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'SOMEWHERE', latencyMs: 1, outputCheck: null }] }).length > 0);
  assert.ok(d.validate(runSchema, { ...header, version: 3, cases: [], extra: true }).length > 0);
});

test('scoring is by value: right, not found and wrong yearly-income inputs, and wrong values that reach the person', () => {
  const by = Object.fromEntries(fixture.readings.map((r) => [r.id, r.expected]));
  assert.deepEqual(by['sample-right'].fields, { correct: 12, total: 12 });
  assert.deepEqual(by['sample-ytd-from-regular-line'].incomeInputs.wrong, ['ytdGross']);
  assert.deepEqual(by['sample-ytd-not-found'].incomeInputs.notFound, ['ytdGross']);
  assert.deepEqual(by['sample-ytd-not-found'].wrongFields, []);
  // A name left out is not found, never wrong; a short deductions list is wrong.
  assert.equal(by['sample-deductions-short-names-not-read'].statuses.employerName, 'missing');
  assert.deepEqual(by['sample-deductions-short-names-not-read'].wrongFields, ['deductions']);
});

test('a version 3 run counts where each case was finally answered; earlier versions read the same way', () => {
  const by = Object.fromEntries(fixture.runs.map((r) => [r.id, r.expected]));
  assert.equal(by['version-3-made-up'].onDevice, 4);
  assert.equal(by['version-3-made-up'].inCloudAfterDevice, 1);
  assert.deepEqual(by['version-3-made-up'].income, { allRight: 2, notFound: 1, wrong: 1 });
  assert.equal(by['version-2-made-up'].onDevice, 1);
  assert.equal(by['version-2-made-up'].inCloudAfterDevice, 1);
  assert.equal(by['version-1-made-up'].onDevice, 1);
});

test('file names: UTC date and time, the client and its major version, the platform', () => {
  for (const n of fixture.fileNames) assert.match(n.expected, /^device-check-\d{4}-\d{2}-\d{2}T\d{4}-[a-z0-9]+-[a-z0-9]+\.json$/);
});

test('the judges household: two tax credits become "may qualify" with the sample paystub; CalFresh still depends on the unanswered question', () => {
  const h = readJson('../fixtures/conformance/judges-household.json');
  const verdict = (side, id) => h[side].expected.find((v) => v.programId === id);
  assert.equal(h.paystub.annualIncome, 29233);
  for (const id of ['caleitc', 'yctc']) {
    assert.equal(verdict('before', id).verdict, 'maybe');
    assert.equal(verdict('after', id).verdict, 'likely');
  }
  assert.equal(verdict('after', 'calfresh').verdict, 'depends');
  assert.equal(verdict('after', 'fera').verdict, 'unlikely');
  assert.ok(verdict('after', 'federal-eitc').estimatedAmount > 0);
});
