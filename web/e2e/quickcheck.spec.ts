import { expect, test } from '@playwright/test';
import { DEFAULT_ANSWERS, answerCurrent, completeQuickCheck, readStore, verdictOf } from './helpers';

const PROGRAMS = ['work-credit', 'food-help', 'utility-discount', 'phone-discount', 'senior-food'];

test.describe('Quick Check to first result', () => {
  test('(1) a fresh profile completes Quick Check and reaches verdicts; nothing leaves the origin', async ({ page, baseURL }) => {
    const requests: { url: string; method: string }[] = [];
    page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));

    await page.goto('/');
    await expect(page.getByText('Demo rules — not real programs')).toBeVisible();
    await expect(page.getByTestId('leaving-bar')).toContainText('Nothing has left this device.');
    expect(await readStore(page)).toMatchObject({ records: 0 });

    await completeQuickCheck(page);
    for (const id of PROGRAMS) await expect(verdictOf(page, id)).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'work-credit')).toContainText('About 3,000 a year');
    await expect(verdictOf(page, 'senior-food')).toContainText('About 1,830 a year');
    await expect(page.getByTestId('leaving-bar')).toHaveAttribute('data-outbound-count', '0');

    const origin = new URL(baseURL!).origin;
    expect(requests.filter((r) => new URL(r.url).origin !== origin), 'requests to other origins').toEqual([]);
    expect(requests.filter((r) => r.method !== 'GET'), 'non-GET requests').toEqual([]);
  });

  test('(2) the same flow works with the network disabled after first load', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    const started = Date.now();
    await completeQuickCheck(page, { numChildren: '1', income: { band: '30,000 to 44,999' } });
    // Band-only income: the engine returns `maybe` where a threshold falls inside the band.
    await expect(verdictOf(page, 'work-credit')).toHaveAttribute('data-verdict', 'maybe');
    await expect(verdictOf(page, 'utility-discount')).toHaveAttribute('data-verdict', 'likely');
    expect(Date.now() - started).toBeLessThan(60_000);
    await context.setOffline(false);
  });

  test('(3) skipping the sensitive question gives depends with the reason, and answering it later updates the verdict', async ({ page }) => {
    await page.goto('/');
    await completeQuickCheck(page, {
      householdSize: '1',
      numChildren: '0',
      income: { exact: '19000' },
      housing: 'Something else',
      resident: 'skip',
    });
    const food = verdictOf(page, 'food-help');
    await expect(food).toHaveAttribute('data-verdict', 'depends');
    await expect(food).toContainText('Depends on: Residency');

    await food.getByRole('link').click();
    const card = page.getByTestId('verdict-card');
    await expect(card).toHaveAttribute('data-verdict', 'depends');
    await expect(card.getByText('Depends on an answer you skipped')).toBeVisible();
    await expect(card.locator('[data-state="unknown"]')).toContainText('You meet the residency rule');

    await page.getByRole('button', { name: 'Answer: Residency' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/residency rule/);
    await page.getByLabel('Yes', { exact: true }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('verdict-card')).toHaveAttribute('data-verdict', 'likely');
  });

  test('multi question: "none" differs from skipping, and a qualifying benefit passes without income', async ({ page }) => {
    await page.goto('/');
    await completeQuickCheck(page, { income: 'skip', benefits: 'skip' });
    await expect(verdictOf(page, 'phone-discount')).toHaveAttribute('data-verdict', 'depends');
    await expect(verdictOf(page, 'phone-discount')).toContainText('Benefits you receive');

    await page.goto('/#/q/benefits?then=results');
    await page.getByRole('button', { name: 'Next' }).click(); // nothing ticked = "none of these"
    await expect(verdictOf(page, 'phone-discount')).toHaveAttribute('data-verdict', 'depends');
    await expect(verdictOf(page, 'phone-discount')).toContainText('Depends on: Yearly income');
    await expect(verdictOf(page, 'phone-discount')).not.toContainText('Benefits you receive');

    await page.goto('/#/q/benefits?then=results');
    await page.getByLabel('Food benefits (SNAP)').check();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(verdictOf(page, 'phone-discount')).toHaveAttribute('data-verdict', 'likely');
  });

  test('an estimated amount of 0 is not shown', async ({ page }) => {
    await page.goto('/');
    await completeQuickCheck(page, { income: { exact: '0' } });
    await expect(verdictOf(page, 'work-credit')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'work-credit')).not.toContainText('a year');
    await verdictOf(page, 'work-credit').getByRole('link').click();
    await expect(page.getByText(/Estimated amount/)).toHaveCount(0);
  });

  test('(4) "Delete everything" clears the encrypted store', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Quick Check' }).click();
    const answers = { ...DEFAULT_ANSWERS, householdSize: '4', income: { exact: '87654' } };
    for (let i = 0; i < 4; i++) await answerCurrent(page, answers);
    await page.getByLabel('Language').selectOption('es');
    await page.getByLabel('Idioma').selectOption('en');

    await expect.poll(async () => (await readStore(page)).records).toBe(1);
    const before = await readStore(page);
    expect(before.keys).toBe(1);
    expect(before.bytes).not.toContain('87654');
    expect(before.bytes).not.toContain('householdSize');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('silhouette.')))).toEqual(['silhouette.locale']);

    await page.getByRole('button', { name: 'Delete everything' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete everything on this device?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete everything' }).click();
    await expect(page.getByText('Everything on this device was deleted.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Quick Check' })).toBeVisible();

    expect(await readStore(page)).toMatchObject({ exists: false, records: 0, keys: 0 });
    // Only the time of the deletion is kept, so the bar can say the record was deleted.
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('silhouette.')))).toEqual(['silhouette.ledger-cleared-at']);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Start Quick Check' })).toBeVisible();
    expect(await readStore(page)).toMatchObject({ records: 0, keys: 0 });
  });

  test('(5) Quick Check can be completed with the keyboard only', async ({ page }) => {
    await page.goto('/');
    const focusedName = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        const labelled = el.getAttribute('aria-label');
        if (labelled) return labelled;
        if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) return el.closest('label')?.textContent ?? '';
        if (el instanceof HTMLInputElement) return `input:${el.getAttribute('aria-labelledby') ? 'labelled' : el.id}`;
        return el.textContent?.trim() ?? '';
      });
    /** Presses Tab until the focused element's name matches (keyboard only; no clicks). */
    const tabTo = async (pattern: RegExp, max = 40) => {
      for (let i = 0; i < max; i++) {
        await page.keyboard.press('Tab');
        if (pattern.test(await focusedName())) return;
      }
      throw new Error(`could not reach ${pattern} with Tab`);
    };
    const heading = () => page.getByRole('heading', { level: 1 });
    const next = async () => {
      await tabTo(/^(Next|See results)$/);
      await page.keyboard.press('Enter');
    };

    await tabTo(/^Start Quick Check$/);
    await page.keyboard.press('Enter');
    await expect(heading()).toBeFocused();
    await tabTo(/^input:labelled$/);
    await page.keyboard.type('2');
    await page.keyboard.press('Enter');

    await expect(heading()).toHaveText(/How many children/);
    await tabTo(/^One more$/);
    await page.keyboard.press('Enter'); // 0
    await page.keyboard.press('Enter'); // 1
    await next();

    await expect(heading()).toHaveText(/earn money from a job/);
    await tabTo(/^Yes$/);
    await page.keyboard.press('Space');
    await next();

    await expect(heading()).toHaveText(/earn in a year/);
    await tabTo(/Less than 15,000/);
    await page.keyboard.press('Space'); // Band A: below every food-help limit, so only residency is open.
    await next();

    await expect(heading()).toHaveText(/rent or own/);
    await tabTo(/I rent/);
    await page.keyboard.press('Space');
    await next();

    await expect(heading()).toHaveText(/Which of these do you receive/);
    await tabTo(/Medicaid/);
    await page.keyboard.press('Space');
    await next();

    await expect(heading()).toHaveText(/60 or older/);
    await tabTo(/^Yes$/); // A radio group is one tab stop; arrow keys move within it.
    await page.keyboard.press('ArrowDown'); // selects "No"
    await next();

    await expect(heading()).toHaveText(/residency rule/);
    await tabTo(/^Skip this question$/);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeFocused();
    await expect(verdictOf(page, 'utility-discount')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'phone-discount')).toHaveAttribute('data-verdict', 'likely');
    await expect(verdictOf(page, 'food-help')).toHaveAttribute('data-verdict', 'depends');

    await tabTo(/Test Food Help/);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('verdict-card')).toHaveAttribute('data-verdict', 'depends');
    await expect(page.getByRole('heading', { level: 1, name: 'Test Food Help' })).toBeFocused();
  });

  test('language switch shows es and ko copy and persists', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Language').selectOption('es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Encuentra ayudas públicas para las que podrías calificar');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.getByLabel('Idioma').selectOption('ko');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('받을 수 있을지도 모르는 공공 지원을 찾아보세요');
    await expect(page.getByText('기기 밖으로 나가는 정보')).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });
});
