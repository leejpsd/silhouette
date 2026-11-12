// Type-level proof of the routing rule (shared/DATA_TYPES.md).
// Checked by `npm run typecheck` (tsconfig.test.json). Never executed: every line marked
// @ts-expect-error MUST fail to compile, otherwise tsc reports "Unused '@ts-expect-error'
// directive" and the typecheck fails.

import { asPublic, mapRaw, reveal, type CloudSafe, type Generalized, type Public, type Raw, type Skeleton } from '../core/types';
import { rehydrate, skeletonize, type PlaceholderMap, type PointerSchema } from '../core/skeleton';
import { canonical, generalize, silhouetteVerdicts, type Bands, type ExactProfile, type GeneralizedProfile, type SilhouetteVerdict } from '../core/generalize';
import type { RulePack } from '../core/rules';
import { askChip, discoverLeads, explainProgram, extractPointers, nearbyHelp, planAskChip, planExplain, readAloud, type ProgramFacts, type QuestionChip } from './tasks';
import { askFreeText, explainPersonal, readPhoto, type PersonalResult } from './on-device';

declare const rawText: Raw<string>;
declare const rawSkeletonLike: Raw<Skeleton>;
declare const rawProfile: Raw<ExactProfile>;
declare const rawMap: Raw<PlaceholderMap>;
declare const allow: ReadonlySet<string>;
declare const bands: Bands;
declare const schema: PointerSchema;
declare const plainString: string;
declare const plainProfile: GeneralizedProfile;
declare const programText: Public<ProgramFacts>;
declare const chip: Public<QuestionChip>;
declare const pack: RulePack;
declare const plainVerdict: SilhouetteVerdict;
declare const rawResult: Raw<PersonalResult>;
declare const plainResult: PersonalResult;
declare const rawPhoto: Raw<Blob>;
declare const plainPhoto: Blob;

export function routingTypeTests(): void {
  // ---- Allowed: values produced by the Skeletonizer and the Generalizer ----
  const { skeleton, map } = skeletonize(rawText, allow);
  void extractPointers(skeleton, 'paystub', 'en');

  const profile = generalize(rawProfile, bands);
  const verdict = silhouetteVerdicts(pack, bands, profile)[0]!;
  const input = { profile, verdict, program: programText, locale: 'en' };
  void explainProgram(planExplain(input, 'short')).then((answer) => readAloud(answer.value, 'en'));
  void askChip(planAskChip(input, chip)).then((answer) => readAloud(answer.value, 'en'));
  void discoverLeads({ profile, known: asPublic(['Test Food Help']), locale: 'en' });
  void nearbyHelp({ profile, centroid: asPublic({ latitude: 1, longitude: 2 }), countyName: asPublic('Testshire'), locale: 'en' });

  const safe: CloudSafe[] = [skeleton, profile, canonical(profile), programText];
  void safe;

  // ---- Rejected: Raw values ----
  // @ts-expect-error Raw document text cannot reach a cloud-capable task.
  void extractPointers(rawText, 'paystub', 'en');
  // @ts-expect-error A Raw wrapper stays Raw even if its content is a Skeleton.
  void extractPointers(rawSkeletonLike, 'paystub', 'en');
  // @ts-expect-error The placeholder map is Raw.
  void extractPointers(map, 'paystub', 'en');
  // @ts-expect-error Raw profile cannot reach a cloud-capable task.
  void planExplain({ ...input, profile: rawProfile }, 'short');
  // @ts-expect-error Rehydrated fields are Raw.
  void planExplain({ ...input, profile: rehydrate(schema, {}, rawMap) }, 'short');
  // @ts-expect-error Raw profile cannot reach the search for leads.
  void discoverLeads({ profile: rawProfile, known: asPublic([]), locale: 'en' });
  // The person's own result is Raw: it only goes to ONLY_ON_DEVICE tasks, and their answers are plain
  // strings that cannot be read aloud in the cloud.
  void askFreeText(rawText, rawResult).then((answer) => {
    // @ts-expect-error An answer to a typed question cannot reach the speech model.
    void readAloud(answer.value, 'en');
  });
  void explainPersonal(rawResult).then((answer) => {
    // @ts-expect-error An explanation of the person's own result cannot reach the speech model.
    void readAloud(answer.value, 'en');
  });
  // @ts-expect-error The person's own result cannot be a program's public facts.
  void planExplain({ ...input, program: rawResult }, 'short');
  // @ts-expect-error The on-device explanation takes the result as Raw, never plain.
  void explainPersonal(plainResult);
  // @ts-expect-error Nor the silhouette input of the general explanation.
  void explainPersonal(input);
  // @ts-expect-error A typed question cannot be a prepared chip.
  void planAskChip(input, { id: 'x', question: rawText });
  // @ts-expect-error mapRaw keeps the result Raw.
  void extractPointers(mapRaw(rawText, (t) => t.toUpperCase()), 'paystub', 'en');
  // @ts-expect-error Raw is not CloudSafe.
  const unsafe: CloudSafe = rawText;
  void unsafe;

  // ---- Rejected: plain values (including values revealed from Raw) ----
  // @ts-expect-error A revealed string is not a Skeleton.
  void extractPointers(reveal(rawText), 'paystub', 'en');
  // @ts-expect-error A plain string is not a Skeleton.
  void extractPointers(plainString, 'paystub', 'en');
  // @ts-expect-error A hand-built profile is not Generalized; only generalize() makes one.
  void planExplain({ ...input, profile: plainProfile }, 'short');
  // @ts-expect-error A revealed exact profile is not Generalized.
  void planExplain({ ...input, profile: reveal(rawProfile) }, 'short');
  // @ts-expect-error Public is not Generalized.
  void planExplain({ ...input, profile: programText }, 'short');
  // @ts-expect-error Generalized is not Public.
  void planExplain({ ...input, program: profile }, 'short');
  // @ts-expect-error A verdict computed from exact values is not Generalized; only silhouetteVerdicts() makes one.
  void planExplain({ ...input, verdict: plainVerdict }, 'short');
  // @ts-expect-error A plain string is not a model answer.
  void readAloud({ text: plainString }, 'en');
  // @ts-expect-error The centroid is static app data (Public), never a plain position.
  void nearbyHelp({ profile, centroid: { latitude: 1, longitude: 2 }, countyName: asPublic('Testshire'), locale: 'en' });

  // ---- ONLY_ON_DEVICE: the photo task takes Raw, and its output stays Raw ----
  void readPhoto(rawPhoto, 'paystub', 'en');
  void readPhoto(rawPhoto, 'paystub', 'en').then((result) => {
    // @ts-expect-error The transcribed photo text is Raw; it must be skeletonized first.
    void extractPointers(result.value, 'paystub', 'en');
    void extractPointers(skeletonize(result.value, allow).skeleton, 'paystub', 'en');
  });
  // @ts-expect-error The photo task only takes a Raw photo, so its input is typed as personal data.
  void readPhoto(plainPhoto, 'paystub', 'en');
  // @ts-expect-error A cloud-capable task does not take a photo.
  void extractPointers(rawPhoto, 'paystub', 'en');

  // ---- Rejected: laundering Raw through asPublic ----
  // @ts-expect-error A Raw value cannot be marked Public.
  void asPublic(rawText);
  // @ts-expect-error A Raw value nested in an object cannot be marked Public.
  void asPublic({ name: rawText });
  // @ts-expect-error A Raw value nested in an array cannot be marked Public.
  void asPublic([rawText]);
}
