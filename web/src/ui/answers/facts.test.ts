import { describe, expect, it } from 'vitest';
import { translator } from '../i18n';
import { PACK } from '../pack';
import { programFacts, programUses } from './facts';

const program = (id: string) => PACK.programs.find((p) => p.id === id)!;

describe('{programFacts} (shared/rulepacks/SPEC.md section 2.1)', () => {
  it('is the program copy, then the answers it uses, then what it checks, one item per line', () => {
    const facts = programFacts(translator('en'), 'en', program('food-help')).facts.split('\n');
    expect(facts).toEqual([
      'A monthly benefit for buying food, loaded on a card, for households under an income limit.',
      'Apply online, by phone or at the county office. An interview usually follows.',
      'Usually: identification, proof of address, and proof of income for the last month.',
      'It lasts several months and is renewed with a short form.',
      'Test County Benefits Office',
      'This program uses: Yearly income; Household size; Residency.',
      'This program checks: Your income is under the limit for your household size; You meet the residency rule.',
    ]);
  });

  it('lists the answers with yearly income first, then in question order', () => {
    expect(programUses(program('phone-discount'))).toEqual(['annualIncome', 'householdSize', 'benefits']);
    expect(programUses(program('work-credit'))).toEqual(['annualIncome', 'numChildren', 'hasEarnedIncome']);
  });

  it('is written in the answer language', () => {
    const facts = programFacts(translator('es'), 'es', program('food-help')).facts;
    expect(facts).toContain('Este programa usa: Ingreso anual');
    expect(facts).not.toContain('This program');
  });
});
