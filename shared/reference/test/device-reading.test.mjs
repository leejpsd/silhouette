// The on-device reading (validation/DEVICE_READING.md): the fixture is reproduced by the reference
// implementation (conformance.test.mjs), and these tests state the properties the fixture must show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../cases.mjs';
import * as d from '../device-reading.mjs';
import { rightReadings } from '../device-reading.cases.mjs';

const fixture = readJson('../fixtures/conformance/device-reading.json');
const schema = readJson('../schemas/pointer.paystub.json');
const J = fixture.jurisdiction;
const doc = (id) => fixture.documents[id];

test('every check case is reproduced from the fixture alone', () => {
  for (const c of fixture.checks) {
    const { skeleton, map } = doc(c.document);
    assert.deepEqual(d.coreProblems(schema, c.pointers, skeleton, map, J), c.expected.core, `${c.id} core`);
    assert.deepEqual(d.deductionsProblems(schema, c.pointers, map, J), c.expected.deductions, `${c.id} deductions`);
    assert.deepEqual(d.notReadFields(c.pointers, skeleton), c.expected.notRead, `${c.id} not read`);
    assert.equal(d.ytdMissingWithCandidate(schema, c.pointers, skeleton, map, J), c.expected.ytdMissingWithCandidate, `${c.id} trigger`);
  }
});

test('every reading case is reproduced from the fixture alone', () => {
  for (const c of fixture.readings) {
    const { skeleton, map } = doc(c.document);
    const r = d.readOnDevice(schema, skeleton, map, J, c.answers);
    assert.deepEqual(r.asked, c.expected.asked, c.id);
    assert.equal(r.outcome, c.expected.outcome, c.id);
    if (r.outcome === 'on-device') {
      assert.deepEqual(r.value, c.expected.value, c.id);
      assert.deepEqual(r.notRead, c.expected.notRead, c.id);
    } else assert.deepEqual(r.problems, c.expected.problems, c.id);
  }
});

test('no false alarm on any right reading of the 38 English evaluation paystubs', () => {
  assert.equal(fixture.gold.cases.length, 38);
  let readings = 0;
  for (const g of fixture.gold.cases) {
    const { skeleton, map } = doc(g.document);
    for (const r of rightReadings(g)) {
      readings++;
      assert.deepEqual(d.coreProblems(schema, r, skeleton, map, J), [], `${g.document} core`);
      assert.deepEqual(d.notReadFields(r, skeleton).problems, [], `${g.document} not read`);
    }
    for (const [field, runs] of Object.entries(g.names)) for (const ids of runs) assert.deepEqual(d.incompleteNameProblems({ [field]: ids }, skeleton), [], `${g.document} ${field}`);
    assert.deepEqual(g.expected.problems, []);
  }
  assert.equal(readings, fixture.gold.cases.reduce((a, g) => a + g.expected.readings, 0));
});

test('a year to date left out asks again only where the document has exactly one place for it', () => {
  const never = fixture.gold.cases.filter((g) => !g.expected.ytdMissingWhenLeftOut.some(Boolean)).map((g) => g.document);
  // en-l03: no year to date at all; en-l08: a year-to-date block where gross and net both fit.
  assert.deepEqual(never, ['en-l03-1', 'en-l03-2', 'en-l03-3', 'en-l08-1', 'en-l08-2', 'en-l08-3']);
});

test('the real mistakes recorded on the device are caught', () => {
  const by = Object.fromEntries(fixture.checks.map((c) => [c.id, c.expected]));
  for (const id of ['real-run3-sample-ytd-regular-line', 'real-run3-l01-ytd-regular-line', 'real-run3-l07-ytd-holiday-line']) assert.ok(by[id].core.includes('ytdGross:not-on-gross-line'), id);
  assert.ok(by['real-run3-l10-names-shared'].notRead.fields.includes('employeeName'));
  assert.equal(by['real-run4-sample-ytd-left-out'].ytdMissingWithCandidate, true);
  assert.equal(by['real-run4-l01-ytd-left-out'].ytdMissingWithCandidate, true);
  assert.deepEqual(by['real-run4-l07-hours-on-gross'].notRead.fields, ['hoursWorked']);
  assert.ok(by['real-run5-sample-employer-cut-short'].notRead.fields.includes('employerName'));
  assert.deepEqual(by['real-run5-l07-names-cut-short'].notRead.fields, ['employerName', 'employeeName']);
});

test('the constraint of each part: no other keys, every key required, placeholder kinds of this silhouette', () => {
  for (const c of fixture.constraints) {
    assert.equal(c.expected.additionalProperties, false);
    assert.deepEqual(c.expected.required, Object.keys(c.expected.properties));
  }
  const core = fixture.constraints.find((c) => c.part === 'core').expected;
  const ids = d.placeholderIds(doc('sample').skeleton);
  assert.deepEqual(core.properties.employerName.items.enum, ids.W);
  assert.deepEqual(core.properties.payDate.enum, [...ids.D, null]);
  assert.deepEqual(core.properties.grossPay.enum, [...ids.N, null]);
});
