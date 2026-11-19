// How a yearly income read from paystubs or W-2s was worked out (validation/SPEC.md sections 7 and 9), as
// one line for the results: year-to-date gross over the months elapsed, gross per period × periods a
// year, or the wages on the year's W-2s.
import { formatMoney, type Locale, type Translate } from './i18n';
import { NUMBER_FORMAT } from './pack';
import type { IncomeBasis } from './quickcheck';

export function incomeBasisLine(t: Translate, locale: Locale, amount: number, basis: IncomeBasis): string {
  const yearly = formatMoney(locale, amount);
  if (basis.method === 'w2') {
    // A form without a year says "your W-2", never an empty year.
    if (basis.taxYear === null) {
      return basis.forms > 1 ? t('results.incomeBasis.w2ManyNoYear', { amount: yearly, count: basis.forms }) : t('results.incomeBasis.w2NoYear', { amount: yearly });
    }
    const year = String(basis.taxYear);
    return basis.forms > 1 ? t('results.incomeBasis.w2Many', { amount: yearly, count: basis.forms, year }) : t('results.incomeBasis.w2', { amount: yearly, year });
  }
  if (basis.method === 'ytd') {
    const months = new Intl.NumberFormat(NUMBER_FORMAT ?? locale, { maximumFractionDigits: 2 }).format(basis.monthsNumerator / basis.monthsDenominator);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(basis.referenceDate) ? new Date(`${basis.referenceDate}T00:00:00Z`) : null;
    const date = parsed ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed).replace(/ /g, ' ') : basis.referenceDate;
    return t('results.incomeBasis.ytd', { amount: yearly, ytd: formatMoney(locale, basis.ytdCents / 100, { cents: true }), date, months });
  }
  return t('results.incomeBasis.average', { amount: yearly, average: formatMoney(locale, basis.averageCents / 100, { cents: true }), periods: basis.periodsPerYear });
}
