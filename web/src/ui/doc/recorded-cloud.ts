// routing.json `recordedCloud`: the bundled sample paystub can be read from a real cloud reading of its
// silhouette, recorded with the exact request body and the response (web/eval/results/cloud-recording/,
// made by web/eval/record-cloud.mjs). The response's placeholder ids are the reading; the values are put
// back on this device now and nothing is sent. The record shows the request exactly as it was sent then.
import type { Skeleton } from '../../core/types';
import { sampleAnswerKey } from './offline-sample';

interface CloudRecordingFile {
  readonly kind: 'silhouette-cloud-recording';
  readonly date: string;
  readonly endpoint: string;
  readonly requestBody: string;
  readonly pointers: Readonly<Record<string, unknown>>;
}

const FILES = import.meta.glob<CloudRecordingFile>('../../../eval/results/cloud-recording/*.json', { eager: true, import: 'default' });

export interface RecordedCloudReading {
  readonly pointers: Readonly<Record<string, unknown>>;
  /** ISO date of the recording. */
  readonly date: string;
  /** The request body as it was sent, formatted. */
  readonly body: string;
  readonly path: string;
  readonly model: string;
  /** The placeholder ids the cloud answered, as JSON. */
  readonly answer: string;
}

/** The fields the yearly income is worked out from: the recording must agree with the sample's key on them. */
const CORE = ['grossPay', 'ytdGross', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'] as const;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The newest cloud recording of this silhouette, when it is the bundled English sample with nothing hidden. */
export function recordedCloudReading(skeleton: Skeleton): RecordedCloudReading | null {
  const key = sampleAnswerKey(skeleton) as Readonly<Record<string, unknown>> | null;
  if (key === null) return null;
  const files = Object.values(FILES)
    .filter((f) => f.kind === 'silhouette-cloud-recording' && typeof f.pointers === 'object' && f.pointers !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  const file = files.find((f) => CORE.every((field) => same(f.pointers[field], key[field])));
  if (!file) return null;
  let body = file.requestBody;
  try {
    body = JSON.stringify(JSON.parse(file.requestBody), null, 2);
  } catch {
    // Kept as it was sent.
  }
  return {
    pointers: file.pointers,
    date: file.date,
    body,
    path: file.endpoint,
    model: file.endpoint.match(/models\/([^/:]+)/)?.[1] ?? '',
    answer: JSON.stringify(file.pointers),
  };
}
