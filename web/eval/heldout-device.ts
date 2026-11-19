// Held-out set on this device (eval/heldout.html, dev server only): every document of eval/heldout/ read
// through the app's own extractPointers with the app's own checks (src/ui/doc/reading-checks.ts), so a
// paystub is read in parts on a device with a ready model, and a failed device answer is repeated once in
// the cloud with the same silhouette. Scored by value against the answer key, as the on-device check does
// (shared/validation/DEVICE_CHECK.md section 2).
import { Raw } from '../src/core/types';
import { skeletonize } from '../src/core/skeleton';
import { buildReview } from '../src/core/review';
import { tidyNamePointers } from '../src/core/tidy';
import { extractPointers, POINTER_SCHEMAS, type DeviceAttempt } from '../src/ai/tasks';
import { allowlistFor, introducersFor } from '../src/ui/doc/allowlists';
import { readingChecks } from '../src/ui/doc/reading-checks';
import { availabilityStates, browserVersion, fieldStatuses, platformString, scoreFields, wrongFields, type FieldStatus } from '../src/ui/device-check/run';

const texts = import.meta.glob('./heldout/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const golds = import.meta.glob('./heldout/*.gold.json', { import: 'default', eager: true }) as Record<string, Record<string, unknown>>;

interface Doc {
  readonly id: string;
  readonly docType: 'paystub' | 'w2';
  readonly layout: string;
  readonly text: string;
  readonly gold: Record<string, unknown>;
}

const DOCS: readonly Doc[] = Object.keys(texts)
  .filter((p) => p.endsWith('.txt'))
  .sort()
  .map((path) => {
    const id = path.replace('./heldout/', '').replace('.txt', '');
    const gold = golds[`./heldout/${id}.gold.json`];
    if (!gold) throw new Error(`no answer key for ${id}`);
    return { id, docType: id.startsWith('hw-') ? 'w2' : 'paystub', layout: id.replace(/-\d+$/, ''), text: texts[path] as string, gold };
  });

const statusOf = (statuses: Record<string, FieldStatus>) => statuses;
/** The values the person would be shown, field by field (synthetic documents only), for scoring offline. */
const valuesOf = (review: ReturnType<typeof buildReview>) =>
  Object.fromEntries(review.map((f) => [f.name, f.kind === 'list' ? f.items.map((i) => i.value) : f.value]));

async function readOne(doc: Doc) {
  const started = performance.now();
  const schema = POINTER_SCHEMAS[doc.docType];
  const { skeleton, map } = skeletonize(Raw.of(doc.text), allowlistFor('en'), introducersFor('en'));
  const review = (value: unknown) => buildReview(schema, tidyNamePointers(schema, value, map, introducersFor('en')), skeleton, map);
  const deviceAnswer = (attempt: DeviceAttempt): Record<string, unknown> | undefined => {
    if (!attempt.passes) return attempt.value;
    const parts = attempt.passes.filter((p) => p.value !== undefined).map((p) => p.value as Record<string, unknown>);
    return parts.length > 0 ? Object.assign({}, ...parts) : undefined;
  };
  const checks = readingChecks(skeleton, map, 'en', doc.docType);
  try {
    const result = await extractPointers(skeleton, doc.docType, 'en', { validate: checks.validate, checkParts: checks.checkParts });
    const finalStatuses = fieldStatuses(review(result.value), doc.gold);
    const attempt = result.deviceAttempt;
    const first = attempt ? deviceAnswer(attempt) : undefined;
    return {
      id: doc.id,
      docType: doc.docType,
      layout: doc.layout,
      ran: result.inferenceSource,
      retried: result.reason === 'on-device-failed',
      latencyMs: Math.round(performance.now() - started),
      device: attempt
        ? { answered: first !== undefined, problems: attempt.problems, statuses: first ? statusOf(fieldStatuses(review(first), doc.gold)) : null, fields: first ? scoreFields(review(first), doc.gold) : null, values: first ? valuesOf(review(first)) : null }
        : null,
      final: {
        statuses: statusOf(finalStatuses),
        values: valuesOf(review(result.value)),
        fields: scoreFields(review(result.value), doc.gold),
        wrongFields: wrongFields(finalStatuses),
        notRead: result.notRead ?? [],
        deductionsNotRead: result.deductionsNotRead ?? false,
      },
    };
  } catch (error) {
    const attempt = (error as { deviceAttempt?: DeviceAttempt }).deviceAttempt;
    return {
      id: doc.id,
      docType: doc.docType,
      layout: doc.layout,
      ran: 'not-run' as const,
      latencyMs: Math.round(performance.now() - started),
      error: String((error as { kind?: string }).kind ?? error),
      device: attempt ? { answered: deviceAnswer(attempt) !== undefined, problems: attempt.problems } : null,
    };
  }
}

const $ = (id: string) => document.getElementById(id) as HTMLElement;

async function run() {
  ($('run') as HTMLButtonElement).disabled = true;
  const availability = await availabilityStates();
  const out = {
    kind: 'silhouette-heldout-device',
    date: new Date().toISOString(),
    browser: browserVersion(navigator.userAgent),
    platform: platformString(),
    userAgent: navigator.userAgent,
    availability,
    documents: [] as unknown[],
  };
  for (const [i, doc] of DOCS.entries()) {
    $('status').textContent = `Reading ${doc.id} (${i + 1} of ${DOCS.length})…`;
    const r = await readOne(doc);
    out.documents.push(r);
    const row = document.createElement('tr');
    const f = (x: { correct: number; total: number } | null | undefined) => (x ? `${x.correct}/${x.total}` : '–');
    const rr = r as { ran: string; device?: { fields?: { correct: number; total: number } | null } | null; final?: { fields: { correct: number; total: number }; wrongFields: string[] } };
    row.innerHTML = `<td>${doc.id}</td><td>${rr.ran}</td><td>${f(rr.device?.fields)}</td><td>${f(rr.final?.fields)}</td><td>${rr.final?.wrongFields.join(', ') ?? ''}</td>`;
    $('rows').append(row);
    $('result').textContent = JSON.stringify(out);
  }
  $('status').textContent = `Finished. ${DOCS.length} documents.`;
  document.body.dataset['done'] = 'true';
}

$('status').textContent = `${DOCS.length} documents ready.`;
($('run') as HTMLButtonElement).disabled = DOCS.length === 0;
$('run').addEventListener('click', () => void run());
