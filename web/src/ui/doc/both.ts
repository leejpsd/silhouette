// "Read both ways" (contract v1.44, review.both.*): on the one-press judges' path the sample is read on a
// device and in the cloud, one after the other. The review then shows the two answers side by side and
// compares them field by field, after the values were put back on this device. Nothing here decides what
// is used: the values are the device's answer, through the same checks as any reading.
import type { ReviewField } from '../../core/review';

export interface BothReadings {
  /** The device's half: read now on this device (`live`), or a recording made on `machine`. */
  readonly device: {
    readonly live: boolean;
    readonly machine?: string | undefined;
    readonly date?: string | undefined;
    readonly review: readonly ReviewField[];
    /** Fields the device left out as not read (the deductions of a reading without them): not compared. */
    readonly notRead: readonly string[];
  };
  /** The cloud's half: always a recording of the same silhouette (nothing is sent on this path). */
  readonly cloud: { readonly model: string; readonly date: string; readonly review: readonly ReviewField[] };
}

export interface Comparison {
  /** Fields at least one of the two answered (the device's unread fields left out). */
  readonly total: number;
  /** Of those, the fields with the same value from both. */
  readonly same: number;
  /** The fields whose values differ (one answered and the other not counts as a difference), in schema order. */
  readonly differs: readonly string[];
}

const answered = (f: ReviewField | undefined): boolean => f !== undefined && (f.kind === 'list' ? f.items.length > 0 : f.value !== null);
const valueOf = (f: ReviewField | undefined): unknown => (f === undefined ? null : f.kind === 'list' ? (f.items.length > 0 ? f.items.map((i) => i.value) : null) : f.value);

/** Compares the two answers value by value, after rehydration (the values, not the placeholder ids). */
export function compareReadings(device: readonly ReviewField[], cloud: readonly ReviewField[], notRead: readonly string[] = []): Comparison {
  const names = [...new Set([...device.map((f) => f.name), ...cloud.map((f) => f.name)])];
  let total = 0;
  let same = 0;
  const differs: string[] = [];
  for (const name of names) {
    if (notRead.includes(name)) continue;
    const d = device.find((f) => f.name === name);
    const c = cloud.find((f) => f.name === name);
    if (!answered(d) && !answered(c)) continue;
    total++;
    if (JSON.stringify(valueOf(d)) === JSON.stringify(valueOf(c))) same++;
    else differs.push(name);
  }
  return { total, same, differs };
}

/** One field as an answer: the placeholder the model pointed at and the value this device put back. */
export interface Answer {
  readonly ref: string;
  readonly value: string;
}

/** The field's answer when it is one placeholder (an amount or a date); null when it was not answered so. */
export function answerOf(review: readonly ReviewField[], name: string): Answer | null {
  const field = review.find((f) => f.name === name);
  if (!field || field.kind === 'list' || field.value === null || field.refs.length !== 1) return null;
  const ref = field.refs[0] as string;
  const value = field.source.flat().find((seg) => seg.ref === ref)?.text;
  return value ? { ref, value } : null;
}

/** The fields shown as pairs on the card: what the yearly income is worked out from, first. */
export const BOTH_ROWS: Readonly<Record<string, readonly string[]>> = {
  paystub: ['grossPay', 'ytdGross', 'payDate', 'periodEnd'],
  w2: ['wages', 'taxYear'],
};
