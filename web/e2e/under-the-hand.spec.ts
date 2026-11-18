// How the interface behaves under the hand (shared/design/DESIGN.md section 8): what opens comes into
// view and takes focus, messages are seen, fields only take what they can use, the primary action shows
// whether it is ready, and a double press does not answer the next question.
import { expect, test, type Page } from '@playwright/test';
import { answerCurrent, DEFAULT_ANSWERS } from './helpers';

const next = (page: Page) => page.getByRole('button', { name: /^(Next|See results|None of these)$/ });

/** Whether the element is fully inside the part of the screen the dock does not cover. */
async function clearOfDock(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const box = el.getBoundingClientRect();
    const dock = document.querySelector('[data-testid="bottom-block"]')?.getBoundingClientRect();
    const wide = window.innerWidth >= 808;
    const bottom = wide || !dock ? window.innerHeight : dock.top;
    return box.top >= 0 && box.bottom <= bottom + 1;
  }, selector);
}

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Quick Check' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How many people/);
}

test('the primary action is quiet until there is an answer, and says what it records', async ({ page }) => {
  await start(page);
  await expect(next(page)).toHaveAttribute('data-ready', 'false');
  await page.getByRole('textbox').fill('3');
  await expect(next(page)).toHaveAttribute('data-ready', 'true');
  await next(page).click();
  await answerCurrent(page, DEFAULT_ANSWERS); // children
  await answerCurrent(page, DEFAULT_ANSWERS); // earned income
  await answerCurrent(page, DEFAULT_ANSWERS); // income
  await answerCurrent(page, DEFAULT_ANSWERS); // housing
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Which of these do you receive/);
  // Nothing ticked is an answer here, and the action says which.
  await expect(page.getByRole('button', { name: 'None of these' })).toHaveAttribute('data-ready', 'true');
  await page.getByRole('checkbox').first().check();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
});

test('a whole-number field takes digits only and says at once when the number is outside its range', async ({ page }) => {
  await start(page);
  const field = page.getByRole('textbox');
  await field.pressSequentially('a1b');
  await expect(field).toHaveValue('1');
  await field.fill('');
  await field.pressSequentially('0');
  await expect(page.getByRole('alert')).toContainText('whole number from 1 to 20');
  // The message stands in the place of the range hint: the sentence is on the screen once.
  await expect(page.getByText('Enter a whole number from 1 to 20.').filter({ visible: true })).toHaveCount(1);
  await expect(next(page)).toHaveAttribute('data-ready', 'false');
  await field.fill('');
  await field.pressSequentially('217');
  await expect(field).toHaveValue('21');
  await expect(page.getByRole('alert')).toContainText('whole number from 1 to 20');
  await expect(page.getByRole('button', { name: 'One more' })).toBeDisabled();
  await page.getByRole('button', { name: 'One less' }).click();
  await expect(field).toHaveValue('20');
  await expect(page.locator('.error')).toHaveText('');
  await expect(page.getByText('Enter a whole number from 1 to 20.').filter({ visible: true })).toHaveCount(1);
});

test('a refused Next shows its message in view, answers every press, and choosing does not move the page', async ({ page }) => {
  await page.goto('/#/q/income');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/earn in a year/);
  await next(page).click();
  await expect(page.getByRole('alert')).toContainText('Choose an answer');
  await expect(page.locator('fieldset')).toHaveAttribute('data-error', 'true');
  await expect.poll(() => clearOfDock(page, '.error')).toBe(true);
  await next(page).click();
  await expect.poll(() => clearOfDock(page, '.error')).toBe(true);
  const before = await page.evaluate(() => window.scrollY);
  await page.locator('label.range').first().click();
  await expect(page.getByRole('alert')).toHaveText('');
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test('the exact amount opens in view with focus, and only takes money', async ({ page }) => {
  await page.goto('/#/q/income');
  await page.getByLabel('I know the exact amount').check();
  const field = page.getByLabel('Yearly household income');
  await expect(field).toBeFocused();
  await expect.poll(() => clearOfDock(page, '[data-testid="exact-field"]')).toBe(true);
  await field.pressSequentially('ab$28,0x00.5');
  await expect(field).toHaveValue('28,000.5');
  await expect(page.getByTestId('amount-understood')).toHaveText('Understood as $28,000.50 a year.');
  await expect(next(page)).toHaveAttribute('data-ready', 'true');
});

test('a double press on Next does not answer the question after', async ({ page }) => {
  await start(page);
  await page.getByRole('textbox').fill('3');
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button.action[type="submit"]');
    button?.click();
  });
  // The second press lands on the next question's button, at once.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How many children/);
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('button.action[type="submit"]')?.click());
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How many children/);
  await expect(page.locator('.error')).toHaveText('');
});

test('a sheet locks the page behind it, closes with Escape and gives focus back', async ({ page }) => {
  await page.goto('/');
  const details = page.getByRole('button', { name: 'Details' });
  await details.click();
  await expect(page.getByTestId('record-sheet')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-sheet')).toBeHidden();
  await expect(details).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');
});

test('the paste box opens in view and takes focus', async ({ page }) => {
  await page.goto('/#/doc');
  await page.getByRole('button', { name: /Paste the text/ }).click();
  await expect(page.locator('.paste-box textarea')).toBeFocused();
  await expect.poll(() => clearOfDock(page, '.paste-box')).toBe(true);
});

test('with reduced motion nothing travels: the next question is simply there', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await page.getByRole('textbox').fill('3');
  await next(page).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/How many children/);
  const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(moving).toBe(0);
});
