import { beforeEach, describe, expect, it } from 'vitest';
import { clearOutbound, leftDevice, markSent, outboundState, recordAnsweredOnDevice, recordAttempt } from './outbound';

describe('the record of what left and what stayed', () => {
  beforeEach(() => clearOutbound());

  it('records an answer written on the device without a destination or body, and never counts it as sent', () => {
    const sent = recordAttempt({ channel: 'ai-cloud', at: 1, destination: 'example.test', path: '/x', fields: ['profile-silhouette'], body: '{}', bytes: 2 });
    markSent(sent, 200);
    recordAnsweredOnDevice('about', 2);
    const { entries } = outboundState();
    expect(entries).toHaveLength(2);
    const kept = entries[1]!;
    expect(kept).toMatchObject({ channel: 'on-device', status: 'answered', destination: '', path: '', bytes: 0, fields: ['kept:about'] });
    expect(kept.body).toBeUndefined();
    expect(leftDevice(entries).map((e) => e.id)).toEqual([sent]);
  });
});
