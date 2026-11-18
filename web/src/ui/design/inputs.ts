// What a field accepts, decided as the person types or pastes: a field never holds characters it
// cannot use. Limits (a number outside its range, a wrong format) are said in words where they matter,
// never by silently changing what was typed.

/** A whole-number field: digits only, and no more of them than its largest value has. */
export const digitsOnly = (text: string, max: number): string => text.replace(/\D/g, '').slice(0, String(max).length);

/** A money field: digits, the thousands comma and the decimal dot. A pasted "$30,524" becomes "30,524". */
export const moneyOnly = (text: string): string => text.replace(/[^\d.,]/g, '');
