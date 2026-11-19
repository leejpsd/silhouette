// The active rule pack, bands and pack copy, imported from ../shared at build time (never copied).
// `@pack` and `@bands` resolve to the California pack in every build people get; the invented zz-test
// pack is used only by the unit tests and the end-to-end suite built with `build:demo-pack`
// (vite.config.ts, packFor()). A draft pack shows its notice on every screen, a checked pack the date it was
// checked, the demo pack its banner.

import packJson from '@pack/pack.json';
import bandsJson from '@bands';
import packEn from '@pack/copy/en.json';
import packEs from '@pack/copy/es.json';
import packKo from '@pack/copy/ko.json';
import type { Bands } from '../core/generalize';
import type { RulePack } from '../core/rules';

export const PACK: RulePack = packJson as RulePack;
export const BANDS: Bands = bandsJson as Bands;
/** The pack's currency (ISO 4217), when it names one: amounts, limits and ranges are then shown as money. */
export const CURRENCY: string | undefined = (packJson as { currency?: string }).currency;
/** How the jurisdiction writes numbers (BCP 47, such as en-US): money is written this way in every interface language. */
export const NUMBER_FORMAT: string | undefined = (packJson as { numberFormat?: string }).numberFormat;
export const PACK_COPY: Readonly<Record<'en' | 'es' | 'ko', Readonly<Record<string, string>>>> = {
  en: packEn,
  es: packEs,
  ko: packKo,
};

/** Synthetic packs used only for tests and demos. */
export const DEMO_JURISDICTIONS: ReadonlySet<string> = new Set(['zz-test']);

export const isDemoPack = (pack: RulePack): boolean => DEMO_JURISDICTIONS.has(pack.jurisdiction);

/** A draft pack (shared/rulepacks/SPEC.md section 2): numbers read from official sources, not all confirmed. */
export const PACK_STATUS: string | undefined = (packJson as { status?: string }).status;
/** When the draft pack's numbers were read from their sources. */
export const SOURCES_READ_ON: string | undefined = (packJson as { sourcesReadOn?: string }).sourcesReadOn;
export const isDraftPack = (): boolean => PACK_STATUS === 'draft';
/** A pack whose numbers a person compared with their sources (`verifiedOn`, no `status`): it says so where a draft says "Draft rules". */
export const isCheckedPack = (): boolean => PACK_STATUS === undefined && typeof PACK.verifiedOn === 'string' && PACK.verifiedOn !== '';
