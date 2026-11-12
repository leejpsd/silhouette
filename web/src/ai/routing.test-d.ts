// Type-level proof of the routing rule (shared/DATA_TYPES.md).
// Checked by `npm run typecheck` (tsconfig.test.json). Never executed: every line marked
// @ts-expect-error MUST fail to compile, otherwise tsc reports "Unused '@ts-expect-error'
// directive" and the typecheck fails.

import { asPublic, mapRaw, reveal, type CloudSafe, type Generalized, type Public, type Raw, type Skeleton } from '../core/types';
import { rehydrate, skeletonize, type PlaceholderMap, type PointerSchema } from '../core/skeleton';
import { canonical, generalize, type Bands, type ExactProfile, type GeneralizedProfile } from '../core/generalize';
import { explainShort, extractPointers, type ProgramText } from './tasks';
import { readPhoto } from './on-device';

declare const rawText: Raw<string>;
declare const rawSkeletonLike: Raw<Skeleton>;
declare const rawProfile: Raw<ExactProfile>;
declare const rawMap: Raw<PlaceholderMap>;
declare const allow: ReadonlySet<string>;
declare const bands: Bands;
declare const schema: PointerSchema;
declare const plainString: string;
declare const plainProfile: GeneralizedProfile;
declare const programText: Public<ProgramText>;
declare const rawPhoto: Raw<Blob>;
declare const plainPhoto: Blob;

export function routingTypeTests(): void {
  // ---- Allowed: values produced by the Skeletonizer and the Generalizer ----
  const { skeleton, map } = skeletonize(rawText, allow);
  void extractPointers(skeleton, 'paystub', 'en');

  const profile = generalize(rawProfile, bands);
  void explainShort(profile, programText);
  void explainShort(profile, asPublic({ programId: 'food-help', name: 'Test Food Help', ruleText: 'Income limit.' }));

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
  void explainShort(rawProfile, programText);
  // @ts-expect-error Rehydrated fields are Raw.
  void explainShort(rehydrate(schema, {}, rawMap), programText);
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
  void explainShort(plainProfile, programText);
  // @ts-expect-error A revealed exact profile is not Generalized.
  void explainShort(reveal(rawProfile), programText);
  // @ts-expect-error Public is not Generalized.
  void explainShort(programText, programText);
  // @ts-expect-error Generalized is not Public.
  void explainShort(profile, profile);

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
