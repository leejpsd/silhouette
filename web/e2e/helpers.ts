import { expect, type Page } from '@playwright/test';

export type Choice = string | 'skip';

export interface FlowAnswers {
  householdSize: string | 'skip';
  numChildren: string | 'skip';
  hasEarnedIncome: 'Yes' | 'No' | 'skip';
  income: { band: string } | { exact: string } | 'skip';
  housing: 'I rent' | 'I own' | 'Something else' | 'skip';
  /** Labels to tick; [] answers "none of these". */
  benefits: string[] | 'skip';
  hasOlderMember: 'Yes' | 'No' | 'skip';
  resident: 'Yes' | 'No' | 'skip';
}

export const DEFAULT_ANSWERS: FlowAnswers = {
  householdSize: '3',
  numChildren: '2',
  hasEarnedIncome: 'Yes',
  income: { exact: '30524' },
  housing: 'I rent',
  benefits: [],
  hasOlderMember: 'No',
  resident: 'Yes',
};

/** Question headings (en) → answer key. */
const QUESTIONS: [RegExp, keyof FlowAnswers][] = [
  [/How many people live in your home/, 'householdSize'],
  [/How many children/, 'numChildren'],
  [/earn money from a job/, 'hasEarnedIncome'],
  [/earn in a year/, 'income'],
  [/rent or own/, 'housing'],
  [/Which of these do you receive/, 'benefits'],
  [/60 or older/, 'hasOlderMember'],
  [/residency rule/, 'resident'],
];

const advance = (page: Page) => page.getByRole('button', { name: /^(Next|See results|None of these)$/ }).click();

/** Answers the question currently on screen. */
export async function answerCurrent(page: Page, a: FlowAnswers): Promise<keyof FlowAnswers> {
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(new RegExp(QUESTIONS.map(([re]) => re.source).join('|')));
  const heading = (await h1.textContent()) ?? '';
  const entry = QUESTIONS.find(([re]) => re.test(heading));
  if (!entry) throw new Error(`Unexpected question: ${heading}`);
  const key = entry[1];
  const value = a[key];
  if (value === 'skip') {
    await page.getByRole('button', { name: 'Skip this question' }).click();
    return key;
  }
  if (key === 'householdSize' || key === 'numChildren') {
    await page.getByRole('textbox').fill(value as string);
  } else if (key === 'income') {
    const income = value as { band: string } | { exact: string };
    if ('band' in income) await page.getByLabel(income.band, { exact: true }).check();
    else {
      await page.getByLabel('I know the exact amount').check();
      await page.getByLabel('Yearly household income').fill(income.exact);
    }
  } else if (key === 'benefits') {
    for (const label of value as string[]) await page.getByLabel(label, { exact: true }).check();
    // A press that lands right after the question changed, with nothing done on it, is taken as a double
    // press on the question before and ignored: a person needs a moment to read "none of these".
    if ((value as string[]).length === 0) await page.waitForTimeout(350);
  } else {
    if (key === 'resident') await expect(page.getByText('This answer never leaves your device. You can skip it.')).toBeVisible();
    await page.getByLabel(value as string, { exact: true }).check();
  }
  await advance(page);
  return key;
}

/** Completes Quick Check with pointer/touch-style interactions (clicks and typing). */
export async function completeQuickCheck(page: Page, overrides: Partial<FlowAnswers> = {}): Promise<void> {
  const a = { ...DEFAULT_ANSWERS, ...overrides };
  await page.getByRole('button', { name: 'Start Quick Check' }).click();
  for (let i = 0; i < QUESTIONS.length; i++) await answerCurrent(page, a);
  await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
}

export const verdictOf = (page: Page, programId: string) => page.getByTestId(`program-${programId}`);

/** Reads the app's IndexedDB contents (counts plus raw record bytes as latin1 text). */
export async function readStore(page: Page): Promise<{ exists: boolean; records: number; keys: number; bytes: string }> {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name);
    if (!names.includes('silhouette')) return { exists: false, records: 0, keys: 0, bytes: '' };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('silhouette');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) return resolve([]);
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const records = (await all('records')) as { data: ArrayBuffer }[];
    const keys = await all('keys');
    db.close();
    const bytes = records.map((r) => new TextDecoder('latin1').decode(new Uint8Array(r.data))).join('|');
    return { exists: true, records: records.length, keys: keys.length, bytes };
  });
}

const LANGUAGE_NAMES = { en: 'English', es: 'Español', ko: '한국어' } as const;

/** Changes the app language through the header's language sheet. */
export async function chooseLanguage(page: Page, locale: keyof typeof LANGUAGE_NAMES): Promise<void> {
  await page.getByTestId('language-button').click();
  await page.getByRole('radio', { name: LANGUAGE_NAMES[locale] }).click();
}

/**
 * Opens "Delete everything" from where people find it: the record of what left this device (or, with
 * `from: 'demo'`, the demo-rules sheet). Returns the confirmation dialog.
 */
export async function openDeleteEverything(page: Page, from: 'record' | 'demo' = 'record') {
  if (from === 'demo') {
    await page.getByTestId('demo-banner').getByRole('button', { name: 'More' }).click();
    await page.getByTestId('demo-sheet').getByRole('button', { name: 'Delete everything' }).click();
  } else {
    const bar = page.getByTestId('leaving-bar');
    if ((await bar.getAttribute('data-open')) !== 'true') await bar.getByRole('button', { name: 'Details' }).click();
    await bar.getByRole('button', { name: 'Delete everything' }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Delete everything on this device?' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Confirms with one press the values in view: those that decide the result (the other values are folded away
 * as not used for it), or every value once they are opened.
 */
export async function confirmAllValues(page: Page): Promise<void> {
  const confirmAll = page.getByRole('button', { name: /^Confirm (all \d+ values|\d+ value|the \d+ values that decide the result|the value that decides the result)$/ });
  await expect(confirmAll).toBeVisible();
  await confirmAll.click();
  await expect(confirmAll).toHaveCount(0);
}
