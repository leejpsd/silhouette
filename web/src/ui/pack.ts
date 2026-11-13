// The active rule pack, bands and pack copy, imported from ../shared at build time (never copied).
// Only the synthetic zz-test pack ships for now; the demo banner is shown whenever it is active.

import packJson from '../../../shared/rulepacks/zz-test/pack.json';
import bandsJson from '../../../shared/bands/zz-test.json';
import packEn from '../../../shared/rulepacks/zz-test/copy/en.json';
import packEs from '../../../shared/rulepacks/zz-test/copy/es.json';
import packKo from '../../../shared/rulepacks/zz-test/copy/ko.json';
import type { Bands } from '../core/generalize';
import type { RulePack } from '../core/rules';

export const PACK: RulePack = packJson as RulePack;
export const BANDS: Bands = bandsJson as Bands;
/** The pack's currency (ISO 4217), when it names one: amounts, limits and ranges are then shown as money. */
export const CURRENCY: string | undefined = (packJson as { currency?: string }).currency;
export const PACK_COPY: Readonly<Record<'en' | 'es' | 'ko', Readonly<Record<string, string>>>> = {
  en: packEn,
  es: packEs,
  ko: packKo,
};

/** Synthetic packs used only for tests and demos. */
export const DEMO_JURISDICTIONS: ReadonlySet<string> = new Set(['zz-test']);

export const isDemoPack = (pack: RulePack): boolean => DEMO_JURISDICTIONS.has(pack.jurisdiction);
