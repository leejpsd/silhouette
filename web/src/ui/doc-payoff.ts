// What a document changed, as amounts (contract v1.44, results.docEffect.rowMay / rowAmount / total / totalUpTo):
// counted from the rule engine's verdicts, never from a model.
import type { ProgramVerdict, RulePack } from '../core/rules';

/** The programs that may qualify, those with an amount, and the yearly sums (estimates; published maximums apart). */
export function payoff(results: readonly ProgramVerdict[], pack: Pick<RulePack, 'programs'>): { may: number; withAmount: number; total: number; upTo: number } {
  const may = results.filter((r) => r.verdict === 'likely');
  // Amounts are yearly as the programs state them; a program whose period is not a year is left out of the sums.
  const yearly = (id: string) => !/month|week/i.test(pack.programs.find((p) => p.id === id)?.period ?? '');
  const estimate = (r: ProgramVerdict) => (r.estimatedAmount !== undefined && r.estimatedAmount > 0 ? r.estimatedAmount : 0);
  const upTo = (r: ProgramVerdict) => (estimate(r) === 0 && r.upToAmount !== undefined && r.upToAmount > 0 ? r.upToAmount : 0);
  return {
    may: may.length,
    withAmount: may.filter((r) => estimate(r) > 0 || upTo(r) > 0).length,
    total: may.filter((r) => yearly(r.programId)).reduce((sum, r) => sum + estimate(r), 0),
    upTo: may.filter((r) => yearly(r.programId)).reduce((sum, r) => sum + upTo(r), 0),
  };
}

