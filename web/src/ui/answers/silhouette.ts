// The profile silhouette of the current answers, the verdicts the engine reaches from it alone, and
// the program facts that explanations are given. Exact values never leave this module except as the
// Generalizer's output.

import { useMemo } from 'react';
import { canonical, generalize, silhouetteVerdicts, type GeneralizedProfile, type SilhouetteVerdict } from '../../core/generalize';
import { asPublic, type Generalized, type Public } from '../../core/types';
import type { ExplainInput, ProgramFacts, ProgramName } from '../../ai/tasks';
export { programFacts } from './facts';
import { useApp } from '../context';
import { lookup, programName, type Locale, type Translate } from '../i18n';
import { bandLabel } from '../screens/Question';
import { countiesFor } from './counties';
import { BANDS, PACK } from '../pack';
import { exactProfile } from '../quickcheck';
import { useCounty } from './county-choice';

export interface Silhouette {
  readonly profile: Generalized<GeneralizedProfile>;
  readonly canonical: string;
  readonly verdicts: readonly Generalized<SilhouetteVerdict>[];
}

export function useSilhouette(): Silhouette | null {
  const { steps, answers } = useApp();
  const county = useCounty();
  return useMemo(() => {
    try {
      const profile = generalize(exactProfile(PACK.jurisdiction, steps, answers, county), BANDS);
      return { profile, canonical: canonical(profile), verdicts: silhouetteVerdicts(PACK, BANDS, profile) };
    } catch {
      // The Generalizer refused the answers (it never says why with values); no silhouette, no sending.
      return null;
    }
  }, [steps, answers, county]);
}

export function explainInput(silhouette: Silhouette, facts: Public<ProgramFacts>, locale: Locale): ExplainInput | null {
  const verdict = silhouette.verdicts.find((v) => v.programId === facts.programId);
  return verdict ? { profile: silhouette.profile, verdict, program: facts, locale } : null;
}

/** Every program of the pack by id and name (for the batched status search: never a subset). */
export function allProgramNames(locale: Locale): Public<readonly ProgramName[]> {
  return asPublic(PACK.programs.map((p) => ({ id: p.id, name: programName(locale, p) })));
}

/**
 * Lines describing a silhouette for the "Leaving your device" step, in the UI language. Each value is
 * shown as the person knows it, with the form that is sent in brackets where they differ.
 */
export function silhouetteLines(t: Translate, locale: Locale, profile: GeneralizedProfile): string[] {
  const none = t('send.unanswered');
  const band = BANDS.annualIncome.find((b) => b.id === profile.incomeBand);
  const housing = profile.housing === null ? none : `${lookup(locale, `option.housing.${profile.housing}`) ?? profile.housing} (${profile.housing})`;
  const county = profile.county === null ? none : (countiesFor(profile.jurisdiction).find((c) => c.id === profile.county)?.name ?? profile.county);
  return [
    t('send.line.jurisdiction', { value: `${lookup(locale, `pack.${profile.jurisdiction}.name`) ?? profile.jurisdiction} (${profile.jurisdiction})` }),
    t('send.line.incomeBand', { value: band ? `${bandLabel(t, locale, band)} (${band.id})` : none }),
    t('send.line.householdSize', { value: profile.householdSize === null ? none : String(profile.householdSize) }),
    t('send.line.housing', { value: housing }),
    t('send.line.childAgeBands', { value: profile.childAgeBands === null ? none : profile.childAgeBands.join(', ') || '-' }),
    t('send.line.county', { value: county }),
  ];
}
