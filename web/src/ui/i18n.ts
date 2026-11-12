// UI copy: shared/copy/*.json (app-wide) and shared/rulepacks/{jurisdiction}/copy/*.json (pack
// labels, key conventions in shared/rulepacks/SPEC.md section 1).
// Per-key lookup: shared/{locale} → pack/{locale} → shared/en → pack/en → copy.local.json (English
// strings of screens whose copy is not in shared/copy yet).

import sharedEn from '../../../shared/copy/en.json';
import sharedEs from '../../../shared/copy/es.json';
import sharedKo from '../../../shared/copy/ko.json';
import localEn from './copy.local.json';
import { PACK_COPY } from './pack';

export const LOCALES = ['en', 'es', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

/** Language names in their own language (not translated). */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español', ko: '한국어' };

export type CopyKey = keyof typeof sharedEn | keyof typeof localEn;

type Table = Readonly<Record<string, string>>;
const SHARED: Record<Locale, Table> = { en: sharedEn, es: sharedEs, ko: sharedKo };
const LOCAL: Table = localEn;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function inLocale(locale: Locale, key: string): string | undefined {
  return SHARED[locale][key] ?? PACK_COPY[locale][key];
}

/** Looks up a key with per-key fallback to English. Returns undefined when no table has it. */
export function lookup(locale: Locale, key: string): string | undefined {
  return inLocale(locale, key) ?? inLocale('en', key) ?? LOCAL[key];
}

export type Params = Readonly<Record<string, string | number>>;

export function format(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type Translate = (key: CopyKey, params?: Params) => string;

export function translator(locale: Locale): Translate {
  return (key, params) => {
    const template = lookup(locale, key);
    if (template === undefined) throw new Error(`Missing copy key: ${key}`);
    return format(template, params);
  };
}

/** For keys built at runtime (question ids, program ids). Throws if the key does not exist. */
export function dynamicKey(key: string): CopyKey {
  if (lookup('en', key) === undefined) throw new Error(`Missing copy key: ${key}`);
  return key as CopyKey;
}

/** `program.{id}.name` from the pack copy, falling back to `programs[].name` (SPEC section 1). */
export function programName(locale: Locale, program: { readonly id: string; readonly name: string }): string {
  return lookup(locale, `program.${program.id}.name`) ?? program.name;
}

/** An amount with cents only when it has them: 28,000 or 28,000.50. */
export function formatAmount(locale: Locale, value: number): string {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(value);
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}
