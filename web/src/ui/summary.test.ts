// The line under the count in "Leaving your device": what carried something of the person's, apart
// from checks and general questions that carry nothing of theirs; the two add up to the count.
import { describe, expect, it } from 'vitest';
import { summaryParts } from './Chrome';
import type { OutboundEntry } from '../data/outbound';

const entry = (channel: OutboundEntry['channel'], fields: string[]): OutboundEntry => ({ id: `${channel}${fields.join()}`, channel, at: 1, destination: 'h', path: '/', fields, bytes: 0, status: 'sent' });

describe('the summary of what left', () => {
  it('a first cloud reading: one with the silhouette, the rest technical checks', () => {
    const left = [entry('recaptcha', ['recaptcha-check']), entry('recaptcha', ['recaptcha-check']), entry('app-check', ['app-check-token-request']), entry('ai-cloud', ['document-silhouette']), entry('remote-config', ['installation']), entry('remote-config', ['remote-config'])];
    expect(summaryParts(left)).toEqual({ personal: 1, documentOnly: true, other: 5, otherTechnicalOnly: true });
  });

  it('a general explanation carries nothing of the person: counted with the checks, as a general question', () => {
    expect(summaryParts([entry('ai-cloud', ['program-facts', 'prepared-question']), entry('app-check', ['app-check-token-request'])])).toEqual({ personal: 0, documentOnly: true, other: 2, otherTechnicalOnly: false });
    expect(summaryParts([entry('ai-cloud', ['profile-silhouette', 'program-facts'])])).toMatchObject({ personal: 1, documentOnly: false });
  });
});
