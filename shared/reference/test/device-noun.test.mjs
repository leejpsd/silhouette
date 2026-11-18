import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { forPlatform, lookup } from '../device-noun.mjs';
import { build } from '../device-noun.generate.mjs';

const read = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));

test('the fixture is what the rule produces from the current copy', () => {
  assert.deepEqual(read('../../fixtures/copy/device-noun.json'), build());
});

test('the web shows every string unchanged', () => {
  for (const language of ['en', 'es']) {
    for (const text of Object.values(read(`../../copy/${language}.json`))) {
      assert.equal(forPlatform(text, language, 'web'), text);
    }
  }
});

test('placeholders, compounds and longer words are left alone', () => {
  assert.equal(forPlatform('Hidden on this device: {numbers} numbers', 'en', 'ios'), 'Hidden on this iPhone: {numbers} numbers');
  assert.equal(forPlatform('the on-device model on this device', 'en', 'android'), 'the on-device model on this phone');
  assert.equal(forPlatform('{this device} stays', 'en', 'ios'), '{this device} stays');
  assert.equal(forPlatform('this devices', 'en', 'ios'), 'this devices');
  assert.equal(forPlatform('Device first, cloud if needed', 'en', 'ios'), 'Device first, cloud if needed');
  assert.equal(forPlatform('Este dispositivo y el modelo del dispositivo', 'es', 'android'), 'Este teléfono y el modelo del dispositivo');
});

test('the rule is stable when applied twice', () => {
  for (const c of read('../../fixtures/copy/device-noun.json').cases) {
    assert.equal(forPlatform(c.shown, c.language, c.platform), c.shown, `${c.language} ${c.platform} ${c.key}`);
  }
});

test('after the rule, no iOS or Android string says "this device" or names the other platform', () => {
  for (const language of ['en', 'es']) {
    const copy = read(`../../copy/${language}.json`);
    for (const [platform, other, wrong] of [['ios', /\.(web|android)$/, /this (device|phone)\b|este (dispositivo|teléfono)/i],
      ['android', /\.(web|ios)$/, /this device\b|iPhone|este dispositivo/i]]) {
      for (const [key, text] of Object.entries(copy)) {
        if (typeof text !== 'string' || other.test(key)) continue;
        assert.doesNotMatch(forPlatform(text, language, platform), wrong, `${language} ${platform} ${key}`);
      }
    }
  }
});

test('a platform reads its own variant when there is one', () => {
  const copy = { 'a.ios': 'A on iPhone', 'a.web': 'A in the browser', b: 'B' };
  assert.equal(lookup(copy, 'a', 'ios'), 'A on iPhone');
  assert.equal(lookup(copy, 'b', 'ios'), 'B');
});

test('every .one key has its plain key with the same placeholders, in every language', () => {
  const holes = (text) => [...text.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(' ');
  for (const language of ['en', 'es', 'ko']) {
    const copy = read(`../../copy/${language}.json`);
    for (const [key, text] of Object.entries(copy)) {
      if (!key.endsWith('.one')) continue;
      const plain = copy[key.slice(0, -4)];
      assert.equal(typeof plain, 'string', `${language} ${key}: no plain key`);
      assert.equal(holes(text), holes(plain), `${language} ${key}`);
      assert.match(text, /\{count\}/, `${language} ${key}`);
    }
  }
});

