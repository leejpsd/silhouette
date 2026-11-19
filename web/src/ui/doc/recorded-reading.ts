// routing.json `recordedSample`: in a browser with no on-device model, the bundled sample paystub can be
// read from the on-device model's own recorded answer (a Chrome run bundled with the app), so the reading
// can be seen without sending anything. The values are put back on this device now, as after any reading;
// the result is labelled as a recording, with the machine and the date.
import type { Skeleton } from '../../core/types';
import { isRunFile } from '../device-check/run';
import { RECORDINGS, recordingLabel, recordingMachine, recordingPaths } from '../screens/DeviceCheck';
import { sampleAnswerKey } from './offline-sample';

export interface RecordedReading {
  readonly pointers: Readonly<Record<string, unknown>>;
  readonly path: string;
  readonly machine: string;
  readonly date: string;
}

/** The fields the yearly income is worked out from: the recording must agree with the sample's key on them. */
const CORE = ['grossPay', 'ytdGross', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The newest Chrome recording's on-device answer to this silhouette, when it is the bundled English
 * sample with nothing hidden and the recorded answer passed its checks. Null otherwise.
 */
export async function recordedReading(skeleton: Skeleton, locale?: string): Promise<RecordedReading | null> {
  const key = sampleAnswerKey(skeleton) as Readonly<Record<string, unknown>> | null;
  if (key === null) return null;
  for (const path of recordingPaths().filter((p) => /chrome/.test(p))) {
    const file = await RECORDINGS[path]?.();
    if (!isRunFile(file)) continue;
    const found = file.cases.find((c) => c.task === 'document.pointer.extract' && c.id === 'pointers: bundled sample' && c.ran === 'ON_DEVICE' && c.device?.passed === true);
    if (!found?.device) continue;
    let pointers: unknown;
    try {
      pointers = JSON.parse(found.device.rawText);
    } catch {
      continue;
    }
    if (typeof pointers !== 'object' || pointers === null) continue;
    const answer = pointers as Readonly<Record<string, unknown>>;
    // Recorded for this very silhouette: it points at the same placeholders as the sample's key.
    if (!CORE.every((field) => same(answer[field], key[field]))) continue;
    const label = recordingLabel(path, locale);
    const machine = recordingMachine(path);
    return { pointers: answer, path, machine, date: label.slice(machine.length).replace(/^ · /, '') };
  }
  return null;
}
