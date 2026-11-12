// Skeletonizer allowlists, imported from ../shared at build time.
import en from '../../../../shared/skeleton/allowlist/en.json';
import es from '../../../../shared/skeleton/allowlist/es.json';
import ko from '../../../../shared/skeleton/allowlist/ko.json';
import { buildAllowlist } from '../../core/skeleton';
import type { Locale } from '../i18n';

const FILES = { en, es, ko } as const;

/** Allowlist for a document: allowlist/{document language} ∪ allowlist/en (shared/skeleton/SPEC.md section 4). */
export function allowlistFor(language: Locale): ReadonlySet<string> {
  return buildAllowlist(language === 'en' ? [en] : [en, FILES[language]]);
}
