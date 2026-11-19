// How a yearly income read from paystubs was worked out (validation/SPEC.md section 7), as one line for
// the results: year-to-date gross over the months elapsed, or gross per period × periods a year.
import { formatMoney, type Locale, type Translate } from './i18n';
import { NUMBER_FORMAT } from './pack';
import type { IncomeBasis } from './quickcheck';

export function incomeBasisLine(t: Translate, locale: Locale, amount: number, basis: IncomeBasis): string {
  const yearly = formatMoney(locale, amount);
  if (basis.method === 'ytd') {
    const months = new Intl.NumberFormat(NUMBER_FORMAT ?? locale, { maximumFractionDigits: 2 }).format(basis.monthsNumerator / basis.monthsDenominator);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(basis.referenceDate) ? new Date(`${basis.referenceDate}T00:00:00Z`) : null;
    const date = parsed ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed).replace(/ /g, ' ') : basis.referenceDate;
    return t('results.incomeBasis.ytd', { amount: yearly, ytd: formatMoney(locale, basis.ytdCents / 100, { cents: true }), date, months });
  }
  return t('results.incomeBasis.average', { amount: yearly, average: formatMoney(locale, basis.averageCents / 100, { cents: true }), periods: basis.periodsPerYear });
}
