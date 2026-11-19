// The never-seen document sets (web/eval/heldout/, web/eval/heldout-2/), figured from their result files:
// paystubs on which a wrong yearly-income value reached the person, Form W-2 box 1 as measured and after the
// checks of contract v1.38 (the same stored answers, checked again), and a leak search of every request body.
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { w2WagesOutcome } from '../../core/pointer-check';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { appears, valueStrings, type LabelWords } from './cloud-eval';

type Values = Readonly<Record<string, unknown>>;
type Gold = Readonly<Record<string, unknown>>;

interface CloudDoc {
  readonly id: string;
  readonly docType: string;
  readonly ok?: boolean;
  readonly gold: Gold;
  readonly pointers?: unknown;
  readonly rehydrated?: Values;
  readonly rehydratedUsed?: Values;
  readonly requestBodies?: readonly unknown[];
}
interface DeviceDoc {
  readonly id: string;
  readonly docType: string;
  readonly ran: string;
  readonly retried?: boolean;
  readonly device?: { readonly values?: Values | null } | null;
  readonly final?: { readonly values: Values };
}
export interface HeldoutFiles {
  readonly cloud1: { readonly documents: readonly CloudDoc[] };
  readonly device1: { readonly documents: readonly DeviceDoc[] };
  readonly cloud2: { readonly documents: readonly CloudDoc[] };
  readonly device2: { readonly documents: readonly DeviceDoc[] };
}
/** The documents' text by id (for the W-2 re-check: the silhouette is made again on this device). */
export type Texts = Readonly<Record<string, string>>;

export interface HeldoutFigures {
  readonly paystubs: { readonly documents: number; readonly cloudWrong: number; readonly cloudAllRight: number; readonly deviceWrong: number; readonly deviceAllRight: number; readonly deviceFirstWrong: number; readonly retried: number };
  readonly w2: {
    readonly firstSet: { readonly documents: number; readonly cloudWrong: number; readonly deviceWrong: number };
    readonly secondSet: { readonly documents: number; readonly cloudWrong: number; readonly deviceWrong: number };
    readonly afterChecks: { readonly documents: number; readonly right: number; readonly leftOut: number; readonly wrong: number };
  };
  readonly leaks: { readonly bodies: number; readonly withValue: number };
}

const INCOME_INPUTS = ['grossPay', 'ytdGross', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'];
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** wrong or spurious: a value is shown that is not the document's (a value not found is not counted). */
function shownWrong(gold: unknown, got: unknown): boolean {
  if (empty(got)) return false;
  if (empty(gold)) return true;
  if (typeof gold === 'number') return !(typeof got === 'number' && Math.abs(got - gold) < 0.005);
  return got !== gold;
}
const right = (gold: unknown, got: unknown) => (empty(gold) ? empty(got) : !empty(got) && !shownWrong(gold, got));

const incomeWrong = (gold: Gold, values: Values | null | undefined) => values != null && INCOME_INPUTS.some((f) => shownWrong(gold[f], values[f]));
const incomeAllRight = (gold: Gold, values: Values | null | undefined) => values != null && INCOME_INPUTS.every((f) => right(gold[f], values[f]));

export function heldoutFigures(files: HeldoutFiles, golds: Readonly<Record<string, Gold>>, texts: Texts, labels: LabelWords): HeldoutFigures {
  const paystubsCloud = files.cloud1.documents.filter((d) => d.docType === 'paystub');
  const paystubsDevice = files.device1.documents.filter((d) => d.docType === 'paystub');
  const goldOf = (id: string) => golds[id] ?? {};
  const w2Cloud1 = files.cloud1.documents.filter((d) => d.docType === 'w2');
  const w2Device1 = files.device1.documents.filter((d) => d.docType === 'w2');
  const wagesWrong = (gold: Gold, values: Values | null | undefined) => values != null && shownWrong(gold['wages'], values['wages']);

  // Every W-2 answer stored from the cloud, checked again with the rules of today's contract.
  const afterChecks = { documents: 0, right: 0, leftOut: 0, wrong: 0 };
  for (const d of [...w2Cloud1, ...files.cloud2.documents.filter((x) => x.docType === 'w2')]) {
    if (!d.ok) continue;
    const { map } = skeletonize(Raw.of(texts[d.id] ?? ''), allowlistFor('en'), introducersFor('en'));
    const outcome = w2WagesOutcome(POINTER_SCHEMAS.w2, d.pointers, map, goldOf(d.id)['wages'] as number);
    afterChecks.documents++;
    if (outcome === 'left-out') afterChecks.leftOut++;
    else if (outcome === 'wrong') afterChecks.wrong++;
    else afterChecks.right++;
  }

  let bodies = 0;
  let withValue = 0;
  for (const d of [...files.cloud1.documents, ...files.cloud2.documents]) {
    const values = valueStrings(goldOf(d.id), 'en', labels);
    for (const body of d.requestBodies ?? []) {
      bodies++;
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      if (values.some((v) => appears(text, v))) withValue++;
    }
  }

  return {
    paystubs: {
      documents: paystubsCloud.length,
      cloudWrong: paystubsCloud.filter((d) => incomeWrong(goldOf(d.id), d.rehydrated)).length,
      cloudAllRight: paystubsCloud.filter((d) => incomeAllRight(goldOf(d.id), d.rehydrated)).length,
      deviceWrong: paystubsDevice.filter((d) => incomeWrong(goldOf(d.id), d.final?.values)).length,
      deviceAllRight: paystubsDevice.filter((d) => incomeAllRight(goldOf(d.id), d.final?.values)).length,
      deviceFirstWrong: paystubsDevice.filter((d) => incomeWrong(goldOf(d.id), d.device?.values)).length,
      retried: paystubsDevice.filter((d) => d.retried).length,
    },
    w2: {
      firstSet: { documents: w2Cloud1.length, cloudWrong: w2Cloud1.filter((d) => wagesWrong(goldOf(d.id), d.rehydrated)).length, deviceWrong: w2Device1.filter((d) => wagesWrong(goldOf(d.id), d.final?.values)).length },
      secondSet: {
        documents: files.cloud2.documents.length,
        cloudWrong: files.cloud2.documents.filter((d) => wagesWrong(goldOf(d.id), d.rehydratedUsed ?? d.rehydrated)).length,
        deviceWrong: files.device2.documents.filter((d) => wagesWrong(goldOf(d.id), d.final?.values)).length,
      },
      afterChecks,
    },
    leaks: { bodies, withValue },
  };
}
