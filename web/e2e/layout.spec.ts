// Layout and presentation: the wide two-column layout, the review screen's order, the preview that
// wraps instead of scrolling sideways, the exact amount kept above the block, and answers written on
// this device counted as kept.
import { expect, test, type Page } from '@playwright/test';
import { completeQuickCheck, confirmAllValues } from './helpers';
import { fakeCloudModel, fakeOnDeviceModel, fixturePointers, noOnDeviceModel } from './model-fakes';

const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

test.describe('layout', () => {
  for (const width of [808, 1280, 1440]) {
    test(`from 808 px the ink rail (248 px) runs down the left and the content stands beside it (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const columns: number[] = [];
      const measure = async () => {
        const foot = await box(page, 'bottom-block');
        expect(Math.round(foot.x)).toBe(0);
        expect(Math.round(foot.width)).toBe(248);
        expect(Math.round(foot.y + foot.height)).toBe(900);
        const top = (await page.locator('.rail-top').boundingBox())!;
        expect(Math.round(top.x)).toBe(0);
        expect(Math.round(top.width)).toBe(248);
        expect(Math.round(top.y)).toBe(0);
        const main = (await page.locator('main').boundingBox())!;
        expect(main.x, 'the content starts beside the rail').toBeGreaterThanOrEqual(248);
        const screen = (await page.locator('main > *').first().boundingBox())!;
        expect(screen.width).toBeLessThanOrEqual(1100);
        columns.push(Math.round(screen.x));
      };
      await measure();
      await expect(page.getByRole('navigation', { name: 'Steps' }).getByRole('link', { name: 'Quick Check' })).toHaveAttribute('aria-current', 'step');
      await page.getByRole('button', { name: 'Start Quick Check' }).click();
      await measure();
      await page.goto('/');
      await completeQuickCheck(page);
      await measure();
      await expect(page.getByRole('navigation', { name: 'Steps' }).getByRole('link', { name: 'Results' })).toHaveAttribute('aria-current', 'step');
      // The same left edge on every screen: nothing moves sideways.
      expect(new Set(columns).size).toBe(1);
    });
  }

  test('wide screens: sheets open as a centred modal, at most 520 px wide', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByTestId('language-button').click();
    const sheet = await box(page, 'language-sheet');
    expect(sheet.width).toBeLessThanOrEqual(520);
    expect(Math.abs(sheet.x + sheet.width / 2 - 720)).toBeLessThanOrEqual(1);
    expect(Math.abs(sheet.y + sheet.height / 2 - 450)).toBeLessThanOrEqual(1);
  });

  test('wide screens with a keyboard: Y and N answer a yes / no question, S skips, Enter continues', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'the hints are for a fine pointer and a keyboard');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/q/hasEarnedIncome');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toHaveText(/earn money from a job/);
    await page.keyboard.press('y');
    await expect(page.getByRole('radio', { name: 'Yes' })).toBeChecked();
    await page.keyboard.press('n');
    await expect(page.getByRole('radio', { name: 'No' })).toBeChecked();
    await page.getByRole('radio', { name: 'No' }).press('Enter');
    await expect(heading).not.toHaveText(/earn money from a job/);
    const next = (await heading.textContent()) ?? '';
    await page.keyboard.press('s');
    await expect(heading).not.toHaveText(next);
    await expect(page.getByTestId('screen-actions').locator('kbd')).toHaveText(['Enter', 'S']);
  });

  for (const size of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    test(`the exact amount and how it was understood are fully above the block (${size.width} × ${size.height})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/#/q/income');
      await page.getByLabel('I know the exact amount').check();
      const field = page.getByLabel('Yearly household income');
      await field.fill('28000.50');
      await expect(page.getByTestId('amount-understood')).toHaveText('Understood as $28,000.50 a year.');
      await expect
        .poll(async () => {
          const [f, block] = await Promise.all([page.getByTestId('exact-field').boundingBox(), page.getByTestId('bottom-block').boundingBox()]);
          const ok = f!.y >= 0 && f!.y + f!.height <= block!.y + 1;
          return ok ? true : `field ${Math.round(f!.y)}..${Math.round(f!.y + f!.height)}, block from ${Math.round(block!.y)}`;
        })
        .toBe(true);
    });
  }
});

test.describe('documents', () => {
  test('review: what decides the result first, the rest folded until seen; nothing is confirmed unseen', async ({ page, context }) => {
    await noOnDeviceModel(context);
    await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const lead = page.getByTestId('lead-fields');
    // The date shown first is the one the yearly income uses: the period end (the sample has one).
    for (const name of ['grossPay', 'ytdGross', 'periodEnd', 'payFrequency']) await expect(lead.getByTestId(`field-${name}`)).toBeVisible();
    await expect(lead.getByTestId('field-payDate')).toHaveCount(0);
    const more = page.getByTestId('more-values');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('field-hoursWorked')).toBeHidden();
    const confirmAll = page.getByRole('button', { name: /^Confirm all \d+ values$/ });
    const count = Number(/(\d+)/.exec((await confirmAll.textContent()) ?? '')?.[1]);
    expect(count).toBeGreaterThan(10);
    // First press: the folded values are shown, nothing is confirmed yet.
    await confirmAll.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('field-hoursWorked')).toBeVisible();
    await expect(page.getByTestId('field-hoursWorked')).toHaveAttribute('data-status', 'pending');
    await confirmAll.click();
    await expect(page.getByTestId('field-hoursWorked')).toHaveAttribute('data-status', 'confirmed');
    await page.getByRole('button', { name: 'Check these values' }).click();
    // The yearly income, with its arithmetic, comes right after the leading values, as money.
    await expect(page.getByTestId('annual-income')).toHaveText(/^\$[\d,]+$/);
  });

  test('preview on a phone: no line breaks (the card scrolls sideways, the page does not), chips are compact, both views show the same placeholders', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await noOnDeviceModel(context);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    const doc = page.getByTestId('skeleton-preview');
    await expect(doc).toHaveAttribute('data-mode', 'leave');
    expect(await doc.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre');
    expect(await doc.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // A chip is as wide as its id (N12), never stretched to the width of the value it hides.
    const chips = await doc.locator('.tok').evaluateAll((els) => els.map((e) => [e.textContent ?? '', e.getBoundingClientRect().width] as const));
    for (const [id, width] of chips) expect(width, id).toBeLessThan(id.length * 9 + 16);
    await page.getByRole('button', { name: 'On this device', exact: true }).click();
    await expect(doc).toHaveAttribute('data-mode', 'phone');
    expect(await doc.locator('.tok').count()).toBe(chips.length);
  });

  test('wide screens: the two documents stand side by side and no line of them breaks', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', 'a wide layout');
    await page.setViewportSize({ width: 1440, height: 900 });
    await noOnDeviceModel(context);
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    const docs = page.locator('.preview-pair .doc');
    await expect(docs).toHaveCount(2);
    const [a, b] = [(await docs.nth(0).boundingBox())!, (await docs.nth(1).boundingBox())!];
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    for (let i = 0; i < 2; i++) expect(await docs.nth(i).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre');
  });

  test('an answer written on this device is recorded as kept: no host, no body, not counted as sent', async ({ page, context }) => {
    await fakeOnDeviceModel(context, { availability: 'available', replies: { 'Document type: paystub': JSON.stringify(fixturePointers('paystub-en-01-correct')) } });
    await page.goto('/#/doc');
    await page.getByRole('button', { name: 'English paystub (text)' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByTestId('inference-badge')).toHaveAttribute('data-source', 'ON_DEVICE');
    const bar = page.getByTestId('leaving-bar');
    await expect(bar).toHaveAttribute('data-outbound-count', '0');
    await expect(bar).toHaveAttribute('data-kept-count', '1');
    await expect(bar.locator('.count-row')).toContainText('Nothing has left this device.');
    await bar.getByRole('button', { name: 'Details' }).click();
    await expect(page.getByTestId('record-headline')).toHaveText('0 sent, 1 kept.');
    const kept = bar.locator('li[data-status="answered"]');
    await expect(kept).toHaveCount(1);
    await expect(kept).toContainText('Answered on this device');
    await expect(kept).not.toContainText('Request to');
    await expect(kept.getByRole('button', { name: 'Show exactly what was sent' })).toHaveCount(0);
  });
});

test('confirming values is still possible from the keyboard after the fold opens', async ({ page, context }) => {
  await noOnDeviceModel(context);
  await fakeCloudModel(page, { pointers: fixturePointers('paystub-en-01-correct') });
  await page.goto('/#/doc');
  await page.getByRole('button', { name: 'English paystub (text)' }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await confirmAllValues(page);
  await expect(page.getByRole('button', { name: 'Check these values' })).toBeEnabled();
});

test.describe('first impression and sheets', () => {
  test('the start screen says the promise in words, labels the example, and keeps the main action above the fold at 320 x 568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await expect(page.getByTestId('start-promise')).toBeVisible();
    await expect(page.getByTestId('start-example')).toContainText('Example');
    const action = await page.getByRole('button', { name: 'Start Quick Check' }).boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(568);
  });

  test('the ground colour of both themes is in the document head, so nothing flashes white', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<style>html\{color-scheme:light dark;background:#[0-9A-Fa-f]{6}\}@media \(prefers-color-scheme: dark\)\{html\{background:#[0-9A-Fa-f]{6}\}\}<\/style>/);
  });

  test('the count stays in view in every sheet; the record traps focus and returns it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('language-button').click();
    await expect(page.getByTestId('language-sheet').getByTestId('sheet-count')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('demo-banner').getByRole('button', { name: 'More' }).click();
    await expect(page.getByTestId('demo-sheet').getByTestId('sheet-count').last()).toBeInViewport();
    await page.keyboard.press('Escape');
    // Exact: while the sheet is leaving, its own "Hide details" button is still there for a moment.
    const details = page.getByTestId('leaving-bar').getByRole('button', { name: 'Details', exact: true });
    await details.click();
    const record = page.getByTestId('record-sheet');
    await expect(record).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      // A modal sheet: focus never reaches the page behind it (it may pass to the browser's own controls).
      expect(await page.evaluate(() => {
        const a = document.activeElement;
        return a === null || a === document.body || a.closest('[data-testid="record-sheet"]') !== null;
      })).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
  });

  test('selection is ink, not pink, and "0 sent" is not pink', async ({ page }) => {
    await page.goto('/#/q/income');
    await page.getByLabel('$15,000 to $29,999', { exact: true }).check();
    const radio = page.getByLabel('$15,000 to $29,999', { exact: true });
    const [bg, leave] = await radio.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--leave')]);
    expect(bg).not.toBe(leave);
    expect(bg).not.toMatch(/rgb\(2[0-9]{2}, 1[0-9]{2}, 2[0-9]{2}\)/);
  });
});

test('at 768 px the column is centred and the block floats, not a full-width bar', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  const block = (await page.getByTestId('bottom-block').boundingBox())!;
  expect(block.width).toBeLessThanOrEqual(640);
  expect(Math.round(block.x)).toBe(Math.round((768 - block.width) / 2));
});
