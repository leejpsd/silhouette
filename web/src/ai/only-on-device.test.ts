// The person's own data never reaches the cloud through an ONLY_ON_DEVICE task, whatever the browser:
// Firebase AI Logic 3.1 sends such a request to the cloud when there is no `LanguageModel` global, so
// each task refuses before any SDK call unless the on-device model is there and available.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { Raw } from '../core/types';
import { setModelProviderForTests } from './model-port';
import { askFreeText, explainPersonal, readPhoto, type PersonalResult } from './on-device';
import { setDeviceModelForTests, type FakeAvailability } from './device-fake';

const canary = JSON.parse(readFileSync(new URL('../../../shared/fixtures/canary/paystub-canary-01.json', import.meta.url), 'utf8')) as { canaries: string[] };
const secret = canary.canaries.join(' ');
const result: PersonalResult = { locale: 'en', programName: 'Test Food Help', facts: secret, verdictLabel: 'Probably not', verdict: 'unlikely', criteriaLines: secret };

afterEach(() => {
  setDeviceModelForTests('absent');
  setModelProviderForTests(null);
});

describe('ONLY_ON_DEVICE tasks refuse before any SDK call without a ready on-device model', () => {
  for (const availability of ['absent', 'unavailable', 'downloadable', 'downloading'] as FakeAvailability[]) {
    it(`LanguageModel ${availability}: no model is built, nothing is sent, a typed error`, async () => {
      setDeviceModelForTests(availability);
      let built = 0;
      setModelProviderForTests(async () => {
        built++;
        return { generateContent: async () => ({ response: { text: () => secret } }) };
      });
      const calls = [
        readPhoto(Raw.of<Blob>(new Blob([secret], { type: 'image/png' })), 'paystub', 'en'),
        explainPersonal(Raw.of(result)),
        askFreeText(Raw.of(secret), Raw.of(result)),
      ];
      for (const call of calls) await expect(call).rejects.toMatchObject({ kind: 'on-device-unavailable' });
      expect(built).toBe(0);
    });
  }

  it('with the model available they run on the device', async () => {
    setDeviceModelForTests('available');
    setModelProviderForTests(async () => ({ generateContent: async () => ({ response: { text: () => 'ok', inferenceSource: 'on_device' } }) }));
    await expect(explainPersonal(Raw.of(result))).resolves.toMatchObject({ inferenceSource: 'ON_DEVICE' });
  });
});
