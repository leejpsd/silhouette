// Generalizer. Contract: shared/rulepacks/SPEC.md v1.1 section 6 and
// shared/schemas/generalized-profile.json (v1.1). Ported from shared/reference/silhouette.mjs.

import { Raw, brandGeneralized, reveal, type Generalized } from './types';
import { verdicts, type Answers, type CriterionState, type RulePack, type Verdict } from './rules';

export interface IncomeBand {
  readonly id: string;
  readonly min: number;
  /** null for the open-ended top band. */
  readonly max: number | null;
}

export interface AgeBand {
  readonly id: string;
  readonly min: number;
  readonly max: number;
}

/** shared/bands/{jurisdiction}.json */
export interface Bands {
  readonly jurisdiction: string;
  readonly version: number;
  readonly annualIncome: readonly IncomeBand[];
  readonly householdSizeCap: number;
  readonly childAgeBands: readonly AgeBand[];
}

export type Housing = 'renter' | 'owner' | 'other';

/** Thrown when a profile silhouette cannot be built. Messages never contain user values. */
export class GeneralizeError extends Error {
  override readonly name = 'GeneralizeError';
}

/**
 * The exact profile. Always handled as Raw. Unanswered fields are absent or null.
 * Values are typed loosely (`unknown`) where the Generalizer must validate them at runtime.
 */
export interface ExactProfile {
  readonly jurisdiction: string;
  readonly annualIncome?: number | null | undefined;
  readonly incomeBand?: string | null | undefined;
  readonly householdSize?: number | null | undefined;
  readonly childAges?: readonly number[] | null | undefined;
  readonly county?: string | null | undefined;
  readonly housing?: Housing | string | null | undefined;
}

/** The profile silhouette (schemas/generalized-profile.json v1.1). Key order is the canonical order. */
export type GeneralizedProfile = {
  readonly jurisdiction: string;
  readonly incomeBand: string | null;
  readonly householdSize: number | string | null;
  readonly childAgeBands: readonly string[] | null;
  readonly county: string | null;
  readonly housing: Housing | null;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOUSING: readonly string[] = ['renter', 'owner', 'other'];
const given = <T>(v: T | null | undefined): v is T => v !== undefined && v !== null;

function bandFor(bands: Bands, income: number): IncomeBand | undefined {
  const value = Math.floor(Math.max(income, 0));
  return bands.annualIncome.find((b) => value >= b.min && (b.max === null || value <= b.max));
}

/**
 * Turns the exact profile into the profile silhouette (rulepacks/SPEC.md v1.1 section 6). One of
 * the two functions allowed to produce a cloud-safe value from Raw (shared/DATA_TYPES.md).
 * Unanswered fields become null. Invalid input throws GeneralizeError.
 */
export function generalize(rawExact: Raw<ExactProfile>, bands: Bands): Generalized<GeneralizedProfile> {
  const exact = reveal(rawExact) as { readonly [K in keyof ExactProfile]?: unknown };
  const jurisdiction = exact.jurisdiction;
  if (typeof jurisdiction !== 'string' || !SLUG.test(jurisdiction)) {
    throw new GeneralizeError('jurisdiction must be a slug');
  }
  let incomeBand: string | null = null;
  if (given(exact.annualIncome)) {
    if (typeof exact.annualIncome !== 'number' || !Number.isFinite(exact.annualIncome)) {
      throw new GeneralizeError('annualIncome must be a finite number');
    }
    const band = bandFor(bands, exact.annualIncome);
    if (!band) throw new GeneralizeError('annualIncome is not covered by any band');
    incomeBand = band.id;
  } else if (given(exact.incomeBand)) {
    const chosen = exact.incomeBand;
    if (!bands.annualIncome.some((b) => b.id === chosen)) throw new GeneralizeError('unknown income band');
    incomeBand = chosen as string;
  }
  let householdSize: number | string | null = null;
  if (given(exact.householdSize)) {
    const size = exact.householdSize;
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
      throw new GeneralizeError('householdSize must be a positive integer');
    }
    const cap = bands.householdSizeCap;
    householdSize = size > cap ? `${cap}+` : size;
  }
  let childAgeBands: string[] | null = null;
  if (given(exact.childAges)) {
    const ages = exact.childAges;
    if (!Array.isArray(ages) || !ages.every((a: unknown) => typeof a === 'number' && Number.isFinite(a))) {
      throw new GeneralizeError('childAges must be a list of numbers');
    }
    const list = ages as readonly number[];
    childAgeBands = bands.childAgeBands
      .filter((b) => list.some((age) => age >= b.min && age <= b.max))
      .map((b) => b.id);
  }
  let county: string | null = null;
  if (given(exact.county)) {
    if (typeof exact.county !== 'string' || !SLUG.test(exact.county)) throw new GeneralizeError('county must be a slug');
    county = exact.county;
  }
  let housing: Housing | null = null;
  if (given(exact.housing)) {
    if (typeof exact.housing !== 'string' || !HOUSING.includes(exact.housing)) {
      throw new GeneralizeError('unknown housing value');
    }
    housing = exact.housing as Housing;
  }
  return brandGeneralized({ jurisdiction, incomeBand, householdSize, childAgeBands, county, housing });
}

/**
 * Canonical serialization: all six keys in schema order, no whitespace, null for unanswered
 * fields. Every string is a slug or band id, so JSON.stringify needs no escaping.
 */
export function canonical(profile: Generalized<GeneralizedProfile>): Generalized<string> {
  const ordered: GeneralizedProfile = {
    jurisdiction: profile.jurisdiction,
    incomeBand: profile.incomeBand,
    householdSize: profile.householdSize,
    childAgeBands: profile.childAgeBands === null ? null : [...profile.childAgeBands],
    county: profile.county,
    housing: profile.housing,
  };
  return brandGeneralized(JSON.stringify(ordered));
}

/** A program verdict as far as the profile silhouette alone can tell (no exact values, no sensitive answers). */
export type SilhouetteVerdict = {
  readonly programId: string;
  readonly verdict: Verdict;
  readonly criteria: readonly { readonly id: string; readonly state: CriterionState }[];
};

/**
 * The verdict engine run on the profile silhouette only. This is what explanations and prepared
 * questions are given (they may reach the cloud): the verdict on screen also uses exact values and
 * answers to sensitive questions, which must never leave the device, so it is not sent.
 *
 * A silhouette field is passed to the engine when the pack has a question with the same id that is
 * not sensitive (householdSize, housing, county) and, for income, as the income band. Everything else
 * is unanswered, so criteria that need it are `unknown`.
 */
export function silhouetteVerdicts(
  pack: RulePack,
  bands: Bands,
  profile: Generalized<GeneralizedProfile>,
): readonly Generalized<SilhouetteVerdict>[] {
  const open = new Set(pack.questions.filter((q) => !q.sensitive).map((q) => q.id));
  const answers: Record<string, unknown> = {};
  if (profile.incomeBand !== null) answers['incomeBand'] = profile.incomeBand;
  if (open.has('householdSize') && typeof profile.householdSize === 'number') answers['householdSize'] = profile.householdSize;
  if (open.has('housing') && profile.housing !== null) answers['housing'] = profile.housing;
  if (open.has('county') && profile.county !== null) answers['county'] = profile.county;
  return verdicts(pack, bands, Raw.of(answers as Answers)).map((v) =>
    brandGeneralized<SilhouetteVerdict>({
      programId: v.programId,
      verdict: v.verdict,
      criteria: v.criteria.map((c) => ({ id: c.id, state: c.state })),
    }),
  );
}

