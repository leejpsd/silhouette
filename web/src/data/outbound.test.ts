import { beforeEach, describe, expect, it } from 'vitest';
import { clearOutbound, leftDevice, markSent, outboundState, recordAnsweredOnDevice, recordAttempt, recordRecordedReading } from './outbound';

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

  it('records a recorded on-device reading with its machine and date, kept here and never counted as sent', () => {
    recordRecordedReading({ machine: 'Chrome 157 · Mac', date: 'Nov 17, 2026' }, 3);
    const { entries } = outboundState();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ channel: 'on-device', status: 'answered', bytes: 0, fields: ['kept:recorded'], recording: { machine: 'Chrome 157 · Mac', date: 'Nov 17, 2026' } });
    expect(entries[0]?.body).toBeUndefined();
    expect(leftDevice(entries)).toEqual([]);
  });
});
